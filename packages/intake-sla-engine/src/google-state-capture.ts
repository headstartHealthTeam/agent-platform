import { requireContract as check } from './connector-checkpoint.js';
import type {
  GoogleConcurrencyCapture,
  GoogleStateCaptureInput,
  GoogleStateSheet,
} from './google-capture-types.js';
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
}
interface CaptureFreshness {
  readonly revalidatedAt?: string;
  readonly revalidationHash?: string;
}
export interface GooglePublicationStateCapture {
  readonly metadata: CaptureFreshness & {
    readonly capturedAt: string;
    readonly spreadsheetId: string;
    readonly captureHash: string;
    readonly sheets: { title: string; sheetId: number; rowCount: number; columnCount: number }[];
  };
  readonly state: CaptureFreshness & {
    readonly capturedAt: string;
    readonly spreadsheetId: string;
    readonly sheets: {
      title: string;
      sheetId: number;
      usedRowCount: number;
      values: GoogleEnteredScalar[][];
    }[];
  };
  readonly marker: CaptureFreshness & {
    readonly capturedAt: string;
    readonly spreadsheetId: string;
    readonly values: GoogleEnteredScalar[][];
  };
  readonly reviewer: CaptureFreshness & {
    readonly capturedAt: string;
    readonly spreadsheetId: string;
    readonly rows: ReviewerSnapshotRow[];
  };
  readonly competing: {
    readonly checkedAt: string;
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
  capture: GoogleStateCaptureInput,
  expectedSpreadsheetId: string,
  capturedAt: string
): CaptureFreshness {
  if (!capture.revalidation) return {};
  const proof = capture.revalidation;
  const file = proof.response?.structuredContent;
  const modified = Date.parse(String(file?.modified_time));
  const checked = Date.parse(String(proof.checkedAt));
  check(
    proof.response?.isError === false &&
      file?.id === expectedSpreadsheetId &&
      file.mime_type === 'application/vnd.google-apps.spreadsheet' &&
      Number.isFinite(modified) &&
      modified <= Date.parse(capturedAt) &&
      Number.isFinite(checked) &&
      checked >= Date.parse(capturedAt) &&
      checked <= Date.now(),
    'Google retained snapshot has no valid unchanged-file proof'
  );
  // A valid parsed timestamp above establishes this field without re-dating the retained capture.
  check(
    proof.checkedAt !== undefined,
    'Google retained snapshot has no valid unchanged-file proof'
  );
  return { revalidatedAt: proof.checkedAt, revalidationHash: sha256Json(proof) };
}
function normalizeSheet(sheet: GoogleStateSheet | undefined): NormalizedSheet {
  const values = sheet?.values;
  check(
    sheet !== undefined &&
      integer(sheet.sheetId) &&
      sheet.sheetId >= 0 &&
      integer(sheet.usedRowCount) &&
      sheet.usedRowCount >= 1 &&
      integer(sheet.rowCount) &&
      sheet.rowCount >= sheet.usedRowCount &&
      integer(sheet.columnCount) &&
      sheet.columnCount > 0 &&
      sheet.rangeComplete === true &&
      list(values) &&
      values.length === sheet.usedRowCount &&
      values.every((row) => list(row) && row.length <= (sheet.columnCount ?? 0)),
    'Incomplete Google Sheet extent capture'
  );
  return {
    ...sheet,
    sheetId: sheet.sheetId,
    usedRowCount: sheet.usedRowCount,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    values: values.map((row) => row.map(googleEnteredScalar)),
  };
}
function requiredSheet(sheets: readonly NormalizedSheet[], title: string): NormalizedSheet {
  const sheet = sheets.find((candidate) => candidate.title === title);
  check(sheet !== undefined, 'Incomplete Google Sheet extent capture');
  return sheet;
}
function reviewerRows(
  sheets: readonly NormalizedSheet[],
  raw: ReadonlyMap<string, GoogleStateSheet>
): ReviewerSnapshotRow[] {
  const output: ReviewerSnapshotRow[] = [];
  for (const title of ['Review Queue', 'On-Hold Review']) {
    const [headers = [], ...data] = requiredSheet(sheets, title).values;
    check(
      new Set(headers).size === headers.length &&
        GOOGLE_REVIEWER_FIELDS.every(([header]) => headers.includes(header)) &&
        headers.includes('Salesforce') &&
        headers.includes('Opportunity Name'),
      'Reviewer capture headers are incomplete'
    );
    for (const [offset, row] of data.entries()) {
      const rawRow = raw.get(title)?.values?.at(offset + 1);
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
  capture: GoogleStateCaptureInput,
  currentRunId: string,
  checkedAt: string
): GoogleConcurrencyCapture & { conflict: boolean } {
  const concurrent = capture.revalidation?.concurrency ?? capture.concurrency;
  check(
    concurrent?.currentRunId === currentRunId &&
      concurrent.checkedAt === checkedAt &&
      typeof concurrent.conflict === 'boolean' &&
      concurrent.operatorVerified === true,
    'Independent competing-run check is required'
  );
  return { ...concurrent, conflict: concurrent.conflict };
}
export function captureGooglePublicationState(
  capture: GoogleStateCaptureInput | null | undefined,
  expectedSpreadsheetId: string,
  currentRunId: string
): GooglePublicationStateCapture {
  const capturedAt = capture?.capturedAt;
  const sheets = capture?.sheets;
  check(
    capture?.version === 1 &&
      capture.spreadsheetId === expectedSpreadsheetId &&
      capturedAt !== undefined &&
      Number.isFinite(Date.parse(capturedAt)) &&
      Date.parse(capturedAt) <= Date.now() &&
      capture.valueRenderOption === 'USER_ENTERED' &&
      capture.extentsVerified === true &&
      list(sheets),
    'Google state capture provenance is incomplete'
  );
  const freshness = revalidation(capture, expectedSpreadsheetId, capturedAt);
  const raw = new Map(sheets.map((sheet) => [sheet.title, sheet]));
  check(
    raw.size === sheets.length &&
      new Set(sheets.map((sheet) => sheet.sheetId)).size === sheets.length,
    'Duplicate Google Sheet title or ID'
  );
  const normalized = GOVERNED_SHEETS.map((title) => normalizeSheet(raw.get(title)));
  const reviewer = normalizeReviewerBlanks({
    capturedAt,
    ...freshness,
    spreadsheetId: expectedSpreadsheetId,
    rows: reviewerRows(normalized, raw),
  });
  const { notes, history, historyIndex } = markerAndHistory(normalized);
  const checkedAt = freshness.revalidatedAt ?? capturedAt;
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
