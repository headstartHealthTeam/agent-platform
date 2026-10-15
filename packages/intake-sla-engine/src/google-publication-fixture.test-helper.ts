const EVIDENCE = 'Evidence Detail';
const REVIEW = [
  'Salesforce',
  'Freshness',
  'Needs CSM Review',
  'Reviewer Notes',
  'Copied to Salesforce?',
  'Reviewed By',
  'Reviewed At',
];
export function publicationStorageFixture(): Record<string, unknown> {
  const sheets: Record<string, unknown[][]> = {
    'Review Queue': [REVIEW],
    'On-Hold Review': [REVIEW],
    [EVIDENCE]: [['Evidence'], ['before']],
    'Data Dictionary': [['Field']],
    'Source & Run Notes': [
      ['Field', 'Value'],
      ['Run ID', 'run'],
      ['Last Refresh (ET)', 'new'],
    ],
    'Generation Ledger': [
      ['Run ID', 'Publication Status'],
      ['run', 'Pending'],
    ],
    'Run History': [
      ['Run ID', 'Publish Status'],
      ['run', 'Pending'],
    ],
  };
  const metadata = Object.keys(sheets).map((title, sheetId) => ({
    title,
    sheetId,
    rowCount: 1,
    columnCount: 1,
  }));
  const live = Object.entries(sheets).map(([title, rows], sheetId) => {
    const values =
      title === 'Source & Run Notes'
        ? [rows[0], ['Run ID', 'old'], ['Last Refresh (ET)', 'old']]
        : rows.slice(0, 1);
    return { title, sheetId, usedRowCount: values.length, values };
  });
  return {
    'workbook-values.json': { sheets },
    'run_manifest.json': { runId: 'run' },
    'google_sheet_metadata_current.json': { spreadsheetId: 'sheet', sheets: metadata },
    'google_publication_state.json': { spreadsheetId: 'sheet', sheets: live },
    'reviewer_state_current.json': { rows: [], capturedAt: 123, unrelated: null },
  };
}
