import { captureProperty } from './google-capture-property.js';
import { valuesAssertion } from './google-publication-cells.js';
import { publicationHeaders } from './google-publication-context.js';
import type {
  GooglePublicationFragment,
  GooglePublicationRows,
} from './google-publication-types.js';
import {
  googleCellValue,
  publicationItem,
  publicationRowHash,
  publicationRowsEqual,
  setPublicationCell,
} from './google-publication-values.js';

export interface GoogleAppendRow {
  readonly rowIndex: number;
  readonly desired: readonly unknown[];
  readonly published: boolean;
}
export interface GoogleAppendPlan {
  readonly headers: readonly unknown[];
  readonly pendingRows: unknown[][];
  readonly appendStart: number;
  readonly rowsToFinalize: GoogleAppendRow[];
}
interface AppendInput {
  readonly title: string;
  readonly runId: string;
  readonly desiredRows: readonly unknown[];
  readonly liveValues: GooglePublicationRows;
  readonly statusIndex: number;
  readonly pendingStatus: string;
}
function rowArray(row: unknown): row is readonly unknown[] {
  return Array.isArray(row);
}
function desiredRowValue(row: unknown, index: number): unknown {
  if (row === null || row === undefined) throw new TypeError('Missing desired append row');
  if (rowArray(row)) return publicationItem(row, index);
  if (typeof row === 'string')
    return index >= 0 && index < row.length ? row.slice(index, index + 1) : undefined;
  return captureProperty(row, String(index));
}
function selectedRow(row: unknown): unknown[] {
  if (rowArray(row)) return [...row];
  if (typeof row === 'string') return Array.from(row);
  throw new TypeError('Selected append row is not iterable');
}
function existingRows(
  input: AppendInput,
  runIdIndex: number,
  desiredByKey: Map<string, unknown[]>
): GoogleAppendRow[] {
  const existing: GoogleAppendRow[] = [];
  const { title, runId, liveValues, statusIndex, pendingStatus } = input;
  for (const [offset, row] of liveValues.slice(1).entries()) {
    if (publicationItem(row, runIdIndex) !== runId) continue;
    const desired = desiredByKey.get(publicationRowHash(row.slice(0, statusIndex)));
    if (desired === undefined) throw new Error(`${title} contains a conflicting row for ${runId}`);
    const publishedMatch = publicationRowsEqual(row, desired);
    const pending = [...desired];
    setPublicationCell(pending, statusIndex, pendingStatus);
    if (!publishedMatch && !publicationRowsEqual(row, pending))
      throw new Error(`${title} contains a non-idempotent row for ${runId}`);
    existing.push({ rowIndex: offset + 1, desired, published: publishedMatch });
    desiredByKey.delete(publicationRowHash(desired.slice(0, statusIndex)));
  }
  return existing;
}
export function appendOnlyPlan(input: AppendInput): GoogleAppendPlan {
  const { title, runId, desiredRows, liveValues, statusIndex, pendingStatus } = input;
  const headers = publicationHeaders(desiredRows);
  const runIdIndex = headers.indexOf('Run ID');
  if (runIdIndex < 0 || statusIndex < 0)
    throw new Error(`${title} is missing Run ID or publication status`);
  const liveHeaders = liveValues[0];
  if (
    liveValues.length > 0 &&
    (liveHeaders === undefined || !publicationRowsEqual(headers, liveHeaders))
  )
    throw new Error(`${title} header changed since workbook generation`);
  const desiredCurrent = desiredRows
    .slice(1)
    .filter((row) => desiredRowValue(row, runIdIndex) === runId)
    .map((row) => {
      const published = selectedRow(row);
      setPublicationCell(published, statusIndex, 'Published');
      return published;
    });
  if (desiredCurrent.length === 0) throw new Error(`${title} has no row for ${runId}`);
  const desiredByKey = new Map(
    desiredCurrent.map((row) => [publicationRowHash(row.slice(0, statusIndex)), row])
  );
  const existing = existingRows(input, runIdIndex, desiredByKey);
  const missing = [...desiredByKey.values()];
  const appendStart = liveValues.length === 0 ? 1 : liveValues.length;
  const pendingRows = missing.map((row) => {
    const result = [...row];
    setPublicationCell(result, statusIndex, pendingStatus);
    return result;
  });
  const appended = pendingRows.map((row, index) => {
    const desired = desiredCurrent.find(
      (candidate) =>
        publicationRowHash(candidate.slice(0, statusIndex)) ===
        publicationRowHash(row.slice(0, statusIndex))
    );
    if (desired === undefined) throw new TypeError('Missing desired append row');
    return { rowIndex: appendStart + index, desired, published: false };
  });
  return { headers, pendingRows, appendStart, rowsToFinalize: [...existing, ...appended] };
}
export function finalizeRequests({
  title,
  sheetId,
  statusIndex,
  rowsToFinalize,
}: {
  readonly title: string;
  readonly sheetId: number;
  readonly statusIndex: number;
  readonly rowsToFinalize: readonly GoogleAppendRow[];
}): GooglePublicationFragment {
  const output: GooglePublicationFragment = { requests: [], assertions: [] };
  for (const item of rowsToFinalize.filter((row) => !row.published)) {
    output.requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: item.rowIndex,
          endRowIndex: item.rowIndex + 1,
          startColumnIndex: statusIndex,
          endColumnIndex: statusIndex + 1,
        },
        rows: [{ values: [googleCellValue('Published', 'Publication Status')] }],
        fields: 'userEnteredValue',
      },
    });
    output.assertions.push(
      valuesAssertion({
        title,
        sheetId,
        startRowIndex: item.rowIndex,
        startColumnIndex: statusIndex,
        values: [['Published']],
        headers: ['Publication Status'],
      })
    );
  }
  return output;
}
