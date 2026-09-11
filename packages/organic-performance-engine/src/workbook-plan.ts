import { canonicalJson, sha256Json } from './analysis.js';
import { reportingSourcesSchema } from './source-config.js';
import {
  narrativeSchema,
  workbookSnapshotSchema,
  workbookTemplateSchema,
  type ReportRows,
  type ReportValue,
  type WorkbookBinding,
  type WorkbookSnapshot,
  type WorkbookTemplate,
} from './workbook-contract.js';

type SnapshotSheet = WorkbookSnapshot['sheets'][number];
type SnapshotCell = SnapshotSheet['data'][number]['rowData'][number]['values'][number];
interface WorkbookBatch {
  readonly sheet: string;
  readonly requests: Record<string, unknown>[];
}
export interface WorkbookPlan {
  readonly schemaVersion: 'organic-workbook-plan/v1';
  readonly spreadsheetId: string;
  readonly templateVersion: string;
  readonly templateSha256: string;
  readonly sourcesVersion: string;
  readonly sourcesSha256: string;
  readonly analysisSha256: string;
  readonly narrativeSha256: string;
  readonly factsSha256: string;
  readonly externalWritesPerformed: false;
  readonly batches: WorkbookBatch[];
}
function withoutIds(value: unknown, sheetId: number): unknown {
  if (Array.isArray(value)) return value.map((item) => withoutIds(item, sheetId));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'chartId')
        .map(([key, item]) => [
          key,
          key === 'sheetId' && item === sheetId ? 'self' : withoutIds(item, sheetId),
        ])
    );
  return value;
}
/** Native presentation fingerprint, independent of copied file/sheet IDs and period contents. */
export function sheetStyleFingerprint(sheet: SnapshotSheet, rows: number, columns: number): string {
  const cells = sheet.data.flatMap((grid) =>
    grid.rowData.flatMap((row, index) =>
      row.values.flatMap((cell, index_) =>
        grid.startRow + index < rows && grid.startColumn + index_ < columns
          ? [
              {
                row: grid.startRow + index,
                column: grid.startColumn + index_,
                format: cell.userEnteredFormat ?? {},
              },
            ]
          : []
      )
    )
  );
  return sha256Json(
    withoutIds(
      {
        index: sheet.properties.index,
        hidden: sheet.properties['hidden'] ?? false,
        grid: sheet.properties.gridProperties,
        merges: sheet.merges,
        charts: sheet.charts,
        conditionalFormats: sheet.conditionalFormats,
        dimensions: sheet.data.map((grid) => ({
          startRow: grid.startRow,
          startColumn: grid.startColumn,
          rows: grid.rowMetadata?.slice(0, rows),
          columns: grid.columnMetadata?.slice(0, columns),
        })),
        cells,
      },
      sheet.properties.sheetId
    )
  );
}
function cellAt(sheet: SnapshotSheet, row: number, column: number): SnapshotCell | undefined {
  for (const grid of sheet.data) {
    const found = grid.rowData.at(row - grid.startRow)?.values.at(column - grid.startColumn);
    if (row >= grid.startRow && column >= grid.startColumn && found) return found;
  }
  return undefined;
}
function validateCleanSheet(
  sheet: SnapshotSheet,
  expected: WorkbookTemplate['sheets'][number]
): void {
  if (sheetStyleFingerprint(sheet, expected.rows, expected.columns) !== expected.styleSha256)
    throw new Error('Template native structure or styling changed: ' + expected.title);
  const labels = new Map(
    expected.staticCells.map((cell) => [`${String(cell.row)}:${String(cell.column)}`, cell])
  );
  for (const cell of expected.staticCells) {
    const actual = cellAt(sheet, cell.row, cell.column);
    if (actual?.userEnteredValue?.stringValue !== cell.text || actual.note !== cell.note)
      throw new Error('Template static label or note changed: ' + expected.title);
  }
  for (const grid of sheet.data) {
    for (const [rowIndex, row] of grid.rowData.entries()) {
      for (const [columnIndex, cell] of row.values.entries()) {
        const label = labels.get(
          `${String(grid.startRow + rowIndex)}:${String(grid.startColumn + columnIndex)}`
        );
        if (!label && (cell.userEnteredValue || cell.note))
          throw new Error('Template contains stale period content: ' + expected.title);
      }
    }
  }
}
export function validateTemplateSnapshot(input: unknown, templateInput: unknown): WorkbookSnapshot {
  const snapshot = workbookSnapshotSchema.parse(input);
  const template = workbookTemplateSchema.parse(templateInput);
  if (
    canonicalJson(snapshot.sheets.map((sheet) => sheet.properties.title)) !==
    canonicalJson(template.sheets.map((sheet) => sheet.title))
  )
    throw new Error('Template sheet order or names changed');
  for (const [index, expected] of template.sheets.entries()) {
    const sheet = snapshot.sheets.at(index);
    if (!sheet) throw new Error('Template sheet missing');
    validateCleanSheet(sheet, expected);
  }
  return snapshot;
}
function rawNumberFormat(value: ReportValue): { type: string; pattern: string } {
  return {
    type: 'NUMBER',
    pattern: typeof value === 'number' && Number.isInteger(value) ? '#,##0' : '0.########',
  };
}
function valueCell(value: ReportValue, binding: WorkbookBinding, column: number): SnapshotCell {
  const numeric = typeof value === 'number' || binding.numericColumns.includes(column);
  const format = {
    horizontalAlignment: numeric ? 'RIGHT' : 'LEFT',
    ...(binding.percentColumns.includes(column)
      ? { numberFormat: { type: 'PERCENT', pattern: '0.0%' } }
      : binding.decimalColumns.includes(column)
        ? { numberFormat: { type: 'NUMBER', pattern: '0.0' } }
        : numeric
          ? { numberFormat: { type: 'NUMBER', pattern: '#,##0' } }
          : {}),
  };
  return {
    ...(value === null
      ? {}
      : {
          userEnteredValue:
            typeof value === 'number'
              ? { numberValue: value }
              : typeof value === 'boolean'
                ? { boolValue: value }
                : { stringValue: value },
        }),
    userEnteredFormat: binding.resetNumberFormat
      ? {
          ...format,
          numberFormat: rawNumberFormat(value),
        }
      : format,
  };
}
function updateBlock(
  sheetId: number,
  binding: WorkbookBinding,
  rows: ReportRows
): Record<string, unknown> {
  const rect = binding.range;
  if (
    rows.length > (binding.expandRows ?? rect.rows) ||
    rows.some((row) => row.length > rect.columns)
  )
    throw new Error(
      'Report block overflow; select a bounded view or version the template: ' + binding.id
    );
  if (
    rows.some((row) =>
      row.some((cell) => typeof cell === 'string' && cell.length > binding.maxCharacters)
    )
  )
    throw new Error(
      'Report text overflow; edit narrative without dropping evidence: ' + binding.id
    );
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: rect.row,
        endRowIndex: rect.row + Math.max(rect.rows, rows.length),
        startColumnIndex: rect.column,
        endColumnIndex: rect.column + rect.columns,
      },
      rows: Array.from({ length: Math.max(rect.rows, rows.length) }, (_, index) => ({
        values: Array.from({ length: rect.columns }, (_, index_) =>
          valueCell(rows.at(index)?.at(index_) ?? null, binding, index_)
        ),
      })),
      fields: binding.resetNumberFormat
        ? 'userEnteredValue,userEnteredFormat.horizontalAlignment,userEnteredFormat.numberFormat'
        : binding.preserveAlignment
          ? 'userEnteredValue'
          : 'userEnteredValue,userEnteredFormat.horizontalAlignment',
    },
  };
}
function isMergedInterior(sheet: SnapshotSheet, r: number, c: number): boolean {
  return sheet.merges.some((merge) => {
    const startRow = merge['startRowIndex'];
    const endRow = merge['endRowIndex'];
    const startColumn = merge['startColumnIndex'];
    const endColumn = merge['endColumnIndex'];
    if (
      typeof startRow !== 'number' ||
      typeof endRow !== 'number' ||
      typeof startColumn !== 'number' ||
      typeof endColumn !== 'number'
    )
      throw new Error('Malformed native merge');
    return (
      r >= startRow &&
      r < endRow &&
      c >= startColumn &&
      c < endColumn &&
      (r !== startRow || c !== startColumn)
    );
  });
}
function validateMergedCells(
  sheet: SnapshotSheet,
  binding: WorkbookBinding,
  rows: ReportRows
): void {
  for (const [rowIndex, row] of rows.entries())
    for (const [columnIndex, value] of row.entries()) {
      if (
        value !== null &&
        value !== '' &&
        isMergedInterior(sheet, binding.range.row + rowIndex, binding.range.column + columnIndex)
      )
        throw new Error(
          'Nonempty value is inside a merged cell; use sparse anchor columns: ' + binding.id
        );
    }
}
function chartForSheet(value: unknown, sheetId: number): unknown {
  if (Array.isArray(value)) return value.map((item) => chartForSheet(item, sheetId));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'sheetId' ? sheetId : chartForSheet(item, sheetId),
      ])
    );
  return value;
}
export function buildWorkbookPlan(input: {
  readonly target: unknown;
  readonly template: unknown;
  readonly sources: unknown;
  readonly analysis: unknown;
  readonly narrative: unknown;
  readonly facts: ReadonlyMap<string, ReportRows>;
}): WorkbookPlan {
  const template = workbookTemplateSchema.parse(input.template);
  const sources = reportingSourcesSchema.parse(input.sources);
  if (
    sources.template.id !== template.cleanTemplateId ||
    sources.template.version !== template.version
  )
    throw new Error('Source configuration and template identity disagree');
  const target = validateTemplateSnapshot(input.target, template);
  if (
    [
      sources.template.id,
      sources.approvedReport.id,
      ...sources.historicalReports.map((r) => r.id),
    ].includes(target.spreadsheetId)
  )
    throw new Error('Only a new report copy may be populated');
  const narrative = narrativeSchema.parse(input.narrative);
  if (narrative.analysisSha256 !== sha256Json(input.analysis))
    throw new Error('Narrative was authored against another analysis');
  const expected = template.sheets.flatMap((s) => s.bindings);
  const allowedFacts = new Set(expected.filter((b) => b.owner === 'facts').map((b) => b.id));
  const allowedNarrative = new Set(
    expected.filter((b) => b.owner === 'narrative').map((b) => b.id)
  );
  if (
    [...input.facts.keys()].some((key) => !allowedFacts.has(key)) ||
    Object.keys(narrative.blocks).some((key) => !allowedNarrative.has(key))
  )
    throw new Error('Unknown report binding; narrative cannot overwrite calculated evidence');
  const batches = template.sheets.map((sheet, index) => {
    const actual = target.sheets.at(index);
    if (!actual) throw new Error('Template sheet missing');
    return {
      sheet: sheet.title,
      requests: sheet.bindings
        .map((binding) => {
          const rows =
            binding.owner === 'facts'
              ? input.facts.get(binding.id)
              : Object.entries(narrative.blocks).find(([key]) => key === binding.id)?.[1];
          if (!rows) throw new Error('Missing report binding: ' + binding.id);
          validateMergedCells(actual, binding, rows);
          return { binding, rows, update: updateBlock(actual.properties.sheetId, binding, rows) };
        })
        .flatMap(({ binding, rows, update }) => {
          const end = binding.range.row + Math.max(binding.range.rows, rows.length);
          const growth: Record<string, unknown>[] =
            end > actual.properties.gridProperties.rowCount
              ? [
                  {
                    updateSheetProperties: {
                      properties: {
                        sheetId: actual.properties.sheetId,
                        gridProperties: { rowCount: end },
                      },
                      fields: 'gridProperties.rowCount',
                    },
                  },
                ]
              : [];
          if (binding.expandRows && rows.length > binding.range.rows)
            growth.push({
              copyPaste: {
                source: {
                  sheetId: actual.properties.sheetId,
                  startRowIndex: binding.range.row,
                  endRowIndex: binding.range.row + 1,
                  startColumnIndex: binding.range.column,
                  endColumnIndex: binding.range.column + binding.range.columns,
                },
                destination: {
                  sheetId: actual.properties.sheetId,
                  startRowIndex: binding.range.row,
                  endRowIndex: end,
                  startColumnIndex: binding.range.column,
                  endColumnIndex: binding.range.column + binding.range.columns,
                },
                pasteType: 'PASTE_FORMAT',
              },
            });
          return [...growth, update];
        })
        .concat(
          sheet.chartSpecs.map((spec, chartIndex) => {
            const chartId = actual.charts.at(chartIndex)?.['chartId'];
            if (typeof chartId !== 'number') throw new Error('Template chart is missing');
            return {
              updateChartSpec: { chartId, spec: chartForSheet(spec, actual.properties.sheetId) },
            };
          })
        ),
    };
  });
  return {
    schemaVersion: 'organic-workbook-plan/v1',
    spreadsheetId: target.spreadsheetId,
    templateVersion: template.version,
    templateSha256: sha256Json(template),
    sourcesVersion: sources.version,
    sourcesSha256: sha256Json(sources),
    analysisSha256: sha256Json(input.analysis),
    narrativeSha256: sha256Json(narrative),
    factsSha256: sha256Json(Object.fromEntries(input.facts)),
    externalWritesPerformed: false,
    batches,
  };
}

export function templateBindings(
  template: WorkbookTemplate
): (WorkbookBinding & { sheet: string })[] {
  return template.sheets.flatMap((sheet) =>
    sheet.bindings.map((binding) => ({ sheet: sheet.title, ...binding }))
  );
}
