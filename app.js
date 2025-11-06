// ========= Config =========
const TARGET_DS_NAME = "gamesDataset"; // data source display name to look for
const MAX_ROWS = 2000;                 // cap rows for summary data

// ========= Helpers =========
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
      <span class="badge">Rows: ${Math.min(summary.data.length, MAX_ROWS)} / ${summary.data.length}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function findWorksheetUsingTargetDS(dashboard){
  for(const ws of dashboard.worksheets){
    try{
      const dss = await ws.getDataSourcesAsync();
      if(dss.some(ds => (ds.name || "").toLowerCase() === TARGET_DS_NAME.toLowerCase())){
        return ws;
      }
    }catch(e){ /* continue to next worksheet */ }
  }
  return null;
}

async function readSummaryData(worksheet){
  // ignoreSelection=true so we always get a stable snapshot without user clicks
  return await worksheet.getSummaryDataAsync({ ignoreSelection: true, maxRows: MAX_ROWS });
}

// Wait until Tableau injects the Extensions API (prevents 'tableau is not defined')
function waitForTableau(retries = 40){
  return new Promise((resolve, reject) => {
    const tick = () => {
      if(window.tableau && window.tableau.extensions){ resolve(); return; }
      if(retries-- <= 0){ reject(new Error("Tableau Extensions API not available")); return; }
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function main(){
  const status = document.getElementById("status");
  const wsInfo = document.getElementById("ws-info");
  const tableEl = document.getElementById("table");

  try{
    status.textContent = "Initializing extension…";
    await waitForTableau();
    await tableau.extensions.initializeAsync();

    const dashboard = tableau.extensions.dashboardContent.dashboard;

    status.textContent = `Searching for a worksheet using data source "${TARGET_DS_NAME}"…`;
    const ws = await findWorksheetUsingTargetDS(dashboard);
    if(!ws){
      status.textContent = `No worksheet on this dashboard uses a data source named "${TARGET_DS_NAME}". Add one and reload.`;
      return;
    }

    wsInfo.innerHTML = `<strong>Worksheet:</strong> ${htmlEscape(ws.name)}`;

    status.textContent = "Loading data…";
    const summary = await readSummaryData(ws);
    renderTable(tableEl, summary);
    status.textContent = "Loaded.";

    // Optional live refresh when selection changes
    ws.addEventListener(tableau.TableauEventType.MarkSelectionChanged, async () => {
      try{
        status.textContent = "Refreshing…";
        const s = await readSummaryData(ws);
        renderTable(tableEl, s);
        status.textContent = "Loaded.";
      }catch(e){
        status.textContent = "Refresh failed: " + e.message;
      }
    });

  }catch(err){
    status.textContent = "Initialization failed: " + err.message;
    console.error(err);
  }
}

main();
