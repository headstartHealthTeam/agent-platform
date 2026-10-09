import { captureProperty } from './google-capture-property.js';
import type {
  GooglePublicationFragment,
  GooglePublicationRows,
  GooglePublicationRequest,
} from './google-publication-types.js';
import {
  googleCellValue,
  normalizePublicationRows,
  publicationItem,
  publicationPayloadBytes,
} from './google-publication-values.js';
import { sha256Json } from './json-fingerprint.js';
import type { PublicationAssertion } from './publication-readback-types.js';

export interface ValuesAssertionInput {
  readonly title: string;
  readonly sheetId: number;
  readonly startRowIndex: number;
  readonly startColumnIndex?: number;
  readonly values: GooglePublicationRows;
  readonly preparedValues?: GooglePublicationRows;
  readonly headers?: readonly unknown[];
}
export function valuesAssertion({
  title,
  sheetId,
  startRowIndex,
  startColumnIndex = 0,
  values,
  preparedValues = values,
  headers = [],
}: ValuesAssertionInput): PublicationAssertion & { valueMode: 'userEnteredValue' } {
  const normalized = normalizePublicationRows(values);
  const prepared = normalizePublicationRows(preparedValues);
  const columnCount = Math.max(headers.length, 0, ...normalized.map((row) => row.length));
  const entered = normalized.map((row) =>
    Array.from(
      { length: columnCount },
      (_, index) =>
        googleCellValue(publicationItem(row, index), publicationItem(headers, index))
          .userEnteredValue ?? null
    )
  );
  const blankBooleanCellsAsFalse: [number, number][] = [];
  for (const [rowIndex, row] of entered.entries())
    for (const [columnIndex, value] of row.entries()) {
      const preparedValue = publicationItem(publicationItem(prepared, rowIndex), columnIndex);
      if (
        (preparedValue === '' || preparedValue === null || preparedValue === undefined) &&
        captureProperty(value, 'boolValue') === false
      )
        blankBooleanCellsAsFalse.push([rowIndex, columnIndex]);
    }
  return {
    id: `${title}:values:${String(startRowIndex)}:${String(startColumnIndex)}:${String(normalized.length)}`,
    kind: 'values',
    title,
    sheetId,
    startRowIndex,
    endRowIndex: startRowIndex + normalized.length,
    startColumnIndex,
    endColumnIndex: startColumnIndex + columnCount,
    rowCount: normalized.length,
    columnCount,
    valueMode: 'userEnteredValue',
    expectedHash: sha256Json(entered),
    ...(blankBooleanCellsAsFalse.length > 0 ? { blankBooleanCellsAsFalse } : {}),
  };
}
export function gridAssertion({
  title,
  sheetId,
  rowCount,
  columnCount,
}: {
  readonly title: string;
  readonly sheetId: number;
  readonly rowCount: number;
  readonly columnCount: number;
}): PublicationAssertion {
  return {
    id: `${title}:grid-properties`,
    kind: 'grid-properties',
    title,
    sheetId,
    expectedHash: sha256Json({ rowCount, columnCount }),
  };
}
interface UpdateInput {
  readonly title: string;
  readonly sheetId: number;
  readonly rows: GooglePublicationRows;
  readonly headers?: readonly unknown[] | undefined;
  readonly assertionRows?: GooglePublicationRows;
  readonly startRowIndex?: number;
  readonly maxBytes: number;
}
interface Chunk {
  readonly startRowIndex: number;
  readonly rows: GooglePublicationRows;
  readonly assertionRows: GooglePublicationRows;
}
function updateRequest(
  sheetId: number,
  headers: readonly unknown[],
  startRowIndex: number,
  rows: GooglePublicationRows
): GooglePublicationRequest {
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex,
        endRowIndex: startRowIndex + rows.length,
        startColumnIndex: 0,
        endColumnIndex: headers.length,
      },
      rows: rows.map((row) => ({
        values: headers.map((header, index) =>
          googleCellValue(publicationItem(row, index), header)
        ),
      })),
      fields: 'userEnteredValue',
    },
  };
}
function chunksFor({
  title,
  sheetId,
  rows,
  headers = rows[0],
  assertionRows = rows,
  startRowIndex = 0,
  maxBytes,
}: UpdateInput): Chunk[] {
  if (headers === undefined) throw new TypeError('Missing publication headers');
  const size = (start: number, values: GooglePublicationRows): number =>
    publicationPayloadBytes([updateRequest(sheetId, headers, start, values)]);
  const chunks: Chunk[] = [];
  let chunk: (readonly unknown[])[] = [],
    assertionChunk: (readonly unknown[])[] = [];
  let chunkStart = startRowIndex;
  for (const [rowIndex, row] of rows.entries()) {
    const candidate = [...chunk, row];
    const assertionRow = publicationItem(assertionRows, rowIndex);
    if (assertionRow === undefined) throw new TypeError('Missing publication assertion row');
    if (chunk.length > 0 && size(chunkStart, candidate) > maxBytes) {
      chunks.push({ startRowIndex: chunkStart, rows: chunk, assertionRows: assertionChunk });
      chunkStart += chunk.length;
      chunk = [row];
      assertionChunk = [assertionRow];
    } else {
      chunk = candidate;
      assertionChunk.push(assertionRow);
    }
    if (size(chunkStart, chunk) > maxBytes)
      throw new Error(`A ${title} row exceeds the bounded publication call size`);
  }
  if (chunk.length > 0)
    chunks.push({ startRowIndex: chunkStart, rows: chunk, assertionRows: assertionChunk });
  return chunks;
}
export function updateRequests(input: UpdateInput): GooglePublicationFragment {
  if (input.rows.length === 0) return { requests: [], assertions: [] };
  const headers = input.headers ?? input.rows[0];
  if (headers === undefined) throw new TypeError('Missing publication headers');
  const chunks = chunksFor(input);
  return {
    requests: chunks.map((item) =>
      updateRequest(input.sheetId, headers, item.startRowIndex, item.rows)
    ),
    assertions: chunks.map((item) =>
      valuesAssertion({
        title: input.title,
        sheetId: input.sheetId,
        startRowIndex: item.startRowIndex,
        values: item.assertionRows,
        preparedValues: item.rows,
        headers,
      })
    ),
  };
}
export function clearTail({
  title,
  sheetId,
  startRowIndex,
  endRowIndex,
  columnCount,
}: {
  readonly title: string;
  readonly sheetId: number;
  readonly startRowIndex: number;
  readonly endRowIndex: number;
  readonly columnCount: number;
}): GooglePublicationFragment {
  if (startRowIndex >= endRowIndex) return { requests: [], assertions: [] };
  const values = Array.from({ length: endRowIndex - startRowIndex }, () =>
    Array<null>(columnCount).fill(null)
  );
  return {
    requests: [
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex,
            endRowIndex,
            startColumnIndex: 0,
            endColumnIndex: columnCount,
          },
          cell: {},
          fields: 'userEnteredValue',
        },
      },
    ],
    assertions: [
      valuesAssertion({
        title,
        sheetId,
        startRowIndex,
        values,
        headers: Array<string>(columnCount).fill(''),
      }),
    ],
  };
}
