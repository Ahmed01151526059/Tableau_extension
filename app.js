// Helper: sum a column by its field name
function sumByField(summary, fieldName) {
  if (!summary || !summary.columns) return 0;
  const idx = summary.columns.findIndex(c => (c.fieldName || c.fieldName === 0) && c.fieldName.toLowerCase() === fieldName.toLowerCase());
  if (idx === -1) return 0;
  let total = 0;
  for (const row of summary.data) {
    const cell = row[idx];
    const v = typeof cell === 'object' && cell.value !== undefined ? cell.value : cell;
    if (typeof v === 'number') total += v;
  }
  return total;
}

async function refreshKPIs(worksheet) {
  // If marks selected, prefer selected summary; otherwise use full summary
  const marks = await worksheet.getSelectedMarksAsync();
  let summary;
  if (marks && marks.data && marks.data.length > 0) {
    // marks.data is an array of data tables (one per mark type) — use first
    const table = marks.data[0];
    summary = {
      columns: table.columns.map(c => ({ fieldName: c.fieldName })),
      data: table.data // already an array of rows with raw values
    };
    document.getElementById('sel-count').textContent = table.totalRowCount;
  } else {
    const s = await worksheet.getSummaryDataAsync({ ignoreSelection: true, maxRows: 10000 });
    summary = s;
    document.getElementById('sel-count').textContent = 0;
  }

  // Change "Sales" below to your measure's field name exactly as it appears
  const sumSales = sumByField(summary, 'Sales');
  document.getElementById('sum-sales').textContent = sumSales.toLocaleString();
}

async function setParameter(dashboard, value) {
  const params = await tableau.extensions.dashboardContent.dashboard.getParametersAsync();
  const target = params.find(p => p.name === 'KPI Threshold'); // must exist in the workbook
  if (!target) throw new Error("Parameter 'KPI Threshold' not found in this workbook.");
  await target.changeValueAsync(Number(value));
}

async function main() {
  const status = document.getElementById('status');
  status.textContent = 'Initializing extension…';

  await tableau.extensions.initializeAsync();
  const dashboard = tableau.extensions.dashboardContent.dashboard;
  status.textContent = 'Initialized.';

  // Pick the first worksheet on the first dashboard object; adjust if needed
  const firstObject = dashboard.worksheets[0] || dashboard.worksheets?.[0];
  const worksheet = firstObject || dashboard.worksheets[0];
  if (!worksheet) throw new Error('No worksheet found for this dashboard.');

  document.getElementById('ws-name').textContent = worksheet.name;

  // Initial read + re-run when marks change
  await refreshKPIs(worksheet);
  worksheet.addEventListener(tableau.TableauEventType.MarkSelectionChanged, async () => {
    await refreshKPIs(worksheet);
  });

  // Parameter button
  document.getElementById('set-param').addEventListener('click', async () => {
    const v = document.getElementById('param-input').value;
    try {
      await setParameter(dashboard, v);
      status.textContent = `Parameter 'KPI Threshold' set to ${v}.`;
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
    }
  });
}

main().catch(err => {
  const status = document.getElementById('status');
  status.textContent = 'Initialization failed: ' + err.message;
  console.error(err);
});
