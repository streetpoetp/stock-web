"use strict";

(function () {
  const EXPECTED_SCHEMA_VERSION = 1;
  const REQUIRED_COLUMNS = {
    schema_meta: ["version"],
    securities: ["code", "name", "exchange", "status"],
    daily_bars: [
      "code", "trade_date", "open", "high", "low", "close", "volume",
      "adjusted_close", "traded", "source",
    ],
    data_days: ["trade_date", "ready", "security_count", "bar_count", "issue"],
    scan_runs: [
      "trade_date", "config_fingerprint", "scanned_count", "candidate_count",
    ],
    candidates: [
      "trade_date", "code", "name", "exchange", "state", "score", "close",
      "dif", "dea", "histogram", "previous_histogram", "window_length",
      "contraction", "linearity", "consistency", "recent_convergence",
    ],
  };

  let sqlPromise = null;
  let current = null;

  function getSql() {
    if (!sqlPromise) {
      if (typeof window.initSqlJs !== "function") {
        throw new Error("sql.js is not loaded");
      }
      sqlPromise = window.initSqlJs();
    }
    return sqlPromise;
  }

  function rows(db, sql, params) {
    const statement = db.prepare(sql);
    try {
      if (params && params.length) {
        statement.bind(params);
      }
      const result = [];
      while (statement.step()) {
        result.push(statement.getAsObject());
      }
      return result;
    } finally {
      statement.free();
    }
  }

  function scalar(db, sql, params) {
    const result = rows(db, sql, params);
    if (!result.length) {
      return null;
    }
    const values = Object.values(result[0]);
    return values.length ? values[0] : null;
  }

  function validateSchema(db) {
    const tableRows = rows(
      db,
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const tables = new Set(tableRows.map((item) => String(item.name)));
    for (const table of Object.keys(REQUIRED_COLUMNS)) {
      if (!tables.has(table)) {
        throw new Error("Incompatible scanner database: missing table " + table);
      }
    }

    const version = Number(scalar(db, "SELECT version FROM schema_meta LIMIT 1"));
    if (version !== EXPECTED_SCHEMA_VERSION) {
      throw new Error(
        "Incompatible scanner database schema: expected " +
        EXPECTED_SCHEMA_VERSION + ", got " + version,
      );
    }

    for (const [table, expected] of Object.entries(REQUIRED_COLUMNS)) {
      const actual = new Set(
        rows(db, "PRAGMA table_info(" + table + ")").map(
          (item) => String(item.name),
        ),
      );
      for (const column of expected) {
        if (!actual.has(column)) {
          throw new Error(
            "Incompatible scanner database: missing " + table + "." + column,
          );
        }
      }
    }
    return version;
  }

  function makeSession(db, fileName, schemaVersion) {
    let closed = false;

    function assertOpen() {
      if (closed) {
        throw new Error("Database session is closed");
      }
    }

    const api = {
      fileName,
      schemaVersion,

      close() {
        if (!closed) {
          db.close();
          closed = true;
          if (current === api) {
            current = null;
          }
        }
      },

      summary() {
        assertOpen();
        const latestReadyDate = scalar(
          db,
          "SELECT MAX(trade_date) FROM data_days WHERE ready=1",
        );
        const latestScan = rows(
          db,
          "SELECT trade_date, scanned_count, candidate_count " +
          "FROM scan_runs ORDER BY trade_date DESC LIMIT 1",
        )[0] || null;
        return {
          schemaVersion,
          latestReadyDate: latestReadyDate || null,
          latestScanDate: latestScan ? latestScan.trade_date : null,
          scannedCount: latestScan ? Number(latestScan.scanned_count) : 0,
          candidateCount: latestScan ? Number(latestScan.candidate_count) : 0,
          securityCount: Number(
            scalar(db, "SELECT COUNT(*) FROM securities WHERE status='listed'") || 0,
          ),
        };
      },

      scanDates() {
        assertOpen();
        return rows(
          db,
          "SELECT trade_date, scanned_count, candidate_count " +
          "FROM scan_runs ORDER BY trade_date DESC",
        );
      },

      candidates(tradeDate) {
        assertOpen();
        return rows(
          db,
          "SELECT * FROM candidates WHERE trade_date=? " +
          "ORDER BY score DESC, code",
          [tradeDate],
        );
      },

      candidate(tradeDate, code) {
        assertOpen();
        return rows(
          db,
          "SELECT * FROM candidates WHERE trade_date=? AND code=? LIMIT 1",
          [tradeDate, code],
        )[0] || null;
      },

      securities(searchText, limit) {
        assertOpen();
        const query = String(searchText || "").trim();
        const cappedLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));
        if (!query) {
          return rows(
            db,
            "SELECT code, name, exchange, status, trading FROM securities " +
            "WHERE status='listed' ORDER BY code LIMIT ?",
            [cappedLimit],
          );
        }
        const pattern = "%" + query + "%";
        return rows(
          db,
          "SELECT code, name, exchange, status, trading FROM securities " +
          "WHERE status='listed' AND (code LIKE ? OR name LIKE ?) " +
          "ORDER BY code LIMIT ?",
          [pattern, pattern, cappedLimit],
        );
      },

      security(code) {
        assertOpen();
        return rows(
          db,
          "SELECT * FROM securities WHERE code=? LIMIT 1",
          [code],
        )[0] || null;
      },

      history(code, options) {
        assertOpen();
        const settings = options || {};
        const limit = Math.max(1, Math.min(Number(settings.limit) || 300, 2000));
        const params = [code];
        let dateClause = "";
        if (settings.endDate) {
          dateClause = " AND trade_date<=?";
          params.push(settings.endDate);
        }
        params.push(limit);
        return rows(
          db,
          "SELECT * FROM (" +
          "SELECT * FROM daily_bars WHERE code=?" + dateClause +
          " ORDER BY trade_date DESC LIMIT ?" +
          ") ORDER BY trade_date",
          params,
        );
      },

      dataDays(limit) {
        assertOpen();
        const cappedLimit = Math.max(1, Math.min(Number(limit) || 120, 1000));
        return rows(
          db,
          "SELECT * FROM data_days ORDER BY trade_date DESC LIMIT ?",
          [cappedLimit],
        );
      },
    };

    return api;
  }

  async function openBytes(bytes, fileName) {
    if (!(bytes instanceof Uint8Array)) {
      bytes = new Uint8Array(bytes);
    }
    const sqliteHeader = [
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
      0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
    ];
    if (
      bytes.length < sqliteHeader.length ||
      sqliteHeader.some((value, index) => bytes[index] !== value)
    ) {
      throw new Error("Selected file is not a SQLite database");
    }
    const SQL = await getSql();
    let db = null;
    try {
      db = new SQL.Database(bytes);
      const schemaVersion = validateSchema(db);
      if (current) {
        current.close();
      }
      current = makeSession(db, fileName || "stock.db", schemaVersion);
      db = null;
      return current;
    } catch (error) {
      if (db) {
        db.close();
      }
      throw error;
    }
  }

  async function openFile(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("Select a SQLite database file");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return openBytes(bytes, file.name || "stock.db");
  }

  async function openHostedSnapshot() {
    const snapshotUrl = new URL("data/latest.db", window.location.href);
    if (snapshotUrl.origin !== window.location.origin) {
      throw new Error("Hosted scanner database must be same-origin");
    }
    const response = await fetch(snapshotUrl.href, {cache: "no-store"});
    if (!response.ok) {
      throw new Error(
        "Hosted scanner database is unavailable (HTTP " + response.status + ")",
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return openBytes(bytes, "latest.db");
  }

  async function startHostedSnapshot() {
    if (window.location.protocol === "file:") return;
    try {
      const session = await openHostedSnapshot();
      document.dispatchEvent(new CustomEvent("stock-database-ready", {detail: session}));
    } catch (error) {
      document.dispatchEvent(new CustomEvent("stock-database-error", {detail: error}));
    }
  }

  function bindFilePicker(input, dropTarget, callbacks) {
    const options = callbacks || {};
    if (!input || typeof input.addEventListener !== "function") {
      throw new Error("A file input element is required");
    }
    const target = dropTarget || input;

    async function handleFile(file) {
      try {
        const session = await openFile(file);
        if (typeof options.onOpened === "function") {
          options.onOpened(session);
        }
        return session;
      } catch (error) {
        if (typeof options.onError === "function") {
          options.onError(error);
        }
        throw error;
      }
    }

    function onChange(event) {
      const file = event.target.files && event.target.files[0];
      if (file) handleFile(file).catch(() => {});
    }

    function onDragOver(event) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    }

    function onDrop(event) {
      event.preventDefault();
      const file = event.dataTransfer &&
        event.dataTransfer.files &&
        event.dataTransfer.files[0];
      if (file) handleFile(file).catch(() => {});
    }

    input.addEventListener("change", onChange);
    target.addEventListener("dragover", onDragOver);
    target.addEventListener("drop", onDrop);

    return {
      open: handleFile,
      dispose() {
        input.removeEventListener("change", onChange);
        target.removeEventListener("dragover", onDragOver);
        target.removeEventListener("drop", onDrop);
      },
    };
  }

  window.StockDb = {
    openBytes,
    openFile,
    openHostedSnapshot,
    bindFilePicker,
    current() {
      return current;
    },
    close() {
      if (current) {
        current.close();
      }
    },
    expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        startHostedSnapshot();
      }, {once: true});
    } else {
      startHostedSnapshot();
    }
  }
}());