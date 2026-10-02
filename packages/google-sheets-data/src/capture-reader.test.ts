import { describe, expect, it, vi } from 'vitest';

import { GoogleSheetsCaptureReader } from './capture-reader.js';
import type { GoogleGridRead } from './grid-reader.js';

const request: GoogleGridRead = {
  spreadsheetId: 'synthetic',
  sheet: { title: "Operator's Board", sheetId: 7 },
  range: { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 },
  fields: 'cells',
};
describe('field-selected Google captures', () => {
  it('retains exact original partial metadata without inventing titles, arrays or acceptance', async () => {
    const values = [
      { spreadsheetId: 'synthetic' },
      {
        spreadsheetId: 'synthetic',
        sheets: [
          {
            properties: { sheetId: 7 },
            basicFilter: {
              range: { sheetId: 7 },
              criteria: { 1: { hiddenValues: ['synthetic'] } },
            },
          },
        ],
      },
    ];
    for (const response of values) {
      const http = { request: vi.fn(async (_url: string): Promise<unknown> => response) };
      const reader = new GoogleSheetsCaptureReader(http);
      expect(await reader.readMetadata('synthetic')).toBe(response);
      expect(await reader.readMetadata('synthetic', request.sheet.title)).toBe(response);
      expect(http.request).toHaveBeenCalledTimes(2);
      const urls = http.request.mock.calls.map(([url]) => new URL(url));
      expect(urls.at(0)?.searchParams.has('ranges')).toBe(false);
      expect(urls.at(1)?.searchParams.get('ranges')).toBe("'Operator''s Board'");
    }
  });
  it('shares exact entered-value and dimension contracts with bounded grid reads', async () => {
    const response = {
      spreadsheetId: 'synthetic',
      sheets: [
        {
          properties: { sheetId: 7 },
          data: [
            {
              startRow: 1,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { boolValue: false } },
                    { userEnteredValue: { formulaValue: '=1+1' } },
                  ],
                },
              ],
              rowMetadata: [{ pixelSize: 40 }],
              columnMetadata: [{ pixelSize: 180 }],
            },
          ],
        },
      ],
    };
    const http = { request: vi.fn(async (_url: string): Promise<unknown> => response) };
    const reader = new GoogleSheetsCaptureReader(http);
    expect(await reader.readGrid(request)).toBe(response);
    expect(await reader.readGrid({ ...request, fields: 'dimensions' })).toBe(response);
    expect(http.request.mock.calls.map(([url]) => new URL(url).searchParams.get('ranges'))).toEqual(
      ["'Operator''s Board'!A2:B2", "'Operator''s Board'!A2:B2"]
    );
    expect(
      new URL(http.request.mock.calls.at(1)?.[0] ?? 'https://invalid.test').searchParams.get(
        'fields'
      )
    ).not.toContain('rowData');
  });
  it('rejects unbounded requests and wrong response targets without exposing them', async () => {
    const http = { request: vi.fn(async (): Promise<unknown> => ({ spreadsheetId: 'synthetic' })) };
    const reader = new GoogleSheetsCaptureReader(http);
    await expect(reader.readMetadata('../invalid')).rejects.toThrow('Invalid spreadsheet');
    await expect(reader.readMetadata('synthetic', '')).rejects.toThrow('metadata title');
    await expect(
      reader.readGrid({ ...request, range: { ...request.range, endRowIndex: 1 } })
    ).rejects.toThrow('bounded');
    expect(http.request).not.toHaveBeenCalled();
    for (const response of [null, { spreadsheetId: 'other' }]) {
      const invalid = new GoogleSheetsCaptureReader({
        request: async (): Promise<unknown> => response,
      });
      await expect(invalid.readGrid(request)).rejects.toThrow('Google grid capture is invalid');
      await expect(invalid.readGrid(request)).rejects.not.toThrow('private invalid value');
    }
  });
  it('preserves raw unconsumed fields for assertion-specific acceptance', async () => {
    const raw = {
      spreadsheetId: 'synthetic',
      sheets: [
        {
          properties: { sheetId: 7, gridProperties: { rowCount: 'ignored' } },
          data: [
            {
              rowData: [
                {
                  values: [
                    { userEnteredValue: null, userEnteredFormat: null, dataValidation: null },
                  ],
                },
              ],
              rowMetadata: [{ pixelSize: 0 }],
            },
          ],
        },
      ],
      unknownMetadata: undefined,
    };
    const reader = new GoogleSheetsCaptureReader({
      request: (): Promise<unknown> => Promise.resolve(raw),
    });
    expect(await reader.readMetadata('synthetic')).toBe(raw);
    expect(await reader.readGrid(request)).toBe(raw);
  });
});
