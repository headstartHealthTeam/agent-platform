import { describe, expect, it, vi } from 'vitest';

import { createArtifactWorkbookProvider } from './provider.js';

class ProviderFixture {
  readonly format = {
    font: { name: '', size: 0, bold: false, color: '' },
    fill: { color: '' },
    wrapText: false,
    columnWidthPx: 0,
    rowHeightPx: 0,
    verticalAlignment: '',
    horizontalAlignment: '',
    borders: {},
    autofitColumns: vi.fn(),
  };
  readonly range = { values: undefined as unknown, format: this.format, setNumberFormat: vi.fn() };
  readonly sheet = {
    getRange: vi.fn(() => this.range),
    getRangeByIndexes: vi.fn(() => this.range),
    getUsedRange: vi.fn(() => this.range),
    freezePanes: { freezeRows: vi.fn(), freezeColumns: vi.fn() },
    showGridLines: true,
  };
  readonly bytes = new Uint8Array([1, 2, 3]);
  readonly image = { arrayBuffer: vi.fn(() => this.bytes.buffer) };
  readonly book = {
    worksheets: { add: vi.fn(() => this.sheet), getItem: vi.fn(() => this.sheet) },
    inspect: vi.fn(() => ({ ndjson: '{"kind":"table"}\n' })),
    render: vi.fn(() => this.image),
  };
  readonly file = { save: vi.fn() };
  readonly blob = {};
  readonly module = {
    Workbook: { create: vi.fn(() => this.book) },
    FileBlob: { load: vi.fn(() => this.blob) },
    SpreadsheetFile: { exportXlsx: vi.fn(() => this.file), importXlsx: vi.fn(() => this.book) },
  };
}
describe('injected workbook provider', () => {
  it('retains receiver, values, ranges and formatting for a non-Intake caller', () => {
    const f = new ProviderFixture();
    const provider = createArtifactWorkbookProvider(f.module);
    const workbook = provider.create();
    const sheet = workbook.addWorksheet('Inventory');
    const range = sheet.rangeByIndexes(0, 0, 2, 3);
    const values = [
      ['Date', 'Count', 'Enabled'],
      [new Date('2026-01-01'), 4, true],
      [null, '=2+2', ' '],
    ];
    range.setValues(values);
    range.setNumberFormat('yyyy-mm-dd');
    range.setFont({ name: 'Arial', size: 10, bold: true, color: '#111111' });
    range.setFillColor('#EEEEEE');
    range.setFormat({
      wrapText: true,
      columnWidthPx: 180,
      rowHeightPx: 42,
      verticalAlignment: 'top',
      horizontalAlignment: 'left',
      borders: { preset: 'outside', style: 'thin', color: '#AAAAAA' },
    });
    range.autofitColumns();
    sheet.freezeRows(1);
    sheet.freezeColumns(2);
    sheet.showGridLines(false);
    sheet.range('A:A').setFont({ size: 11 });
    sheet.usedRange().setFormat({ wrapText: false });
    workbook.worksheet('Inventory').freezeRows(2);
    expect(f.module.Workbook.create.mock.contexts).toEqual([f.module.Workbook]);
    expect(f.book.worksheets.add).toHaveBeenCalledWith('Inventory');
    expect(f.book.worksheets.getItem).toHaveBeenCalledWith('Inventory');
    expect(f.sheet.getRangeByIndexes).toHaveBeenCalledWith(0, 0, 2, 3);
    expect(f.range.values).toBe(values);
    expect(f.range.setNumberFormat.mock.contexts).toEqual([f.range]);
    expect(f.range.setNumberFormat).toHaveBeenCalledWith('yyyy-mm-dd');
    expect(f.format).toMatchObject({
      font: { name: 'Arial', size: 11, bold: true, color: '#111111' },
      fill: { color: '#EEEEEE' },
      wrapText: false,
      columnWidthPx: 180,
      rowHeightPx: 42,
      verticalAlignment: 'top',
      horizontalAlignment: 'left',
      borders: { preset: 'outside', style: 'thin', color: '#AAAAAA' },
    });
    expect(f.format.autofitColumns.mock.contexts).toEqual([f.format]);
    expect(f.sheet.freezePanes.freezeRows.mock.calls).toEqual([[1], [2]]);
    expect(f.sheet.freezePanes.freezeColumns).toHaveBeenCalledWith(2);
    expect(f.sheet.showGridLines).toBe(false);
  });
  it('delegates raw workbook export/import and render bytes in order', async () => {
    const f = new ProviderFixture();
    const provider = createArtifactWorkbookProvider(f.module);
    const workbook = await provider.openXlsx('inventory.xlsx');
    expect(f.module.FileBlob.load).toHaveBeenCalledWith('inventory.xlsx');
    expect(f.module.SpreadsheetFile.importXlsx).toHaveBeenCalledWith(f.blob);
    expect(f.module.SpreadsheetFile.importXlsx.mock.contexts).toEqual([f.module.SpreadsheetFile]);
    const request = { kind: 'table', range: 'Inventory!A1:C4' };
    expect(await workbook.inspect(request)).toBe('{"kind":"table"}\n');
    expect(f.book.inspect).toHaveBeenCalledWith(request);
    expect(f.book.inspect.mock.contexts).toEqual([f.book]);
    const render = { sheetName: 'Inventory', range: 'A1:C4', scale: 1, format: 'png' as const };
    expect(await workbook.render(render)).toEqual(f.bytes);
    expect(f.book.render).toHaveBeenCalledWith(render);
    await workbook.saveXlsx('copy.xlsx');
    expect(f.module.SpreadsheetFile.exportXlsx).toHaveBeenCalledWith(f.book);
    expect(f.file.save).toHaveBeenCalledWith('copy.xlsx');
    expect(f.file.save.mock.contexts).toEqual([f.file]);
  });
  it('does not inspect unused exports and accepts function objects', async () => {
    const create = vi.fn(() => ({ inspect: (): { ndjson: undefined } => ({ ndjson: undefined }) }));
    const factory = Object.assign(() => undefined, { create });
    const workbook = createArtifactWorkbookProvider({ Workbook: factory }).create();
    expect(await workbook.inspect({ kind: 'sheet' })).toBeUndefined();
    expect(create.mock.contexts).toEqual([factory]);
    expect(() => createArtifactWorkbookProvider(null)).not.toThrow();
  });
  it('fails only consumed incompatible operations without substituting output', async () => {
    expect(() => createArtifactWorkbookProvider(null).create()).toThrow('requires an object');
    expect(() => createArtifactWorkbookProvider({ Workbook: {} }).create()).toThrow('unavailable');
    const workbook = createArtifactWorkbookProvider({
      Workbook: {
        create: (): unknown => ({
          worksheets: { add: (): unknown => Object.freeze({ showGridLines: true }) },
          render: (): unknown => ({ arrayBuffer: (): string => 'not bytes' }),
          inspect: (): null => null,
        }),
      },
    }).create();
    expect(() => {
      workbook.addWorksheet('Inventory').showGridLines(false);
    }).toThrow('not writable');
    await expect(
      workbook.render({ sheetName: 'Inventory', range: 'A1', scale: 1, format: 'png' })
    ).rejects.toThrow('invalid image bytes');
    await expect(workbook.inspect({ kind: 'sheet' })).rejects.toThrow('requires an object');
  });
  it('propagates vendor failures and never saves after export fails', async () => {
    const f = new ProviderFixture();
    f.module.SpreadsheetFile.exportXlsx.mockImplementation(() => {
      throw new Error('export failed');
    });
    await expect(
      createArtifactWorkbookProvider(f.module).create().saveXlsx('copy.xlsx')
    ).rejects.toThrow('export failed');
    expect(f.file.save).not.toHaveBeenCalled();
  });
});
