/******************************************************
 * Games Dataset Extension — Diagnostic Build
 * - Auto-reads Summary Data from a worksheet whose
 *   data source is named "gamesDataset"
 * - Prints detailed step logs to UI + console
 ******************************************************/

/* ========= Configuration ========= */
const TARGET_DS_NAME = "gamesDataset";   // change if your data source display name differs
const MAX_ROWS = 2000;                   // cap rows for summary data
const DEBUG = true;                      // toggles verbose console logging

/* ========= Minimal UI hookups (safe even if elements missing) ========= */
const getEl = (id, createTag = "div") => {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(createTag);
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
};
const statusEl = getEl("status");
const wsInfoEl = getEl("ws-info");
const tableEl  = getEl("table");
const diagEl   = getEl("diag");

function setStatus(msg) {
  statusEl.textContent = msg;
  log(`STATUS: ${msg}`);
}
function log(msg, obj) {
  if (DEBUG) console.log(`[EXT] ${msg}`, obj ?? "");
  const line = document.createElement("div");
  line.style.fontSize = "12px";
  line.style.color = "#334155";
  line.textContent = msg;
  diagEl.appendChild(line);
}
function logError(msg, err) {
  console.error(`[EXT ERROR] ${msg}`, err);
  const line = document.createElement("div");
  line.style.fontSize = "12px";
  line.style.color = "#b91c1c";
  line.textContent = `❌ ${msg}: ${err?.message || err}`;
  diagEl.appendChild(line);
}

/* ========= Helpers ========= */
function htmlEscape(s){return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

function renderTable(container, summary){
  if(!summary || !summary.columns || !summary.data || !summary.columns.length){
    container.innerHTML = "<em>No data returned.</em>"; return;
  }
  const headers = summary.columns.map(c => `<th>${htmlEscape(c.fieldName ?? "")}</th>`).join("");
  const rows = summary.data.slice(0, MAX_ROWS).map(r => {
    const cells = r.map(cell => {
      const v = (cell && typeof cell === "object" && "value" in cell) ? cell.value : cell;
      return `<td>${htmlEscape(v)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  container.innerHTML = `
    <div style="margin:8px 0">
      <span style="display:inline-block;background:#eef2f7;color:#334155;border:1px solid #dbe3ea;border-radius:999px;padding:2px 8px;font-size:12px">
        Rows: ${Math.min(summary.data.length, MAX_ROWS)} / ${summary.data.length}
      </span>
    </div>
    <div style="overflow:auto;max-height:520px;border:1px solid #e5e7eb;border-radius:10px">
      <table style="border-collapse:collapse;width:100%;font-size:13px">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function listWorksheetsAndDataSources(dashboard){
  const report = [];
  for (const ws of dashboard.worksheets) {
    try {
      const dss = await ws.getDataSourcesAsync();
      const names = dss.map(ds => ds.name);
      report.push({ worksheet: ws.name, datasources: names });
    } catch (e) {
      report.push({ worksheet: ws.name, datasources: [`<error: ${e.message}>`] });
    }
  }
  log("🔎 Worksheet → Data Sources map:");
  report.forEach(r => log(`   - ${r.worksheet} :: [${r.datasources.join(", ")}]`));
  return report;
}

async function findWorksheetUsingTargetDS(dashboard){
  for(const ws of dashboard.worksheets){
    try{
      const dss = await ws.getDataSourcesAsync();
      if(dss.some(ds => (ds.name || "").toLowerCase() === TARGET_DS_NAME.toLowerCase())){
        log(`✅ Found worksheet "${ws.name}" using data source "${TARGET_DS_NAME}"`);
        return ws;
      }
      log(`… "${ws.name}" does not use "${TARGET_DS_NAME}"`);
    }catch(e){
      logError(`Failed to read data sources for worksheet "${ws.name}"`, e);
    }
  }
  return null;
}

async function readSummaryData(worksheet){
  log(`📥 Calling getSummaryDataAsync(ignoreSelection=true, maxRows=${MAX_ROWS}) on "${worksheet.name}"`);
  const s = await worksheet.getSummaryDataAsync({ ignoreSelection: true, maxRows: MAX_ROWS });
  log(`✅ Summary data returned: rows=${s.data?.length ?? 0}, cols=${s.columns?.length ?? 0}`);
  return s;
}

/* ========= Environment Guards ========= */
// Wait until Tableau injects the Extensions API (prevents 'tableau is not defined')
function waitForTableau(retries = 40, intervalMs = 250){
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (window.tableau && window.tableau.extensions) { resolve(); return; }
      if (retries-- <= 0) { reject(new Error("Tableau Extensions API not available — are you running inside a Tableau Dashboard Extension?")); return; }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// Quick environment dump for troubleshooting
function envDump() {
  log(`🌐 Location: ${window.location.href}`);
  log(`🧭 Referrer: ${document.referrer || "(none)"}`);
  log(`🧩 In iframe: ${window.self !== window.top}`);
  log(`🧰 User-Agent: ${navigator.userAgent}`);
}

/* ========= Main ========= */
async function main(){
  diagEl.innerHTML = ""; // clear previous logs
  envDump();

  try{
    setStatus("Step 1/7 — Waiting for Tableau Extensions API…");
    await waitForTableau();
    log("✅ Tableau Extensions API detected.");

    setStatus("Step 2/7 — Initializing extension…");
    await tableau.extensions.initializeAsync();
    log("✅ initializeAsync() resolved.");

    const dashboard = tableau.extensions.dashboardContent.dashboard;
    log(`✅ Dashboard loaded. Worksheets count = ${dashboard.worksheets.length}`);

    setStatus("Step 3/7 — Listing worksheets and data sources…");
    await listWorksheetsAndDataSources(dashboard);

    setStatus(`Step 4/7 — Finding worksheet using data source "${TARGET_DS_NAME}"…`);
    const ws = await findWorksheetUsingTargetDS(dashboard);
    if(!ws){
      setStatus(`❌ No worksheet on this dashboard uses a data source named "${TARGET_DS_NAME}".`);
      log("➡️ Fix: Put a worksheet on this dashboard bound to the target data source, or change TARGET_DS_NAME in app.js.");
      return;
    }
    wsInfoEl.innerHTML = `<strong>Worksheet:</strong> ${htmlEscape(ws.name)}`;

    setStatus("Step 5/7 — Reading summary data…");
    const summary = await readSummaryData(ws);

    setStatus("Step 6/7 — Rendering table…");
    renderTable(tableEl, summary);

    setStatus("Step 7/7 — Done. Listening for selection changes…");
    ws.addEventListener(tableau.TableauEventType.MarkSelectionChanged, async () => {
      try{
        setStatus("Refresh — selection changed, reloading data…");
        const s = await readSummaryData(ws);
        renderTable(tableEl, s);
        setStatus("Loaded.");
      }catch(e){
        logError("Refresh failed", e);
        setStatus("Refresh failed — see console/logs.");
      }
    });

  }catch(err){
    logError("Initialization failed", err);
    setStatus("Initialization failed — see diagnostics below and console.");
  }
}

/* ========= Extra: manual re-run button (appears at bottom) ========= */
(function addRerunButton(){
  const btn = document.createElement("button");
  btn.textContent = "Run Diagnostics Again";
  btn.style.cssText = "margin-top:12px;padding:8px 12px;border:1px solid #d0d7de;border-radius:8px;background:#f6f8fa;cursor:pointer";
  btn.onclick = main;
  diagEl.appendChild(btn);
})();

/* Kick off */
main();
