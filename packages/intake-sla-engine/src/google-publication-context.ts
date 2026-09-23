import { captureProperty } from './google-capture-property.js';
import type {
  GooglePublicationLiveSheet,
  GooglePublicationMetadataSheet,
  GooglePublicationStateSheet,
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
  metadataByTitle: ReadonlyMap<string, GooglePublicationMetadataSheet>,
  stateByTitle: ReadonlyMap<string, GooglePublicationStateSheet>
): GooglePublicationLiveSheet {
  const metadata = metadataByTitle.get(title),
    state = stateByTitle.get(title);
  if (metadata === undefined || state === undefined)
    throw new Error(`Current live state is missing ${title}`);
  if (Number(metadata.sheetId) !== Number(state.sheetId))
    throw new Error(`Sheet ID changed for ${title}`);
  if (!Number.isInteger(Number(state.usedRowCount)) || Number(state.usedRowCount) < 1)
    throw new Error(`Current used row count is missing for ${title}`);
  const rowCount = Number(metadata.rowCount ?? metadata.gridProperties?.rowCount);
  const columnCount = Number(metadata.columnCount ?? metadata.gridProperties?.columnCount);
  if (!Number.isInteger(rowCount) || !Number.isInteger(columnCount))
    throw new Error(`Current grid dimensions are missing for ${title}`);
  return {
    sheetId: Number(metadata.sheetId),
    rowCount,
    columnCount,
    usedRowCount: Number(state.usedRowCount),
    values: normalizePublicationRows(state.values ?? []),
  };
}
function isRows(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
export function publicationContext(input: GooglePublicationPlanInputs): GooglePublicationContext {
  const { workbook, metadata, liveState } = input;
  if (metadata.spreadsheetId !== liveState.spreadsheetId)
    throw new Error('Google metadata and current publication state target different spreadsheets');
  const metadataByTitle = new Map((metadata.sheets ?? []).map((sheet) => [sheet.title, sheet]));
  const stateByTitle = new Map((liveState.sheets ?? []).map((sheet) => [sheet.title, sheet]));
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
