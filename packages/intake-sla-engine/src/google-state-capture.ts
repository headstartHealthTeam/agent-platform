import { requireContract as check } from './connector-checkpoint.js';
import { captureProperty as field } from './google-capture-property.js';
import type { GoogleStateCaptureInput } from './google-capture-types.js';
import {
  GOOGLE_REVIEWER_FIELDS,
  GOVERNED_SHEETS,
  googleEnteredScalar,
  normalizeReviewerBlanks,
} from './google-capture-values.js';
import type { GoogleEnteredScalar } from './google-capture-values.js';
import { sha256Json } from './json-fingerprint.js';
import type { ReviewerSnapshotRow } from './publication-state.js';

interface NormalizedSheet {
  readonly title: string;
  readonly sheetId: number;
  readonly usedRowCount: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly values: GoogleEnteredScalar[][];
  readonly rawValues: unknown[][];
}
interface CaptureFreshness<Timestamp> {
  readonly revalidatedAt?: Timestamp;
  readonly revalidationHash?: string;
}
export interface GooglePublicationStateCapture<Timestamp = string> {
  readonly metadata: CaptureFreshness<Timestamp> & {
    readonly capturedAt: Timestamp;
    readonly spreadsheetId: string;
    readonly captureHash: string;
    readonly sheets: { title: string; sheetId: number; rowCount: number; columnCount: number }[];
  };
  readonly state: CaptureFreshness<Timestamp> & {
    readonly capturedAt: Timestamp;
    readonly spreadsheetId: string;
    readonly sheets: {
      title: string;
      sheetId: number;
      usedRowCount: number;
      values: GoogleEnteredScalar[][];
    }[];
  };
  readonly marker: CaptureFreshness<Timestamp> & {
    readonly capturedAt: Timestamp;
    readonly spreadsheetId: string;
    readonly values: GoogleEnteredScalar[][];
  };
  readonly reviewer: CaptureFreshness<Timestamp> & {
    readonly capturedAt: Timestamp;
    readonly spreadsheetId: string;
    readonly rows: ReviewerSnapshotRow[];
  };
  readonly competing: {
    readonly checkedAt: Timestamp;
    readonly currentRunId: string;
    readonly conflict: boolean;
    readonly captureHash: string;
  };
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value);
}
function list(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
function revalidation(
  capture: unknown,
  expectedSpreadsheetId: string,
  capturedAt: unknown
): unknown {
  const proof = field(capture, 'revalidation');
  const hasProof = Boolean(proof);
  if (!hasProof) return undefined;
  const response = field(proof, 'response');
  const file = field(response, 'structuredContent');
  const modified = Date.parse(String(field(file, 'modified_time')));
  const checkedAt = field(proof, 'checkedAt');
  const checked = Date.parse(String(checkedAt));
  check(
    field(response, 'isError') === false &&
      field(file, 'id') === expectedSpreadsheetId &&
      field(file, 'mime_type') === 'application/vnd.google-apps.spreadsheet' &&
      Number.isFinite(modified) &&
      modified <= Date.parse(String(capturedAt)) &&
      Number.isFinite(checked) &&
      checked >= Date.parse(String(capturedAt)) &&
      checked <= Date.now(),
    'Google retained snapshot has no valid unchanged-file proof'
  );
  return checkedAt;
}
function normalizeSheet(sheet: unknown, title: string): NormalizedSheet {
  const values = field(sheet, 'values');
  const sheetId = field(sheet, 'sheetId');
  const usedRowCount = field(sheet, 'usedRowCount');
  const rowCount = field(sheet, 'rowCount');
  const columnCount = field(sheet, 'columnCount');
  check(
    integer(sheetId) &&
      sheetId >= 0 &&
      integer(usedRowCount) &&
      usedRowCount >= 1 &&
      integer(rowCount) &&
      rowCount >= usedRowCount &&
      integer(columnCount) &&
      columnCount > 0 &&
      field(sheet, 'rangeComplete') === true &&
      list(values) &&
      values.length === usedRowCount &&
      values.every((row): row is unknown[] => list(row) && row.length <= columnCount),
    'Incomplete Google Sheet extent capture'
  );
  return {
    title,
    sheetId,
    usedRowCount,
    rowCount,
    columnCount,
    rawValues: values,
    values: values.map((row) => row.map(googleEnteredScalar)),
  };
}
function requiredSheet(sheets: readonly NormalizedSheet[], title: string): NormalizedSheet {
  const sheet = sheets.find((candidate) => candidate.title === title);
  check(sheet !== undefined, 'Incomplete Google Sheet extent capture');
  return sheet;
}
function reviewerRows(sheets: readonly NormalizedSheet[]): ReviewerSnapshotRow[] {
  const output: ReviewerSnapshotRow[] = [];
  for (const title of ['Review Queue', 'On-Hold Review']) {
    const sheet = requiredSheet(sheets, title);
    const [headers = [], ...data] = sheet.values;
    check(
      new Set(headers).size === headers.length &&
        GOOGLE_REVIEWER_FIELDS.every(([header]) => headers.includes(header)) &&
        headers.includes('Salesforce') &&
        headers.includes('Opportunity Name'),
      'Reviewer capture headers are incomplete'
    );
    for (const [offset, row] of data.entries()) {
      const rawRow = sheet.rawValues.at(offset + 1);
      check(
        GOOGLE_REVIEWER_FIELDS.every(
          ([header]) => !Object.hasOwn(rawRow?.at(headers.indexOf(header)) ?? {}, 'formulaValue')
        ),
        'Formula-valued reviewer fields need typed preservation; do not convert a formula to text'
      );
      const link = row.at(headers.indexOf('Salesforce'));
      const opportunityId =
        typeof link === 'string'
          ? /\/Opportunity\/([A-Za-z0-9]+)\/view(?:"|$)/.exec(link)?.[1]
          : null;
      check(Boolean(opportunityId), 'Reviewer identity is missing or ambiguous');
      output.push({
        opportunityId,
        opportunityName: row.at(headers.indexOf('Opportunity Name')),
        ...Object.fromEntries(
          GOOGLE_REVIEWER_FIELDS.map(([header, key]) => [
            key,
            row.at(headers.indexOf(header)) ?? null,
          ])
        ),
      });
    }
  }
  return output;
}
function markerAndHistory(sheets: readonly NormalizedSheet[]): {
  notes: GoogleEnteredScalar[][];
  history: GoogleEnteredScalar[][];
  historyIndex: number;
} {
  const notes = requiredSheet(sheets, 'Source & Run Notes').values;
  for (const label of ['Run ID', 'Last Refresh (ET)'])
    check(notes.filter((row) => row[0] === label).length === 1, 'Missing or duplicate live marker');
  const history = requiredSheet(sheets, 'Run History').values;
  const historyIndex = history[0]?.indexOf('Run ID') ?? -1;
  check(
    historyIndex >= 0 &&
      history.slice(1).every((row) => {
        const id = row.at(historyIndex);
        return typeof id === 'string' && id.length > 0;
      }) &&
      new Set(history.slice(1).map((row) => row.at(historyIndex))).size === history.length - 1,
    'Run History IDs are missing or duplicated'
  );
  return { notes, history, historyIndex };
}
function concurrency(
  capture: unknown,
  currentRunId: string,
  checkedAt: unknown
): { conflict: boolean; exactResumeVerified: unknown } {
  const concurrent =
    field(field(capture, 'revalidation'), 'concurrency') ?? field(capture, 'concurrency');
  const conflict = field(concurrent, 'conflict');
  check(
    field(concurrent, 'currentRunId') === currentRunId &&
      field(concurrent, 'checkedAt') === checkedAt &&
      typeof conflict === 'boolean' &&
      field(concurrent, 'operatorVerified') === true,
    'Independent competing-run check is required'
  );
  return { conflict, exactResumeVerified: field(concurrent, 'exactResumeVerified') };
}
export function captureGooglePublicationState(
  capture: GoogleStateCaptureInput | null | undefined,
  expectedSpreadsheetId: string,
  currentRunId: string
): GooglePublicationStateCapture;
export function captureGooglePublicationState(
  capture: unknown,
  expectedSpreadsheetId: string,
  currentRunId: string
): GooglePublicationStateCapture<unknown>;
export function captureGooglePublicationState(
  capture: unknown,
  expectedSpreadsheetId: string,
  currentRunId: string
): GooglePublicationStateCapture<unknown> {
  const capturedAt = field(capture, 'capturedAt');
  const sheets = field(capture, 'sheets');
  check(
    field(capture, 'version') === 1 &&
      field(capture, 'spreadsheetId') === expectedSpreadsheetId &&
      Number.isFinite(Date.parse(String(capturedAt))) &&
      Date.parse(String(capturedAt)) <= Date.now() &&
      field(capture, 'valueRenderOption') === 'USER_ENTERED' &&
      field(capture, 'extentsVerified') === true &&
      list(sheets),
    'Google state capture provenance is incomplete'
  );
  const revalidatedAt = revalidation(capture, expectedSpreadsheetId, capturedAt);
  const hasRevalidation = Boolean(revalidatedAt);
  const freshness: CaptureFreshness<unknown> = hasRevalidation
    ? { revalidatedAt, revalidationHash: sha256Json(field(capture, 'revalidation')) }
    : {};
  const raw = new Map(
    sheets.map((sheet) => {
      // The original consumes identities for every tab, but extents/cells only for governed tabs.
      if (sheet === null || sheet === undefined)
        throw new TypeError('Missing Google Sheet identity');
      return [field(sheet, 'title'), sheet];
    })
  );
  check(
    raw.size === sheets.length &&
      new Set(sheets.map((sheet) => field(sheet, 'sheetId'))).size === sheets.length,
    'Duplicate Google Sheet title or ID'
  );
  const normalized = GOVERNED_SHEETS.map((title) => normalizeSheet(raw.get(title), title));
  const reviewer = normalizeReviewerBlanks({
    capturedAt,
    ...freshness,
    spreadsheetId: expectedSpreadsheetId,
    rows: reviewerRows(normalized),
  });
  const { notes, history, historyIndex } = markerAndHistory(normalized);
  const checkedAt = revalidatedAt ?? capturedAt;
  const concurrent = concurrency(capture, currentRunId, checkedAt);
  return {
    metadata: {
      capturedAt,
      ...freshness,
      spreadsheetId: expectedSpreadsheetId,
      captureHash: sha256Json(capture),
      sheets: normalized.map(({ title, sheetId, rowCount, columnCount }) => ({
        title,
        sheetId,
        rowCount,
        columnCount,
      })),
    },
    state: {
      capturedAt,
      ...freshness,
      spreadsheetId: expectedSpreadsheetId,
      sheets: normalized.map(({ title, sheetId, usedRowCount, values }) => ({
        title,
        sheetId,
        usedRowCount,
        values,
      })),
    },
    marker: { capturedAt, ...freshness, spreadsheetId: expectedSpreadsheetId, values: notes },
    reviewer,
    competing: {
      checkedAt,
      currentRunId,
      conflict:
        concurrent.conflict ||
        (history.slice(1).some((row) => row.at(historyIndex) === currentRunId) &&
          concurrent.exactResumeVerified !== true),
      captureHash: sha256Json(capture),
    },
  };
}
