import { describe, expect, it } from 'vitest';

import {
  GoogleSheetsDataError,
  googleSheetsRangeRequirement,
  preflightGoogleSheets,
  requireColumns,
  rowsFromHeaderRange,
  type GoogleSheetsReadProvider,
} from './google-sheets.js';

const range = {
  spreadsheetId: 'sheet-123',
  range: 'Pillars!A1:D3',
  revision: 'modified-2026-09-09',
  values: [
    ['Keyword', 'Pillar', 'Search Volume', 'Serviceability'],
    ['aba basics', 'ABA foundation', 222790, 'confirmed'],
    ['find aba care', 'Local care', 44450, 'conditional'],
  ],
};

class FixtureProvider implements GoogleSheetsReadProvider {
  public async getSpreadsheet(spreadsheetId: string): Promise<unknown> {
    return { spreadsheetId };
  }

  public async readRange(): Promise<unknown> {
    return range;
  }
}

describe('Google Sheets data adapter', () => {
  it('maps a header range into typed string records', () => {
    const rows = rowsFromHeaderRange(range);
    requireColumns(rows, ['Keyword', 'Pillar', 'Search Volume', 'Serviceability']);
    expect(rows[0]).toEqual({
      Keyword: 'aba basics',
      Pillar: 'ABA foundation',
      'Search Volume': '222790',
      Serviceability: 'confirmed',
    });
  });

  it('rejects duplicate headers and blank required cells', () => {
    expect(() => rowsFromHeaderRange({ ...range, values: [['Keyword', 'Keyword']] })).toThrow(
      GoogleSheetsDataError
    );
    expect(() => {
      requireColumns([{ Keyword: '' }], ['Keyword']);
    }).toThrow(GoogleSheetsDataError);
    expect(() => rowsFromHeaderRange({ ...range, values: [] })).toThrow(/header row/);
    expect(() => rowsFromHeaderRange({ ...range, values: [['']] })).toThrow(/non-empty/);
  });

  it('validates required headers independently of whether any data rows exist', () => {
    const headers = ['Keyword', 'Pillar'];
    expect(rowsFromHeaderRange({ ...range, values: [headers] }, headers)).toEqual([]);
    expect(() => rowsFromHeaderRange({ ...range, values: [['Keyword']] }, headers)).toThrow(
      /header is missing required column Pillar/
    );
    expect(() =>
      rowsFromHeaderRange({ ...range, values: [['Keyword'], ['aba basics']] }, headers)
    ).toThrow(/header is missing required column Pillar/);
    expect(() => {
      requireColumns([], headers, headers);
    }).not.toThrow();
    expect(() => {
      requireColumns([], headers, ['Keyword']);
    }).toThrow(/missing required column Pillar/);
    expect(() => {
      requireColumns([], headers);
    }).toThrow(/require header evidence/);
    expect(() => {
      requireColumns([], []);
    }).not.toThrow();
  });

  it('declares and preflights the exact sheet range', async () => {
    const requirement = googleSheetsRangeRequirement({
      spreadsheetId: 'sheet-123',
      range: 'Pillars!A1:D3',
    });
    expect(requirement.targetAssertions).toHaveLength(2);
    const result = await preflightGoogleSheets(new FixtureProvider(), {
      spreadsheetId: 'sheet-123',
      range: 'Pillars!A1:D3',
      providerId: 'google-drive-connector',
      adapterVersion: 'fixture-v1',
    });
    expect(result.status).toBe('ready');
  });

  it('fails preflight closed for a mismatched or unavailable provider', async () => {
    const mismatch: GoogleSheetsReadProvider = {
      getSpreadsheet: async () => ({ spreadsheetId: 'sheet-123' }),
      readRange: async () => ({ ...range, range: 'Other!A1:D3' }),
    };
    await expect(
      preflightGoogleSheets(mismatch, {
        spreadsheetId: 'sheet-123',
        range: 'Pillars!A1:D3',
        providerId: 'google-drive-connector',
        adapterVersion: 'fixture-v1',
      })
    ).resolves.toMatchObject({ status: 'wrong-target' });

    const unavailable: GoogleSheetsReadProvider = {
      getSpreadsheet: async () => {
        throw new Error('connector unavailable');
      },
      readRange: async () => range,
    };
    await expect(
      preflightGoogleSheets(unavailable, {
        spreadsheetId: 'sheet-123',
        range: 'Pillars!A1:D3',
        providerId: 'google-drive-connector',
        adapterVersion: 'fixture-v1',
      })
    ).resolves.toMatchObject({
      status: 'provider-unavailable',
      message:
        'Google Sheets provider readiness could not be verified; inspect provider access and response validity',
    });
  });

  it('does not persist raw range-read errors or malformed metadata', async () => {
    const providers: GoogleSheetsReadProvider[] = [
      {
        getSpreadsheet: async () => ({ spreadsheetId: 'sheet-123' }),
        readRange: async (): Promise<never> => {
          throw new Error('private provider diagnostic');
        },
      },
      {
        getSpreadsheet: async () => ({ spreadsheetId: null, privateDetail: 'private diagnostic' }),
        readRange: async () => range,
      },
    ];
    for (const provider of providers) {
      const result = await preflightGoogleSheets(provider, {
        spreadsheetId: 'sheet-123',
        range: 'Pillars!A1:D3',
        providerId: 'google-drive-connector',
        adapterVersion: 'v1',
      });
      expect(result.status).toBe('provider-unavailable');
      expect(result.permissions).toEqual([]);
      expect(result.message).toBe(
        'Google Sheets provider readiness could not be verified; inspect provider access and response validity'
      );
    }
  });
});
