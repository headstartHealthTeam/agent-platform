/** Internal worker protocol; never contains source credentials or application state. */
export interface OfficeTextRequest {
  bytes: Uint8Array;
  format: 'docx' | 'xlsx';
  offset: number;
}
export interface OfficeTextPage {
  text: string;
  totalCharacters: number;
  offset: number;
  nextOffset: number | null;
  warnings: string[];
}
export type OfficeTextResponse =
  { ok: true; page: OfficeTextPage } | { ok: false; reason: 'capacity' | 'offset' | 'parse' };
