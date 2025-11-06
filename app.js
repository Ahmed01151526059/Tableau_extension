/******************************************************
 * Games Dataset Extension — Robust / Diagnostic build
 ******************************************************/

const TARGET_DS_NAME = "games.csv";
const MAX_ROWS = 2000;
const POLL_MAX = 60;      // 60 * 250ms = 15s
const POLL_INTERVAL = 250;

// ----- tiny UI helpers -----
const el = (id) => document.getElementById(id) || (() => {
  const d = document.createElement("div"); d.id = id; document.body.appendChild(d); return d;
})();

const statusEl = el("status");
const wsInfoEl = el("ws-info");
const tableEl  = el("table");
const diagEl   = el("diag");

function log(msg, data) {
  console.log("[EXT]", msg, data ?? "");
  const line = document.createElement("div");
  line.style.cssText = "font-size:12px;color:#334155";
  line.textContent = msg;
  diagEl.appendChild(line);
}
function logError(msg, err) {
  console.error("[EXT ERROR]", msg, err);
  const line = document.createElement("div");
  line.style.cssText = "font-size:12px;color:#b91c1c";
  line.textContent = `❌ ${msg}: ${err?.message || err}`;
  diagEl.appendChild(line);
}
function setStatus(s){ statusEl.textContent = s; log("STATUS: " + s); }

function htmlEscape(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

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
      report.push({ worksheet: ws.name, datasources: dss.map(ds => ds.name) });
    } catch (e) {
      report.push({ worksheet: ws.name, datasources: [`<error: ${e.message}>`] });
    }
  }
  log("🔎 Worksheet → Data Sources");
  report.forEach(r => log(`   - ${r.worksheet}: [${r.datasources.join(", ")}]`));
}

async function findWorksheetUsingTargetDS(dashboard){
  for(const ws of dashboard.worksheets){
    try{
      const dss = await ws.getDataSourcesAsync();
      if(dss.some(ds => (ds.name || "").toLowerCase() === TARGET_DS_NAME.toLowerCase())){
        log(`✅ Found worksheet "${ws.name}" using "${TARGET_DS_NAME}"`);
        return ws;
      }
      log(`… "${ws.name}" does not use "${TARGET_DS_NAME}"`);
    }catch(e){ logError(`Reading data sources for "${ws.name}" failed`, e); }
  }
  return null;
}

async function readSummaryData(ws){
  log(`📥 getSummaryDataAsync(ignoreSelection=true, maxRows=${MAX_ROWS}) on "${ws.name}"`);
  const s = await ws.getSummaryDataAsync({ ignoreSelection: true, maxRows: MAX_ROWS });
  log(`✅ Summary data returned: rows=${s.data?.length ?? 0}, cols=${s.columns?.length ?? 0}`);
  return s;
}

// ---------- HARD GUARD: never touch `tableau` until injected ----------
function inIframe(){ try { return window.self !== window.top; } catch { return true; } }

function waitForTableau(maxTries = POLL_MAX){
  return new Promise((resolve, reject) => {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (window.tableau && window.tableau.extensions) {
        clearInterval(t); resolve();
      } else if (tries >= maxTries) {
        clearInterval(t); 
        reject(new Error("Tableau Extensions API not available. Are you running this as a Dashboard → Extension with a .trex file?"));
      }
    }, POLL_INTERVAL);
  });
}

async function main(){
  // Environment hints before we even try:
  log(`🌐 URL: ${location.href}`);
  log(`🧭 Referrer: ${document.referrer || "(none)"}`);
  log(`🧩 In iframe: ${inIframe()}`);
  log(`🧰 UA: ${navigator.userAgent}`);

  try {
    setStatus("Step 1/7 — Waiting for Tableau Extensions API…");
    await waitForTableau();              // <- we do not reference `tableau` before this resolves
    log("✅ Extensions API detected");

    setStatus("Step 2/7 — Initializing…");
    await window.tableau.extensions.initializeAsync();
    log("✅ initializeAsync() ok");

    const dashboard = window.tableau.extensions.dashboardContent.dashboard;
    log(`✅ Dashboard loaded (worksheets: ${dashboard.worksheets.length})`);

    setStatus("Step 3/7 — Listing worksheets & data sources…");
    await listWorksheetsAndDataSources(dashboard);

    setStatus(`Step 4/7 — Locating worksheet using "${TARGET_DS_NAME}"…`);
    const ws = await findWorksheetUsingTargetDS(dashboard);
    if(!ws){
      setStatus(`❌ No worksheet on this dashboard uses a data source named "${TARGET_DS_NAME}".`);
      log("➡️ Fix: Place a worksheet bound to that data source on this dashboard, or change TARGET_DS_NAME.");
      return;
    }
    wsInfoEl.innerHTML = `<strong>Worksheet:</strong> ${htmlEscape(ws.name)}`;

    setStatus("Step 5/7 — Reading summary data…");
    const summary = await readSummaryData(ws);

    setStatus("Step 6/7 — Rendering table…");
    renderTable(tableEl, summary);

    setStatus("Step 7/7 — Done. Listening for selection changes…");
    ws.addEventListener(window.tableau.TableauEventType.MarkSelectionChanged, async () => {
      try{
        setStatus("Refreshing…");
        const s = await readSummaryData(ws);
        renderTable(tableEl, s);
        setStatus("Loaded.");
      }catch(e){
        logError("Refresh failed", e);
        setStatus("Refresh failed — see console/logs.");
      }
    });

  } catch (err) {
    logError("Initialization failed", err);
    setStatus("Initialization failed — see diagnostics above and console.");
    // Extra guidance:
    log("Checklist:");
    log("1) Add as Dashboard → Extension (NOT Web Page / NOT Viz Extension)");
    log("2) .trex <url> is HTTPS and on the site safe list (domain only)");
    log("3) index.html includes the Extensions API BEFORE this app.js:");
    log('   <script src="https://tableau.github.io/extensions-api/lib/tableau.extensions.1.latest.js"></script>');
    log("4) At least one worksheet on the dashboard uses data source named: " + TARGET_DS_NAME);
  }
}

// Run only after DOM is ready (avoids race with script tags)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}


