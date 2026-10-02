import { captureProperty } from './google-capture-property.js';
import type {
  GooglePublicationLiveSheet,
  GooglePublicationPlanInputs,
  GoogleWorkbookSheets,
  GooglePublicationRows,
} from './google-publication-types.js';
import {
  normalizePublicationRows,
  publicationMatrix,
  workbookSheet,
} from './google-publication-values.js';

export const REPLACEMENT_SHEETS = [
  'Review Queue',
  'On-Hold Review',
  'Evidence Detail',
  'Data Dictionary',
] as const;
export const TERMINAL_MARKER_FIELDS = new Set<unknown>(['Last Refresh (ET)', 'Run ID']);
export interface GooglePublicationContext {
  readonly sheets: GoogleWorkbookSheets;
  readonly states: ReadonlyMap<string, GooglePublicationLiveSheet>;
}
function requireSheet(
  title: string,
  metadataByTitle: ReadonlyMap<unknown, unknown>,
  stateByTitle: ReadonlyMap<unknown, unknown>
): GooglePublicationLiveSheet {
  const metadata = metadataByTitle.get(title),
    state = stateByTitle.get(title);
  if (metadata === undefined || state === undefined)
    throw new Error(`Current live state is missing ${title}`);
  if (Number(captureProperty(metadata, 'sheetId')) !== Number(captureProperty(state, 'sheetId')))
    throw new Error(`Sheet ID changed for ${title}`);
  const usedRowCount = Number(captureProperty(state, 'usedRowCount'));
  if (!Number.isInteger(usedRowCount) || usedRowCount < 1)
    throw new Error(`Current used row count is missing for ${title}`);
  const grid = captureProperty(metadata, 'gridProperties');
  const rowCount = Number(
    captureProperty(metadata, 'rowCount') ?? captureProperty(grid, 'rowCount')
  );
  const columnCount = Number(
    captureProperty(metadata, 'columnCount') ?? captureProperty(grid, 'columnCount')
  );
  if (!Number.isInteger(rowCount) || !Number.isInteger(columnCount))
    throw new Error(`Current grid dimensions are missing for ${title}`);
  const values = captureProperty(state, 'values') ?? [];
  if (!isRows(values)) throw new TypeError('Invalid consumed live rows');
  return {
    sheetId: Number(captureProperty(metadata, 'sheetId')),
    rowCount,
    columnCount,
    usedRowCount,
    values: normalizePublicationRows(publicationMatrix(values)),
  };
}
function sheetEntry(sheet: unknown): [unknown, unknown] {
  if (sheet === null || sheet === undefined) throw new TypeError('Missing sheet entry');
  return [captureProperty(sheet, 'title'), sheet];
}
function isRows(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
export function publicationContext(input: GooglePublicationPlanInputs): GooglePublicationContext {
  const { workbook, metadata, liveState } = input;
  if (metadata.spreadsheetId !== liveState.spreadsheetId)
    throw new Error('Google metadata and current publication state target different spreadsheets');
  const metadataByTitle = new Map((metadata.sheets ?? []).map(sheetEntry));
  const stateByTitle = new Map((liveState.sheets ?? []).map(sheetEntry));
  const raw = captureProperty(workbook, 'sheets') ?? workbook;
  const states = new Map<string, GooglePublicationLiveSheet>();
  const sheets: [string, readonly unknown[]][] = [];
  for (const title of [
    ...REPLACEMENT_SHEETS,
    'Source & Run Notes',
    'Generation Ledger',
    'Run History',
  ]) {
    states.set(title, requireSheet(title, metadataByTitle, stateByTitle));
    const rows = captureProperty(raw, title);
    if (!isRows(rows) || rows.length === 0) throw new Error(`Workbook is missing ${title}`);
    sheets.push([title, rows]);
  }
  return { sheets: Object.fromEntries(sheets), states };
}
export function contextRows(context: GooglePublicationContext, title: string): readonly unknown[] {
  const rows = workbookSheet(context.sheets, title);
  if (rows === undefined) throw new TypeError('Missing required workbook sheet');
  return rows;
}
export function contextMatrix(
  context: GooglePublicationContext,
  title: string
): GooglePublicationRows {
  return publicationMatrix(contextRows(context, title));
}
export function contextState(
  context: GooglePublicationContext,
  title: string
): GooglePublicationLiveSheet {
  const state = context.states.get(title);
  if (state === undefined) throw new TypeError('Missing required live sheet');
  return state;
}
export function publicationHeaders(rows: readonly unknown[]): readonly unknown[] {
  const headers = rows[0];
  if (!isRows(headers)) throw new TypeError('Missing workbook headers');
  return headers;
}
