import type {
  ArtifactWorkbook,
  WorkbookMatrix,
  WorkbookWorksheet,
} from '@headstart-health/artifact-workbook';

import { OPERATOR_HEADER_HEIGHT_PX, OPERATOR_ROW_HEIGHT_PX } from './google-presentation.js';

export const INTAKE_WORKBOOK_SHEETS = [
  'Review Queue',
  'On-Hold Review',
  'Evidence Detail',
  'Source & Run Notes',
  'Data Dictionary',
  'Run History',
  'Generation Ledger',
] as const;
export type IntakeWorkbookTables = Readonly<
  Record<(typeof INTAKE_WORKBOOK_SHEETS)[number], WorkbookMatrix>
>;

const OPERATOR_WIDTHS: Readonly<Record<string, number>> = {
  'Opportunity Name': 180,
  Salesforce: 90,
  Practice: 190,
  'Relevant Provider': 170,
  'CSM / Owner': 150,
  Stage: 190,
  'Days Breached': 90,
  'Blocking Gate': 300,
  Freshness: 105,
  'Last Substantive Update Date': 120,
  'Last Substantive Update Source': 170,
  'Last Substantive Update': 360,
  'Identity Match Review': 240,
  'Suggested SLA Summary': 440,
  'In-Depth Summary': 650,
  'Outstanding Task Count': 95,
  'Outstanding Task': 300,
  'Task Owner': 150,
  'Task Status': 120,
  'Task Due Date': 125,
  'Suggested Action': 420,
  'Action Type': 155,
  'Action Owner': 150,
  'Suggested Follow-Up Date': 135,
  'Ready to Copy': 110,
  'Why Review Needed': 400,
  'Reviewer Notes': 320,
  'Copied to Salesforce?': 125,
  'Needs CSM Review': 125,
  'Current SLA Delay Summary': 420,
  'Current Action Item': 360,
  'Next Milestone': 300,
  'Follow-Up Date Basis': 135,
  'Evidence Status': 120,
  'Best Source': 170,
  'Reviewed By': 140,
  'Reviewed At': 140,
  'On Hold Reason': 240,
  'On Hold Start Date': 125,
  'Days On Hold': 90,
  'Restart Condition': 360,
};
const FRESHNESS_COLORS = new Map([
  ['Missing', '#FECACA'],
  ['Stale', '#FED7AA'],
  ['Semi-Stale', '#FEF3C7'],
  ['Current', '#DCFCE7'],
]);
interface SheetData {
  readonly sheet: WorkbookWorksheet;
  readonly rows: WorkbookMatrix;
  readonly headers: readonly unknown[];
  readonly columns: number;
}
function commonFormat({ sheet, columns }: SheetData): void {
  sheet.freezeRows(1);
  sheet.showGridLines(false);
  const used = sheet.usedRange();
  used.setFont({ name: 'Arial', size: 10 });
  const header = sheet.rangeByIndexes(0, 0, 1, columns);
  header.setFont({ bold: true });
  header.setFillColor('#E5E7EB');
  header.setFont({ color: '#111827' });
  header.setFormat({ wrapText: true });
  used.setFormat({ wrapText: true });
  used.setFormat({ borders: { preset: 'outside', style: 'thin', color: '#CBD5E1' } });
  used.autofitColumns();
}
function columnWidths(sheet: WorkbookWorksheet, widths: Readonly<Record<string, number>>): void {
  for (const [column, columnWidthPx] of Object.entries(widths))
    sheet.range(`${column}:${column}`).setFormat({ columnWidthPx });
}
function headerWidths({ sheet, headers }: SheetData): void {
  for (const [header, columnWidthPx] of Object.entries(OPERATOR_WIDTHS)) {
    const index = headers.indexOf(header);
    if (index >= 0) sheet.rangeByIndexes(0, index, 1, 1).setFormat({ columnWidthPx });
  }
}
function operatorRows({ sheet, rows, columns }: SheetData): void {
  sheet.rangeByIndexes(0, 0, 1, columns).setFormat({ rowHeightPx: OPERATOR_HEADER_HEIGHT_PX });
  if (rows.length > 1)
    sheet
      .rangeByIndexes(1, 0, rows.length - 1, columns)
      .setFormat({ rowHeightPx: OPERATOR_ROW_HEIGHT_PX });
}
function operatorCells({ sheet, rows, headers }: SheetData): void {
  for (const header of ['Suggested SLA Summary', 'In-Depth Summary', 'Suggested Action']) {
    const column = headers.indexOf(header);
    if (column >= 0)
      sheet.rangeByIndexes(0, column, rows.length, 1).setFormat({ horizontalAlignment: 'left' });
  }
  for (const [index, row] of rows.entries()) {
    if (index === 0) continue;
    const value = row[8];
    const color = typeof value === 'string' ? FRESHNESS_COLORS.get(value) : undefined;
    if (color) sheet.rangeByIndexes(index, 8, 1, 1).setFillColor(color);
  }
}
function initialOperatorFormat(queue: WorkbookWorksheet, hold: WorkbookWorksheet): void {
  queue.freezeColumns(2);
  hold.freezeColumns(2);
  for (const sheet of [queue, hold])
    for (const column of ['J', 'U'])
      sheet.range(`${column}:${column}`).setNumberFormat('yyyy-mm-dd');
  hold.range('AB:AB').setNumberFormat('yyyy-mm-dd');
  const common = { M: 90, N: 300, O: 180, P: 120, Q: 140, R: 360, W: 280, X: 280 };
  columnWidths(queue, { K: 360, L: 520, ...common });
  columnWidths(hold, common);
  queue.range('A1:AJ1').setFormat({ rowHeightPx: 42 });
  queue.range('A:AJ').setFormat({ rowHeightPx: 56 });
  hold.range('A1:AN1').setFormat({ rowHeightPx: 42 });
  hold.range('A:AN').setFormat({ rowHeightPx: 56 });
}
/** Values are already assembled by Intake; this function only preserves the approved XLSX layout. */
export function populateIntakeWorkbook(
  workbook: ArtifactWorkbook,
  tables: IntakeWorkbookTables
): void {
  const byName = new Map(Object.entries(tables));
  const sheets = INTAKE_WORKBOOK_SHEETS.map((name): SheetData => {
    const rows = byName.get(name);
    if (!rows) throw new TypeError(`Missing workbook table: ${name}`);
    const headers = rows[0];
    if (!headers) throw new TypeError(`Missing workbook headers: ${name}`);
    const columns =
      name === 'Source & Run Notes' || name === 'Data Dictionary' ? 2 : headers.length;
    return { sheet: workbook.addWorksheet(name), rows, headers, columns };
  });
  for (const { sheet, rows, columns } of sheets)
    sheet.rangeByIndexes(0, 0, rows.length, columns).setValues(rows);
  for (const entry of sheets) commonFormat(entry);
  const [queue, hold, evidence, , , history] = sheets;
  if (!queue || !hold || !evidence || !history)
    throw new Error('Incomplete Intake workbook layout');
  initialOperatorFormat(queue.sheet, hold.sheet);
  evidence.sheet.range('A1:AE1').setFormat({ rowHeightPx: 42 });
  evidence.sheet.range('A:AE').setFormat({ rowHeightPx: 72 });
  history.sheet.range('A:M').setFormat({ columnWidthPx: 150 });
  headerWidths(queue);
  headerWidths(hold);
  queue.sheet.usedRange().setFormat({ verticalAlignment: 'top' });
  hold.sheet.usedRange().setFormat({ verticalAlignment: 'top' });
  operatorRows(queue);
  operatorRows(hold);
  operatorCells(queue);
  operatorCells(hold);
}
