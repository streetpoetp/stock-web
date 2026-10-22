"use strict";

(function () {
  const state = {
    session: null,
    summary: null,
    view: "candidates",
    fileBinding: null,
    scanDates: [],
    scanDate: null,
    candidates: [],
    filteredCandidates: [],
    scoreMin: 90,
    stateFilter: "",
    exchangeFilter: "",
    searchText: "",
    candidateTable: null,
    selectedCode: null,
    selectedCandidate: null,
    selectedSecurity: null,
    stockRows: [],
    stockTable: null,
    chartHandles: null,
    selectedHistory: [],
    selectedMacd: [],
    chartError: null,
    backtestReport: null,
    backtestFileName: null,
    candidateDataRevision: 0,
    stockDataRevision: 0,
  };

  let root = null;
  let fileInput = null;
  let backtestInput = null;

  function isHostedLaunch() {
    return window.location.protocol !== "file:";
  }

  function entryShellMarkup() {
    return [
      '<div class="stock-app stock-entry-app" id="stock-drop-zone">',
      '<div id="app-error"></div>',
      '<section id="view-root" class="stock-view stock-entry-view"></section>',
      '<input id="database-file" type="file" accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3" hidden>',
      '<input id="backtest-file" type="file" accept=".json,application/json" hidden>',
      '</div>',
    ].join("");
  }

  function workspaceShellMarkup() {
    return [
      '<div class="stock-app stock-workbench">',
      '<div id="app-error"></div>',
      '<section id="view-root" class="stock-view stock-workspace-view"></section>',
      '<footer class="stock-status-bar" id="stock-status-bar" aria-label="Current data status">',
      '<span class="stock-status-item"><span class="stock-status-dot db"></span>',
      '<strong id="status-db-name">—</strong></span>',
      '<span class="stock-status-item"><span class="stock-status-dot ready"></span>',
      '<strong id="status-ready-state">READY</strong></span>',
      '<span class="stock-status-spacer"></span>',
      '<span class="stock-status-item">Data <strong id="status-data-date">—</strong></span>',
      '<span class="stock-status-item">Scan <strong id="status-scan-date">—</strong></span>',
      '<span class="stock-status-item"><strong id="status-candidate-count">0</strong> candidates</span>',
      '<span class="stock-status-item"><strong id="status-stock-count">0</strong> stocks</span>',
      '</footer>',
      '<input id="backtest-file" type="file" accept=".json,application/json" hidden>',
      '</div>',
    ].join("");
  }

  function bindBacktestInput() {
    backtestInput = root.querySelector("#backtest-file");
    if (!backtestInput) return;
    backtestInput.addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      if (file) openBacktestFile(file).catch(function () {});
      event.target.value = "";
    });
  }

  function renderShell() {
    root.innerHTML = entryShellMarkup();
    fileInput = root.querySelector("#database-file");
    bindBacktestInput();

    const dropZone = root.querySelector("#stock-drop-zone");
    state.fileBinding = StockDb.bindFilePicker(fileInput, dropZone, {
      onOpened: onDatabaseOpened,
      onError: showError,
    });
    ["dragenter", "dragover"].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function () {
        dropZone.classList.add("stock-drop-active");
      });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function () {
        dropZone.classList.remove("stock-drop-active");
      });
    });
    renderView();
  }

  function renderWorkspaceShell() {
    if (state.fileBinding && typeof state.fileBinding.dispose === "function") {
      state.fileBinding.dispose();
    }
    state.fileBinding = null;
    fileInput = null;
    root.innerHTML = workspaceShellMarkup();
    bindBacktestInput();
  }

  function showError(error) {
    const holder = root.querySelector("#app-error");
    holder.innerHTML = "";
    const alert = document.createElement("div");
    alert.className = "alert alert-danger stock-error";
    alert.setAttribute("role", "alert");
    alert.textContent = error instanceof Error ? error.message : String(error);
    holder.appendChild(alert);
  }

  function clearError() {
    root.querySelector("#app-error").innerHTML = "";
  }

  function updateStatusBar() {
    if (!state.session || !state.summary) return;
    const dbName = root.querySelector("#status-db-name");
    const readyState = root.querySelector("#status-ready-state");
    const dataDate = root.querySelector("#status-data-date");
    const scanDate = root.querySelector("#status-scan-date");
    const candidateCount = root.querySelector("#status-candidate-count");
    const stockCount = root.querySelector("#status-stock-count");
    if (dbName) dbName.textContent = state.session.fileName;
    if (readyState) readyState.textContent = state.summary.latestReadyDate ? "READY" : "NOT READY";
    if (dataDate) dataDate.textContent = state.summary.latestReadyDate || "none";
    if (scanDate) scanDate.textContent = state.summary.latestScanDate || "none";
    if (candidateCount) candidateCount.textContent = String(state.summary.candidateCount || 0);
    if (stockCount) stockCount.textContent = String(state.summary.securityCount || 0);
  }

  function setView(view) {
    state.view = view;
    root.querySelectorAll("[data-view]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.view === view);
    });
    renderView();
  }

  function renderEmpty() {
    root.querySelector("#view-root").innerHTML = [
      '<div class="stock-empty"><div class="stock-empty-content">',
      '<div class="stock-empty-icon">▣</div>',
      '<h2>Open your scanner database</h2>',
      '<p>Select or drop <strong>data/stock.db</strong>. The database stays local ',
      'to this browser session and is opened read-only.</p>',
      '<button class="btn btn-primary" type="button" id="empty-open-db">Open stock.db</button>',
      '</div></div>',
    ].join("");
    root.querySelector("#empty-open-db").addEventListener("click", function () {
      fileInput.click();
    });
  }

  function renderPlaceholder(title, description) {
    root.querySelector("#view-root").innerHTML = [
      '<section class="stock-panel">',
      '<header class="stock-panel-header"><h2 class="stock-panel-title"></h2></header>',
      '<div class="p-4 stock-muted" id="placeholder-copy"></div>',
      '</section>',
    ].join("");
    root.querySelector(".stock-panel-title").textContent = title;
    root.querySelector("#placeholder-copy").textContent = description;
  }

  function escapeOption(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function candidateDateOptions() {
    return state.scanDates.map(function (item) {
      const selected = item.trade_date === state.scanDate ? " selected" : "";
      const label = item.trade_date + " (" + item.candidate_count + ")";
      return '<option value="' + escapeOption(item.trade_date) + '"' +
        selected + ">" + escapeOption(label) + "</option>";
    }).join("");
  }

  function renderCandidateDetailPlaceholder() {
    const panel = root.querySelector("#stock-detail-panel");
    if (!panel) return;
    panel.innerHTML = [
      '<header class="stock-panel-header">',
      '<h2 class="stock-panel-title">Stock Detail</h2>',
      '</header>',
      '<div class="stock-detail-empty">',
      '<div><strong>Select a candidate</strong><br>',
      '<span class="stock-muted">Price, MACD, wedge metrics, and latest values appear here.</span></div>',
      '</div>',
    ].join("");
  }

  function renderSelectedCandidateHeader(candidate) {
    const panel = root.querySelector("#stock-detail-panel");
    if (!panel) return;
    if (!candidate) {
      renderCandidateDetailPlaceholder();
      return;
    }
    panel.innerHTML = [
      '<header class="stock-panel-header">',
      '<div class="stock-detail-head">',
      '<div><span class="stock-detail-code" id="detail-code"></span>',
      '<span class="stock-detail-name" id="detail-name"></span>',
      '<div><span class="stock-state-badge" id="detail-state"></span></div></div>',
      '<div class="stock-detail-score">Wedge quality<strong id="detail-score"></strong></div>',
      '</div></header>',
      '<div class="stock-detail-empty"><div>',
      '<strong>Chart workspace</strong><br>',
      '<span class="stock-muted">Historical price and MACD rendering follows in the next layer.</span>',
      '</div></div>',
    ].join("");
    panel.querySelector("#detail-code").textContent = candidate.code;
    panel.querySelector("#detail-name").textContent = candidate.name;
    const badge = panel.querySelector("#detail-state");
    badge.textContent = candidate.state;
    badge.classList.add(candidate.state);
    panel.querySelector("#detail-score").textContent =
      Number(candidate.score).toFixed(2);
  }

  function renderSecurityDetail(security, candidate) {
    const panel = root.querySelector("#stock-detail-panel");
    if (!panel) return;
    if (!security) {
      renderCandidateDetailPlaceholder();
      return;
    }
    const score = candidate ? Number(candidate.score).toFixed(2) : "—";
    const stateText = candidate ? candidate.state : "NOT A CANDIDATE";
    panel.innerHTML = [
      '<header class="stock-panel-header">',
      '<div class="stock-detail-head">',
      '<div><span class="stock-detail-code" id="detail-code"></span>',
      '<span class="stock-detail-name" id="detail-name"></span>',
      '<div><span class="stock-state-badge" id="detail-state"></span></div></div>',
      '<div class="stock-detail-score">Wedge quality<strong id="detail-score"></strong></div>',
      '</div></header>',
      '<div class="stock-detail-body">',
      '<div class="stock-info-grid">',
      '<div class="stock-info-card"><div class="label">Exchange</div><div class="value" id="detail-exchange"></div></div>',
      '<div class="stock-info-card"><div class="label">Listing status</div><div class="value" id="detail-listing-status"></div></div>',
      '<div class="stock-info-card"><div class="label">Selected scan</div><div class="value" id="detail-scan-date"></div></div>',
      '</div>',
      '<div id="detail-chart-root"></div>',
      '</div>',
    ].join("");
    panel.querySelector("#detail-code").textContent = security.code;
    panel.querySelector("#detail-name").textContent = security.name;
    const badge = panel.querySelector("#detail-state");
    badge.textContent = stateText;
    if (candidate) badge.classList.add(candidate.state);
    panel.querySelector("#detail-score").textContent = score;
    panel.querySelector("#detail-exchange").textContent = security.exchange;
    panel.querySelector("#detail-listing-status").textContent = security.status;
    panel.querySelector("#detail-scan-date").textContent = state.scanDate || "—";
    renderStockCharts(candidate);
  }

  function metricCard(label, value) {
    return [
      '<div class="stock-metric"><div class="label">', escapeOption(label),
      '</div><div class="value">', escapeOption(value), '</div></div>',
    ].join("");
  }

  function renderStockCharts(candidate) {
    const holder = root.querySelector("#detail-chart-root");
    if (!holder) return;
    if (state.chartHandles && typeof state.chartHandles.dispose === "function") {
      state.chartHandles.dispose();
      state.chartHandles = null;
    }
    if (state.chartError || !state.selectedHistory.length || !state.selectedMacd.length) {
      holder.innerHTML = [
        '<div class="stock-chart-unavailable" id="chart-unavailable"><div>',
        '<strong>Chart unavailable</strong><br><span>',
        escapeOption(state.chartError || "No adjusted history is available."),
        '</span></div></div>',
      ].join("");
      return;
    }
    const latestBar = state.selectedHistory[state.selectedHistory.length - 1];
    const latestMacd = state.selectedMacd[state.selectedMacd.length - 1];
    const metricHtml = candidate ? [
      metricCard("Contraction", Number(candidate.contraction).toFixed(2)),
      metricCard("Linearity", Number(candidate.linearity).toFixed(2)),
      metricCard("Consistency", Number(candidate.consistency).toFixed(2)),
      metricCard("Window", String(candidate.window_length) + " bars"),
      metricCard("Recent convergence", Number(candidate.recent_convergence).toFixed(2)),
      metricCard("Close", Number(latestBar.close).toFixed(3)),
      metricCard("DIF", Number(latestMacd.dif).toFixed(6)),
      metricCard("DEA", Number(latestMacd.dea).toFixed(6)),
    ].join("") : [
      metricCard("Close", Number(latestBar.close).toFixed(3)),
      metricCard("DIF", Number(latestMacd.dif).toFixed(6)),
      metricCard("DEA", Number(latestMacd.dea).toFixed(6)),
      metricCard("MACD", Number(latestMacd.histogram).toFixed(6)),
    ].join("");
    holder.innerHTML = [
      '<div class="stock-chart-card">',
      '<div class="stock-chart-title">Price &amp; Volume</div>',
      '<div class="stock-chart" id="price-chart"></div>',
      '</div>',
      '<div class="stock-chart-card">',
      '<div class="stock-chart-title">MACD (12, 26, 9)</div>',
      '<div class="stock-chart" id="macd-chart"></div>',
      '</div>',
      '<div class="stock-metric-grid" id="wedge-metrics">', metricHtml, '</div>',
    ].join("");
    state.chartHandles = StockCharts.render(
      holder.querySelector("#price-chart"),
      holder.querySelector("#macd-chart"),
      state.selectedHistory,
      state.selectedMacd,
      candidate,
    );
  }

  function clearStockSelection() {
    state.selectedCandidate = null;
    state.selectedCode = null;
    state.selectedSecurity = null;
    state.selectedHistory = [];
    state.selectedMacd = [];
    state.chartError = null;
    renderCandidateDetailPlaceholder();
  }

  function loadStockDetail(code, explicitCandidate) {
    if (!state.session || !code) return null;
    const security = state.session.security(code);
    const candidate = explicitCandidate !== undefined
      ? explicitCandidate
      : (state.scanDate ? state.session.candidate(state.scanDate, code) : null);
    state.selectedCode = code;
    state.selectedSecurity = security;
    state.selectedCandidate = candidate || null;
    state.selectedHistory = state.session.history(code, {
      limit: 300,
      endDate: state.scanDate || undefined,
    });
    state.selectedMacd = [];
    state.chartError = null;
    try {
      state.selectedMacd = StockMacd.fromBars(state.selectedHistory);
    } catch (error) {
      state.chartError = error instanceof Error ? error.message : String(error);
    }
    renderSecurityDetail(security, candidate);
    return {security: security, candidate: candidate || null};
  }

  function tableSelectedCode(table) {
    if (!table || typeof table.getSelectedRows !== "function") return null;
    const selected = table.getSelectedRows();
    if (!selected.length) return null;
    return String(selected[0].getData().code);
  }

  function resolveVisibleCode(rows, preferredCode) {
    if (!rows.length) return null;
    if (preferredCode) {
      const current = rows.find(function (item) {
        return item.code === preferredCode;
      });
      if (current) return current.code;
    }
    return rows[0].code;
  }

  function syncCandidateSelection(preferredCode) {
    const table = state.candidateTable;
    const desiredCode = resolveVisibleCode(
      state.filteredCandidates,
      preferredCode || state.selectedCode,
    );
    if (!desiredCode) {
      if (table && typeof table.deselectRow === "function") table.deselectRow();
      clearStockSelection();
      return null;
    }
    const candidate = state.filteredCandidates.find(function (item) {
      return item.code === desiredCode;
    });
    if (table && tableSelectedCode(table) !== desiredCode) {
      table.selectRow(desiredCode);
    }
    if (
      state.selectedCode !== desiredCode ||
      state.selectedCandidate !== candidate ||
      !root.querySelector("#detail-code") ||
      root.querySelector("#detail-code").textContent !== desiredCode
    ) {
      loadStockDetail(desiredCode, candidate);
    }
    return candidate;
  }

  function syncStockSelection(preferredCode) {
    const table = state.stockTable;
    const desiredCode = resolveVisibleCode(
      state.stockRows,
      preferredCode || state.selectedCode,
    );
    if (!desiredCode) {
      if (table && typeof table.deselectRow === "function") table.deselectRow();
      clearStockSelection();
      return null;
    }
    if (table && tableSelectedCode(table) !== desiredCode) {
      table.selectRow(desiredCode);
    }
    if (
      state.selectedCode !== desiredCode ||
      !root.querySelector("#detail-code") ||
      root.querySelector("#detail-code").textContent !== desiredCode
    ) {
      loadStockDetail(desiredCode);
    }
    return desiredCode;
  }

  function selectStock(code, explicitCandidate) {
    if (!state.session || !code) return null;
    if (
      state.view === "candidates" &&
      state.filteredCandidates.some(function (item) { return item.code === code; })
    ) {
      syncCandidateSelection(code);
      return {
        security: state.selectedSecurity,
        candidate: state.selectedCandidate,
      };
    }
    if (
      state.view === "stocks" &&
      state.stockRows.some(function (item) { return item.code === code; })
    ) {
      syncStockSelection(code);
      return {
        security: state.selectedSecurity,
        candidate: state.selectedCandidate,
      };
    }
    return loadStockDetail(code, explicitCandidate);
  }

  function selectCandidate(candidate) {
    if (!candidate) {
      if (
        state.candidateTable &&
        typeof state.candidateTable.deselectRow === "function"
      ) {
        state.candidateTable.deselectRow();
      }
      clearStockSelection();
      return null;
    }
    if (state.view === "candidates" && state.candidateTable) {
      syncCandidateSelection(candidate.code);
    } else {
      loadStockDetail(candidate.code, candidate);
    }
    return candidate;
  }

  function applyCandidateFilters() {
    const needle = state.searchText.trim().toLowerCase();
    state.filteredCandidates = state.candidates
      .filter(function (candidate) {
        if (Number(candidate.score) < state.scoreMin) return false;
        if (state.stateFilter && candidate.state !== state.stateFilter) return false;
        if (state.exchangeFilter && candidate.exchange !== state.exchangeFilter) {
          return false;
        }
        if (needle) {
          const haystack = (String(candidate.code) + " " + String(candidate.name))
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort(function (left, right) {
        const scoreOrder = Number(right.score) - Number(left.score);
        return scoreOrder || String(left.code).localeCompare(String(right.code));
      });

    const count = root && root.querySelector("#candidate-count");
    if (count) {
      count.textContent =
        state.filteredCandidates.length + " / " + state.candidates.length + " candidates";
    }
    if (state.candidateTable) {
      const revision = ++state.candidateDataRevision;
      const preferredCode = state.selectedCode;
      Promise.resolve(
        state.candidateTable.replaceData(state.filteredCandidates),
      ).then(function () {
        if (
          revision === state.candidateDataRevision &&
          state.view === "candidates"
        ) {
          syncCandidateSelection(preferredCode);
        }
      });
    }
    const empty = root && root.querySelector("#candidate-empty");
    if (empty) {
      empty.hidden = state.filteredCandidates.length > 0;
    }
    return state.filteredCandidates.slice();
  }

  function setCandidateFilters(filters) {
    const values = filters || {};
    if (values.scoreMin != null) state.scoreMin = Number(values.scoreMin);
    if (values.state != null) state.stateFilter = String(values.state);
    if (values.exchange != null) state.exchangeFilter = String(values.exchange);
    if (values.search != null) state.searchText = String(values.search);

    if (root) {
      root.querySelectorAll("[data-score-min]").forEach(function (button) {
        button.classList.toggle(
          "active",
          Number(button.dataset.scoreMin) === state.scoreMin,
        );
      });
      const stateSelect = root.querySelector("#candidate-state-filter");
      const exchangeSelect = root.querySelector("#candidate-exchange-filter");
      const search = root.querySelector("#candidate-search");
      if (stateSelect) stateSelect.value = state.stateFilter;
      if (exchangeSelect) exchangeSelect.value = state.exchangeFilter;
      if (search) search.value = state.searchText;
    }
    return applyCandidateFilters();
  }

  function candidateColumns() {
    return [
      {
        title: "Score",
        field: "score",
        width: 78,
        hozAlign: "right",
        sorter: "number",
        formatter: function (cell) {
          return Number(cell.getValue()).toFixed(2);
        },
      },
      {title: "Code", field: "code", width: 104},
      {title: "Name", field: "name", minWidth: 108},
      {title: "State", field: "state", minWidth: 120},
      {
        title: "MACD",
        field: "histogram",
        minWidth: 98,
        hozAlign: "right",
        sorter: "number",
        formatter: function (cell) {
          return Number(cell.getValue()).toFixed(6);
        },
      },
    ];
  }

  function buildCandidateTable() {
    const tableElement = root.querySelector("#candidate-table");
    if (!tableElement || typeof window.Tabulator !== "function") return;
    if (state.candidateTable) {
      state.candidateTable.destroy();
      state.candidateTable = null;
    }
    state.candidateTable = new window.Tabulator(tableElement, {
      data: state.filteredCandidates,
      index: "code",
      layout: "fitColumns",
      height: "100%",
      selectableRows: 1,
      initialSort: [
        {column: "score", dir: "desc"},
        {column: "code", dir: "asc"},
      ],
      columns: candidateColumns(),
    });
    state.candidateTable.on("rowSelectionChanged", function (_data, rows) {
      if (!rows.length) return;
      const candidate = rows[0].getData();
      if (
        state.selectedCode !== candidate.code ||
        state.selectedCandidate !== candidate
      ) {
        loadStockDetail(candidate.code, candidate);
      }
    });
    state.candidateTable.on("rowClick", function (_event, row) {
      const code = row.getData().code;
      setTimeout(function () {
        if (state.view === "candidates") syncCandidateSelection(code);
      }, 0);
    });
  }

  function loadCandidateDate(tradeDate) {
    state.scanDate = tradeDate || null;
    state.candidates = tradeDate ? state.session.candidates(tradeDate) : [];
    const filtered = applyCandidateFilters();
    const select = root && root.querySelector("#candidate-date");
    if (select && tradeDate) select.value = tradeDate;
    return filtered;
  }

  function renderCandidatesView() {
    root.querySelector("#view-root").innerHTML = [
      '<div class="stock-workspace">',
      '<section class="stock-panel stock-candidate-panel">',
      '<header class="stock-panel-header">',
      '<h2 class="stock-panel-title">Candidates</h2>',
      '<span class="stock-table-meta" id="candidate-count"></span>',
      '</header>',
      '<div class="stock-filter-row">',
      '<label>Score ≥ <span class="stock-score-presets">',
      '<button type="button" data-score-min="60">60</button>',
      '<button type="button" data-score-min="70">70</button>',
      '<button type="button" data-score-min="80">80</button>',
      '<button type="button" data-score-min="90">90</button>',
      '</span></label>',
      '<label>Date <select class="form-select form-select-sm" id="candidate-date">',
      candidateDateOptions(),
      '</select></label>',
      '<label>State <select class="form-select form-select-sm" id="candidate-state-filter">',
      '<option value="">All</option><option value="APPROACHING">APPROACHING</option>',
      '<option value="TURNING">TURNING</option><option value="JUST_TURNED">JUST_TURNED</option>',
      '</select></label>',
      '<label>Exchange <select class="form-select form-select-sm" id="candidate-exchange-filter">',
      '<option value="">All</option><option value="SH">SH</option>',
      '<option value="SZ">SZ</option><option value="BJ">BJ</option>',
      '</select></label>',
      '</div>',
      '<div class="stock-search-row">',
      '<input class="form-control form-control-sm" id="candidate-search" ',
      'placeholder="Search code or name..." autocomplete="off">',
      '<span class="stock-muted align-self-center">MACD wedge quality</span>',
      '</div>',
      '<div class="stock-table-wrap">',
      '<div id="candidate-table"></div>',
      '<div id="candidate-empty" class="stock-table-empty" hidden>',
      'No candidates match the current filters.</div>',
      '</div></section>',
      '<section class="stock-panel stock-detail-panel" id="stock-detail-panel"></section>',
      '</div>',
    ].join("");

    root.querySelectorAll("[data-score-min]").forEach(function (button) {
      button.addEventListener("click", function () {
        setCandidateFilters({scoreMin: Number(button.dataset.scoreMin)});
      });
    });
    root.querySelector("#candidate-date").addEventListener("change", function (event) {
      loadCandidateDate(event.target.value);
    });
    root.querySelector("#candidate-state-filter").addEventListener("change", function (event) {
      setCandidateFilters({state: event.target.value});
    });
    root.querySelector("#candidate-exchange-filter").addEventListener("change", function (event) {
      setCandidateFilters({exchange: event.target.value});
    });
    root.querySelector("#candidate-search").addEventListener("input", function (event) {
      setCandidateFilters({search: event.target.value});
    });

    state.filteredCandidates = state.candidates.slice();
    setCandidateFilters({
      scoreMin: state.scoreMin,
      state: state.stateFilter,
      exchange: state.exchangeFilter,
      search: state.searchText,
    });
    buildCandidateTable();
    setTimeout(function () {
      if (state.view === "candidates") {
        syncCandidateSelection(state.selectedCode);
      }
    }, 0);
  }

  function stockColumns() {
    return [
      {title: "Code", field: "code", width: 118},
      {title: "Name", field: "name", minWidth: 130},
      {title: "Exchange", field: "exchange", width: 92},
      {title: "Status", field: "status", width: 100},
    ];
  }

  function buildStockTable() {
    const element = root.querySelector("#all-stocks-table");
    if (!element || typeof window.Tabulator !== "function") return;
    if (state.stockTable) {
      state.stockTable.destroy();
      state.stockTable = null;
    }
    state.stockTable = new window.Tabulator(element, {
      data: state.stockRows,
      index: "code",
      layout: "fitColumns",
      height: "100%",
      selectableRows: 1,
      columns: stockColumns(),
    });
    state.stockTable.on("rowSelectionChanged", function (_data, rows) {
      if (!rows.length) return;
      const code = rows[0].getData().code;
      if (state.selectedCode !== code) loadStockDetail(code);
    });
    state.stockTable.on("rowClick", function (_event, row) {
      const code = row.getData().code;
      setTimeout(function () {
        if (state.view === "stocks") syncStockSelection(code);
      }, 0);
    });
  }

  function searchStocks(query) {
    if (!state.session) return [];
    state.stockRows = state.session.securities(query || "", 500);
    if (state.stockTable) {
      const revision = ++state.stockDataRevision;
      const preferredCode = state.selectedCode;
      Promise.resolve(state.stockTable.replaceData(state.stockRows)).then(function () {
        if (revision === state.stockDataRevision && state.view === "stocks") {
          syncStockSelection(preferredCode);
        }
      });
    }
    const count = root && root.querySelector("#all-stocks-count");
    if (count) count.textContent = state.stockRows.length + " shown";
    return state.stockRows.slice();
  }

  function renderStocksView() {
    root.querySelector("#view-root").innerHTML = [
      '<div class="stock-workspace">',
      '<section class="stock-panel stock-candidate-panel">',
      '<header class="stock-panel-header"><h2 class="stock-panel-title">All Stocks</h2>',
      '<span class="stock-table-meta" id="all-stocks-count"></span></header>',
      '<div class="stock-search-row" style="padding-top:12px">',
      '<input class="form-control form-control-sm" id="all-stocks-search" ',
      'placeholder="Search any listed stock by code or name..." autocomplete="off">',
      '<span class="stock-muted align-self-center">Up to 500 rows</span>',
      '</div>',
      '<div class="stock-table-wrap"><div id="all-stocks-table"></div></div>',
      '</section>',
      '<section class="stock-panel stock-detail-panel" id="stock-detail-panel"></section>',
      '</div>',
    ].join("");
    root.querySelector("#all-stocks-search").addEventListener("input", function (event) {
      searchStocks(event.target.value);
    });
    state.stockRows = state.session.securities("", 500);
    root.querySelector("#all-stocks-count").textContent = state.stockRows.length + " shown";
    buildStockTable();
    setTimeout(function () {
      if (state.view === "stocks") syncStockSelection(state.selectedCode);
    }, 0);
  }

  function renderStatusView() {
    const dataDays = state.session.dataDays(120);
    const scans = state.session.scanDates();
    const dayRows = dataDays.map(function (item) {
      return [
        "<tr>",
        "<td>", escapeOption(item.trade_date), "</td>",
        "<td>", Number(item.ready) ? "READY" : "NOT READY", "</td>",
        "<td>", escapeOption(item.security_count), "</td>",
        "<td>", escapeOption(item.bar_count), "</td>",
        "<td>", escapeOption(item.issue || ""), "</td>",
        "</tr>",
      ].join("");
    }).join("");
    const scanRows = scans.map(function (item) {
      return [
        "<tr>",
        "<td>", escapeOption(item.trade_date), "</td>",
        "<td>", escapeOption(item.scanned_count), "</td>",
        "<td>", escapeOption(item.candidate_count), "</td>",
        "</tr>",
      ].join("");
    }).join("");
    root.querySelector("#view-root").innerHTML = [
      '<div class="stock-status-grid">',
      '<div class="stock-status-card"><div class="label">Latest ready data</div>',
      '<strong id="status-latest-ready"></strong></div>',
      '<div class="stock-status-card"><div class="label">Latest scan</div>',
      '<strong id="status-latest-scan"></strong></div>',
      '<div class="stock-status-card"><div class="label">Listed securities</div>',
      '<strong id="status-security-count"></strong></div>',
      '</div>',
      '<div class="stock-workspace">',
      '<section class="stock-panel"><header class="stock-panel-header">',
      '<h2 class="stock-panel-title">Market Data Days</h2></header>',
      '<div class="p-2"><table class="stock-simple-table"><thead><tr>',
      '<th>Date</th><th>Status</th><th>Securities</th><th>Bars</th><th>Issue</th>',
      '</tr></thead><tbody>', dayRows, '</tbody></table></div></section>',
      '<section class="stock-panel"><header class="stock-panel-header">',
      '<h2 class="stock-panel-title">Persisted Scans</h2></header>',
      '<div class="p-2"><table class="stock-simple-table"><thead><tr>',
      '<th>Date</th><th>Scanned</th><th>Candidates</th>',
      '</tr></thead><tbody>', scanRows, '</tbody></table></div></section>',
      '</div>',
    ].join("");
    root.querySelector("#status-latest-ready").textContent =
      state.summary.latestReadyDate || "none";
    root.querySelector("#status-latest-scan").textContent =
      state.summary.latestScanDate || "none";
    root.querySelector("#status-security-count").textContent =
      String(state.summary.securityCount);
  }

  function percent(value) {
    return (Number(value) * 100).toFixed(2) + "%";
  }

  function validateBacktestReport(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Backtest report must be a JSON object");
    }
    ["signal_count", "hit_rate_1", "hit_rate_3", "hit_rate_5"].forEach(
      function (key) {
        if (!Number.isFinite(Number(value[key]))) {
          throw new Error("Invalid backtest report: missing numeric " + key);
        }
      },
    );
    if (!Array.isArray(value.score_buckets)) {
      throw new Error("Invalid backtest report: score_buckets must be an array");
    }
    if (
      typeof value.candidates_per_day !== "object" ||
      value.candidates_per_day === null
    ) {
      throw new Error("Invalid backtest report: candidates_per_day is required");
    }
    return value;
  }

  async function openBacktestFile(file) {
    if (!file || typeof file.text !== "function") {
      throw new Error("Select a backtest JSON report");
    }
    try {
      const parsed = JSON.parse(await file.text());
      state.backtestReport = validateBacktestReport(parsed);
      state.backtestFileName = file.name || "backtest.json";
      clearError();
      if (state.view === "backtest") renderBacktestView();
      return state.backtestReport;
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  function renderBacktestView() {
    const report = state.backtestReport;
    if (!report) {
      root.querySelector("#view-root").innerHTML = [
        '<section class="stock-panel">',
        '<header class="stock-panel-header"><h2 class="stock-panel-title">Backtest</h2></header>',
        '<div class="stock-backtest-actions">',
        '<div><strong>Open an existing Python backtest report</strong>',
        '<div class="stock-muted">The browser renders persisted results only; it does not rerun the backtest.</div></div>',
        '<button class="btn btn-primary" type="button" id="open-backtest-report">Open Backtest Report</button>',
        '</div>',
        '<div class="stock-backtest-note">Wedge score represents MACD transition quality, ',
        'not a calibrated probability of stock-price appreciation.</div>',
        '</section>',
      ].join("");
      root.querySelector("#open-backtest-report").addEventListener(
        "click",
        function () {
          backtestInput.click();
        },
      );
      return;
    }

    const bucketRows = report.score_buckets.map(function (item) {
      return [
        "<tr><td>", escapeOption(item.bucket), "</td><td>",
        escapeOption(item.signals), "</td><td>",
        escapeOption(percent(item.hit_rate_3)), "</td></tr>",
      ].join("");
    }).join("");
    const candidateDays = Object.keys(report.candidates_per_day || {});
    root.querySelector("#view-root").innerHTML = [
      '<section class="stock-panel">',
      '<header class="stock-panel-header"><div><h2 class="stock-panel-title">Backtest</h2>',
      '<div class="stock-muted" id="backtest-file-name"></div></div>',
      '<button class="btn btn-outline-primary" type="button" id="open-backtest-report">Open another report</button>',
      '</header>',
      '<div class="stock-backtest-actions"><div><strong id="backtest-range"></strong>',
      '<div class="stock-muted">Historical APPROACHING → non-negative MACD evaluation</div></div>',
      '<div class="stock-muted">', escapeOption(candidateDays.length), ' evaluated signal days</div></div>',
      '<div class="stock-backtest-summary">',
      '<div class="stock-backtest-card"><div class="label">Signals</div><strong id="backtest-signals"></strong></div>',
      '<div class="stock-backtest-card"><div class="label">≤ 1 bar</div><strong id="backtest-hit1"></strong></div>',
      '<div class="stock-backtest-card"><div class="label">≤ 3 bars</div><strong id="backtest-hit3"></strong></div>',
      '<div class="stock-backtest-card"><div class="label">≤ 5 bars</div><strong id="backtest-hit5"></strong></div>',
      '<div class="stock-backtest-card"><div class="label">Median cross bars</div><strong id="backtest-median"></strong></div>',
      '</div>',
      '<div class="stock-backtest-note" id="backtest-semantics"></div>',
      '<div class="p-3"><h3 class="stock-panel-title mb-2">Score buckets</h3>',
      '<table class="stock-simple-table"><thead><tr><th>Score</th><th>Signals</th><th>3-bar hit</th></tr></thead>',
      '<tbody id="backtest-buckets">', bucketRows, '</tbody></table></div>',
      '</section>',
    ].join("");
    root.querySelector("#backtest-file-name").textContent =
      state.backtestFileName || "backtest.json";
    root.querySelector("#backtest-range").textContent =
      String(report.date_from || "—") + " → " + String(report.date_to || "—");
    root.querySelector("#backtest-signals").textContent = String(report.signal_count);
    root.querySelector("#backtest-hit1").textContent = percent(report.hit_rate_1);
    root.querySelector("#backtest-hit3").textContent = percent(report.hit_rate_3);
    root.querySelector("#backtest-hit5").textContent = percent(report.hit_rate_5);
    root.querySelector("#backtest-median").textContent =
      report.median_bars_to_cross == null
        ? "—"
        : String(report.median_bars_to_cross);
    root.querySelector("#backtest-semantics").textContent =
      report.score_semantics || "MACD wedge quality; not price-up probability";
    root.querySelector("#open-backtest-report").addEventListener(
      "click",
      function () {
        backtestInput.click();
      },
    );
  }

  function renderView() {
    if (!state.session) {
      renderEmpty();
      return;
    }
    if (state.view === "candidates") {
      renderCandidatesView();
    } else if (state.view === "stocks") {
      renderStocksView();
    } else if (state.view === "backtest") {
      renderBacktestView();
    } else {
      renderStatusView();
    }
  }

  function onDatabaseOpened(session) {
    state.session = session;
    state.summary = session.summary();
    state.scanDates = session.scanDates();
    state.scanDate = state.scanDates.length ? state.scanDates[0].trade_date : null;
    state.candidates = state.scanDate ? session.candidates(state.scanDate) : [];
    state.selectedCode = null;
    state.selectedCandidate = null;
    state.selectedSecurity = null;
    state.selectedHistory = [];
    state.selectedMacd = [];
    state.chartError = null;
    state.view = "candidates";
    renderWorkspaceShell();
    updateStatusBar();
    renderView();
    document.body.dataset.appState = "READY";
    return session;
  }

  async function openDatabaseFile(file) {
    document.body.dataset.appState = "LOADING";
    root.classList.add("stock-loading");
    try {
      const session = await StockDb.openFile(file);
      onDatabaseOpened(session);
      return session;
    } catch (error) {
      document.body.dataset.appState = "ERROR";
      showError(error);
      throw error;
    } finally {
      root.classList.remove("stock-loading");
    }
  }

  function init() {
    // Initialize the browser entry state for the current launch mode.
    root = document.getElementById("app");
    if (!root) return;
    renderShell();
    document.addEventListener("stock-database-ready", function (event) {
      onDatabaseOpened(event.detail);
    }, {once: true});
    document.addEventListener("stock-database-error", function (event) {
      document.body.dataset.appState = "ERROR";
      showError(event.detail);
    }, {once: true});
    document.body.dataset.appState = "WAITING_FOR_DATABASE";
  }

  window.StockApp = {
    openDatabaseFile: openDatabaseFile,
    setView: setView,
    setCandidateFilters: setCandidateFilters,
    loadCandidateDate: loadCandidateDate,
    searchStocks: searchStocks,
    selectStock: selectStock,
    openBacktestFile: openBacktestFile,
    getFilteredCandidates: function () {
      return state.filteredCandidates.slice();
    },
    state: state,
    get backtestInput() {
      return backtestInput;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once: true});
  } else {
    init();
  }
}());