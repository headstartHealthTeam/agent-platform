import type {
  GooglePublicationCell,
  GooglePublicationRows,
  GooglePublicationPayload,
  GooglePublicationRequest,
  GoogleWorkbookSheets,
} from './google-publication-types.js';
import { sha256Json } from './json-fingerprint.js';

export const GOOGLE_CELL_CHARACTER_LIMIT = 50_000;
export function workbookSheet(
  sheets: GoogleWorkbookSheets,
  title: string
): readonly unknown[] | undefined {
  // eslint-disable-next-line security/detect-object-injection -- Read-only lookup of a workbook tab by its governed title; no assignment or execution occurs.
  return sheets[title];
}
/** Narrow matrix rows only when the source operation consumes every row. */
export function publicationMatrix(rows: readonly unknown[]): GooglePublicationRows {
  if (!rows.every((row): row is readonly unknown[] => Array.isArray(row)))
    throw new TypeError('Invalid consumed workbook row');
  return rows;
}
export function publicationItem<T>(values: readonly T[] | undefined, index: number): T | undefined {
  // eslint-disable-next-line security/detect-object-injection -- Numeric read-only array lookup preserves exact property semantics; .at would reinterpret negative or fractional indices.
  return values?.[index];
}
export function setPublicationCell(row: unknown[], index: number, value: unknown): void {
  Reflect.set(row, String(index), value);
}
export function normalizePublicationRows(rows: GooglePublicationRows = []): unknown[][] {
  return rows.map((row) => row.map((value) => (value === undefined ? null : value)));
}
export function publicationRowHash(row: readonly unknown[]): string {
  return sha256Json(row.map((value) => (value === undefined ? null : value)));
}
export function publicationRowsEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return publicationRowHash(left) === publicationRowHash(right);
}
export function publicationText(value: unknown): string {
  return String(value);
}
export function googleCellValue(value: unknown, header?: unknown): GooglePublicationCell {
  if (typeof value === 'string' && value.length > GOOGLE_CELL_CHARACTER_LIMIT)
    throw new Error(
      'Google publication cell exceeds 50,000 characters; correct the workbook before preparation'
    );
  if (value === null || value === undefined || value === '') return {};
  if (
    header === 'Salesforce' &&
    typeof value === 'string' &&
    /^https:\/\/.+\/Opportunity\/[A-Za-z0-9]+\/view$/.test(value)
  )
    return {
      userEnteredValue: { formulaValue: `=HYPERLINK("${value.replaceAll('"', '""')}","Open")` },
    };
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  if (typeof value === 'number' && Number.isFinite(value))
    return { userEnteredValue: { numberValue: value } };
  return { userEnteredValue: { stringValue: publicationText(value) } };
}
export function publicationPayload(
  requests: readonly GooglePublicationRequest[]
): GooglePublicationPayload {
  return { requests, include_spreadsheet_in_response: false, response_include_grid_data: false };
}
export function publicationPayloadBytes(requests: readonly GooglePublicationRequest[]): number {
  return Buffer.byteLength(JSON.stringify(publicationPayload(requests), null, 2), 'utf8');
}
