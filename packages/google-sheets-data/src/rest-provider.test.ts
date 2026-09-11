import { describe, expect, it, vi } from 'vitest';

import { GoogleSheetsRestProvider } from './rest-provider.js';
const range = "'Search TAM'!A15:C20";
const payload = {
  range,
  majorDimension: 'ROWS',
  values: [
    ['Keyword', 'Pillar', 'Volume'],
    ['example', 'Core', 100],
  ],
};
describe('Sheets REST snapshots', () => {
  it('verifies two matching reads and fingerprints range content', async () => {
    const http = { request: vi.fn(async () => payload) };
    const provider = new GoogleSheetsRestProvider(http);
    await provider.getSpreadsheet('sheet-123');
    const a = await provider.readRange('sheet-123', range);
    const b = await provider.readRange('sheet-123', range);
    expect(a).toEqual(b);
    expect(a.revision).toMatch(/^content-sha256:[a-f0-9]{64}$/);
    expect(http.request).toHaveBeenCalledWith(
      expect.stringContaining(
        new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' }).toString()
      )
    );
    await expect(provider.readRange('sheet-123', 'A:A')).rejects.toThrow(/bounded/);
    await expect(provider.getSpreadsheet('../bad')).rejects.toThrow();
  });
  it('refuses a changed range or data during extraction', async () => {
    await expect(
      new GoogleSheetsRestProvider({
        request: async (): Promise<unknown> => ({ ...payload, range: "'Other'!A1:C6" }),
      }).readRange('sheet', range)
    ).rejects.toThrow(/different/);
    const responses = [payload, { ...payload, values: [['Changed']] }];
    await expect(
      new GoogleSheetsRestProvider({
        request: async (): Promise<unknown> => responses.shift(),
      }).readRange('sheet', range)
    ).rejects.toThrow(/changed/);
  });
});
