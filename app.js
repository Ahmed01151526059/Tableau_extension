// ===== Config =====
const TARGET_DS_NAME = "gamesDataset";     // <-- must match the data source display name
const MAX_ROWS = 2000;                     // safety cap for summary data rows

// Render helpers
function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function renderTable(container, summary) {
  if (!summary || !summary.columns || !summary.data || !summary.columns.length) {
    container.innerHTML = "<em>No data returned.</em>";
    return;
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
    <div style="margin:8px 0; font-size:12px; color:#667;">
      Showing ${Math.min(summary.data.length, MAX_ROWS)} of ${summary.data.length} row(s)
    </div>
    <div style="overflow:auto; max-height:420px; border:1px solid #ddd; border-radius:8px;">
      <table style="border-collapse:collapse; width:100%;">
        <thead style="position:sticky; top:0; background:#fafafa;">
          <tr>${headers}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function findWorksheetUsingTargetDS(dashboard) {
  // Scan worksheets and ask each for its data sources; return the first that uses TARGET_DS_NAME
  for (const ws of dashboard.worksheets) {
    try {
      const dss = await ws.getDataSourcesAsync();
      if (dss.some(ds => (ds.name || "").toLowerCase() === TARGET_DS_NAME.toLowerCase())) {
        return ws;
      }
    } catch { /* ignore this worksheet and continue */ }
  }
  return null;
}

async function readSummaryData(worksheet) {
  // ignoreSelection=true so it loads immediately without user interaction
  const summary = await worksheet.getSummaryDataAsync({ ignoreSelection: true, maxRows: MAX_ROWS });
  return summary;
}

async function main() {
  const statusEl = document.getElementById("status");
  const wsInfoEl = document.getElementById("ws-info");
  const tableEl = document.getElementById("table");

  statusEl.textContent = "Initializing extension…";
  await tableau.extensions.initializeAsync();
  const dashboard = tableau.extensions.dashboardContent.dashboard;

  statusEl.textContent = "Searching for worksheet using data source: " + TARGET_DS_NAME + " …";
  const ws = await findWorksheetUsingTargetDS(dashboard);

  if (!ws) {
    statusEl.textContent =
      `Could not find any worksheet on this dashboard that uses a data source named "${TARGET_DS_NAME}". ` +
      `Add a worksheet bound to that data source and reload the extension.`;
    return;
  }

  wsInfoEl.innerHTML = `<strong>Worksheet:</strong> ${htmlEscape(ws.name)}`;

  try {
    statusEl.textContent = "Loading data…";
    const summary = await readSummaryData(ws);
    renderTable(tableEl, summary);
    statusEl.textContent = "Loaded.";
  } catch (err) {
    statusEl.textContent = "Failed to read data: " + err.message;
    console.error(err);
  }

  // Optional: refresh if user changes marks (live feel)
  ws.addEventListener(tableau.TableauEventType.MarkSelectionChanged, async () => {
    try {
      statusEl.textContent = "Refreshing…";
      const summary = await readSummaryData(ws);
      renderTable(tableEl, summary);
      statusEl.textContent = "Loaded.";
    } catch (err) {
      statusEl.textContent = "Refresh failed: " + err.message;
    }
  });
}

main().catch(err => {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Initialization failed: " + err.message;
  console.error(err);
});
