import type { GoogleJsonReader } from '@headstart-health/google-read-transport';

import { GoogleSheetsDataError } from './google-sheets.js';
import { googleGridA1, googleGridCaptureSchema, googleSheetTitleA1 } from './grid-reader.js';
import type { GoogleGridCapture, GoogleGridRead } from './grid-reader.js';

function assertCapture(value: unknown, spreadsheetId: string): asserts value is GoogleGridCapture {
  const parsed = googleGridCaptureSchema.safeParse(value);
  if (!parsed.success || parsed.data.spreadsheetId !== spreadsheetId)
    throw new GoogleSheetsDataError(
      'Google grid capture is invalid or belongs to another spreadsheet'
    );
}
/** Single field-selected reads; the consumer accepts exact sheet identity, extents and completeness. */
export class GoogleSheetsCaptureReader {
  readonly #http: GoogleJsonReader;
  public constructor(http: GoogleJsonReader) {
    this.#http = http;
  }
  async #request(spreadsheetId: string, query: URLSearchParams): Promise<GoogleGridCapture> {
    if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId))
      throw new GoogleSheetsDataError('Invalid spreadsheet identity');
    const value = await this.#http.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${query.toString()}`
    );
    assertCapture(value, spreadsheetId);
    return value;
  }
  public async readMetadata(spreadsheetId: string, title?: string): Promise<GoogleGridCapture> {
    const fields = 'spreadsheetId,sheets(properties,basicFilter)';
    const query =
      title === undefined
        ? new URLSearchParams({ fields })
        : new URLSearchParams({ ranges: googleSheetTitleA1(title), fields });
    return this.#request(spreadsheetId, query);
  }
  public async readGrid(input: GoogleGridRead): Promise<GoogleGridCapture> {
    const range = googleGridA1(input);
    const fields =
      input.fields === 'dimensions'
        ? 'spreadsheetId,sheets(properties,data(startRow,startColumn,rowMetadata(pixelSize),columnMetadata(pixelSize)))'
        : 'spreadsheetId,sheets(properties,data(startRow,startColumn,rowData(values(userEnteredValue,dataValidation,userEnteredFormat))))';
    return this.#request(input.spreadsheetId, new URLSearchParams({ ranges: range, fields }));
  }
}
