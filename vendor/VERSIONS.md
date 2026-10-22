# Vendored browser dependencies

- Tabler `@tabler/core` 1.7.0 — MIT — `tabler/`
- Tabulator `tabulator-tables` 6.7.0 — MIT — `tabulator/`
- Apache ECharts `echarts` 6.1.0 — Apache-2.0 — `echarts/`
- sql.js `sql.js` 1.15.1 — MIT — `sqljs/`

Only the production files required by the offline explorer are vendored.
`sqljs/sql-wasm-inline.js` embeds the WebAssembly payload, so direct
`file://` use does not need to fetch a separate `.wasm` file.
