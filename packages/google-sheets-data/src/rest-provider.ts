import { createHash } from 'node:crypto';

import type { GoogleJsonReader } from '@headstart-health/google-read-transport';
import { z } from 'zod';

import {
  sheetRangeSchema,
  GoogleSheetsDataError,
  type GoogleSheetsReadProvider,
  type SheetRange,
} from './google-sheets.js';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
const responseSchema = z.object({
  range: z.string(),
  majorDimension: z.literal('ROWS').optional(),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).default([]),
});
export class GoogleSheetsRestProvider implements GoogleSheetsReadProvider {
  readonly #http: GoogleJsonReader;
  public constructor(http: GoogleJsonReader) {
    this.#http = http;
  }
  public async getSpreadsheet(spreadsheetId: string): Promise<unknown> {
    return this.#http.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${idSchema.parse(spreadsheetId)}?fields=spreadsheetId,properties,sheets.properties`
    );
  }
  public async readRange(spreadsheetId: string, range: string): Promise<SheetRange> {
    idSchema.parse(spreadsheetId);
    if (!/^'([^']|'')+'![A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/.test(range))
      throw new GoogleSheetsDataError('A bounded, quoted sheet range is required');
    const query = new URLSearchParams({
      valueRenderOption: 'UNFORMATTED_VALUE',
      majorDimension: 'ROWS',
    });
    const read = async (): Promise<z.infer<typeof responseSchema>> =>
      responseSchema.parse(
        await this.#http.request(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${query.toString()}`
        )
      );
    const first = await read();
    const second = await read();
    if (first.range !== range || second.range !== range)
      throw new GoogleSheetsDataError('Google returned a different sheet range');
    const canonical = JSON.stringify({ spreadsheetId, range, values: first.values });
    if (canonical !== JSON.stringify({ spreadsheetId, range, values: second.values }))
      throw new GoogleSheetsDataError('Spreadsheet range changed during extraction');
    return sheetRangeSchema.parse({
      spreadsheetId,
      range,
      values: first.values,
      revision: `content-sha256:${createHash('sha256').update(canonical).digest('hex')}`,
    });
  }
}
