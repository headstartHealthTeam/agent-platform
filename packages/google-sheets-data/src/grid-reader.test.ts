import { describe, expect, it, vi } from 'vitest';

import {
  GoogleSheetsGridReader,
  googleEnteredValueSchema,
  googleGridA1,
  type GoogleGridRead,
} from './grid-reader.js';

const input: GoogleGridRead = {
  spreadsheetId: 'synthetic-sheet',
  sheet: { sheetId: 7, title: "Operator's Board" },
  range: { startRowIndex: 2, endRowIndex: 4, startColumnIndex: 25, endColumnIndex: 28 },
  fields: 'cells',
};
const data = {
  spreadsheetId: input.spreadsheetId,
  sheets: [
    {
      properties: {
        ...input.sheet,
        gridProperties: { rowCount: 100, columnCount: 28, frozenRowCount: 1 },
      },
      basicFilter: { range: { sheetId: 7, startRowIndex: 0, endRowIndex: 4 } },
      data: [
        {
          startRow: 2,
          startColumn: 25,
          rowData: [
            {
              values: [
                { userEnteredValue: { stringValue: '  preserve me  ' } },
                { userEnteredValue: { boolValue: false } },
                { userEnteredValue: { formulaValue: '=1+1' } },
              ],
            },
            {
              values: [
                {
                  userEnteredValue: { numberValue: 0 },
                  userEnteredFormat: {
                    wrapStrategy: 'WRAP',
                    verticalAlignment: 'TOP',
                    backgroundColorStyle: { rgbColor: { red: 0.5 } },
                    textFormat: { bold: true },
                  },
                  dataValidation: {
                    condition: { type: 'BOOLEAN' },
                    strict: true,
                    showCustomUi: true,
                  },
                },
                {},
                { userEnteredValue: {} },
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

describe('exact Google grid reads', () => {
  it('reads once and preserves entered values, formats and sparse data without coercion', async () => {
    const http = { request: vi.fn(async (_url: string): Promise<unknown> => data) };
    const result = await new GoogleSheetsGridReader(http).readGrid(input);
    expect(result).toEqual(data);
    expect(http.request).toHaveBeenCalledTimes(1);
    const url = new URL(http.request.mock.calls[0]?.[0] ?? 'https://invalid.test');
    expect(url.searchParams.get('ranges')).toBe("'Operator''s Board'!Z3:AB4");
    expect(url.searchParams.get('fields')).toContain(
      'userEnteredValue,dataValidation,userEnteredFormat'
    );
    expect(
      googleGridA1({
        ...input,
        range: { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
      })
    ).toBe("'Operator''s Board'!A1:A1");
  });
  it('exposes filter, grid and dimension metadata with explicit read field masks', async () => {
    const http = { request: vi.fn(async (_url: string): Promise<unknown> => data) };
    const reader = new GoogleSheetsGridReader(http);
    expect(await reader.readMetadata(input.spreadsheetId)).toEqual(data);
    expect(await reader.readGrid({ ...input, fields: 'dimensions' })).toEqual(data);
    expect(
      http.request.mock.calls.map((call) => new URL(call[0]).searchParams.get('fields'))
    ).toEqual([
      'spreadsheetId,sheets(properties,basicFilter)',
      'spreadsheetId,sheets(properties,data(startRow,startColumn,rowMetadata(pixelSize),columnMetadata(pixelSize)))',
    ]);
    expect(
      await new GoogleSheetsGridReader({
        request: async (): Promise<unknown> => ({ spreadsheetId: input.spreadsheetId }),
      }).readMetadata(input.spreadsheetId)
    ).toEqual({ spreadsheetId: input.spreadsheetId, sheets: [] });
  });
  it('rejects unbounded ranges, malformed values and wrong identities before acceptance', async () => {
    const http = { request: vi.fn(async (): Promise<unknown> => data) };
    const reader = new GoogleSheetsGridReader(http);
    await expect(reader.readMetadata('../bad')).rejects.toThrow('Invalid spreadsheet identity');
    await expect(
      reader.readGrid({ ...input, range: { ...input.range, endRowIndex: 2 } })
    ).rejects.toThrow('bounded');
    expect(http.request).not.toHaveBeenCalled();
    for (const bad of [
      null,
      { ...data, spreadsheetId: 'other' },
      { ...data, sheets: [] },
      { ...data, sheets: [...data.sheets, ...data.sheets] },
      { ...data, sheets: [{ properties: { sheetId: 7, title: 'Other' } }] },
      {
        ...data,
        sheets: [
          {
            properties: input.sheet,
            data: [{ rowData: [{ values: [{ userEnteredValue: { numberValue: 'private' } }] }] }],
          },
        ],
      },
    ]) {
      const invalid = new GoogleSheetsGridReader({ request: async (): Promise<unknown> => bad });
      await expect(invalid.readGrid(input)).rejects.toThrow(/Google grid response/);
      await expect(invalid.readGrid(input)).rejects.not.toThrow(/private/);
    }
    for (const value of [
      { stringValue: 'x', boolValue: true },
      { numberValue: Infinity },
      { formulaValue: 3 },
    ]) {
      expect(googleEnteredValueSchema.safeParse(value).success).toBe(false);
    }
  });
});
