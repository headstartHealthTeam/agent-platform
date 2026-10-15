import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  ArtifactWorkbook,
  ArtifactWorkbookProvider,
  WorkbookRange,
  WorkbookWorksheet,
} from '@headstart-health/artifact-workbook';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exportIntakeWorkbook, INTAKE_WORKBOOK_FILENAME } from './workbook-export.js';
import {
  INTAKE_WORKBOOK_SHEETS,
  populateIntakeWorkbook,
  type IntakeWorkbookTables,
} from './workbook-layout.js';
import { smokeIntakeWorkbookRuntime, syntheticIntakeWorkbookTables } from './workbook-smoke.js';
import { verifyIntakeWorkbook } from './workbook-verification.js';

const HEADERS = [
  'Opportunity Name',
  'Salesforce',
  'Practice',
  'Relevant Provider',
  'CSM / Owner',
  'Stage',
  'Days Breached',
  'Blocking Gate',
  'Freshness',
  'Last Substantive Update Date',
  'Suggested SLA Summary',
  'In-Depth Summary',
  'Suggested Action',
  'Reviewer Notes',
];
function tables(): IntakeWorkbookTables {
  const rows = [
    HEADERS,
    ...['Missing', 'Stale', 'Semi-Stale', 'Current', 'Unknown'].map((freshness) =>
      HEADERS.map((_, index) =>
        index === 8 ? freshness : index === 6 ? 2 : `Synthetic ${String(index)}`
      )
    ),
  ];
  return {
    'Review Queue': rows,
    'On-Hold Review': [HEADERS],
    'Evidence Detail': [
      ['Evidence', 'Source'],
      ['Supported progress', 'synthetic'],
    ],
    'Source & Run Notes': [
      ['Field', 'Value'],
      ['Cutoff', '2026-01-01'],
    ],
    'Data Dictionary': [['Field', 'Meaning']],
    'Run History': [
      ['Run ID', 'Publish Status'],
      ['synthetic', 'Pending'],
    ],
    'Generation Ledger': [
      ['Run ID', 'Value'],
      ['synthetic', 3],
    ],
  };
}
class WorkbookFixture implements ArtifactWorkbook, ArtifactWorkbookProvider {
  readonly calls: unknown[][] = [];
  readonly create = vi.fn(() => this);
  readonly openXlsx = vi.fn(async (_file: string) => this);
  readonly inspect = vi.fn(async (_request: unknown): Promise<unknown> => '');
  readonly saveXlsx = vi.fn(async (_file: string): Promise<void> => undefined);
  readonly render = vi.fn(async (_request: unknown) => new Uint8Array([1, 2, 3]));
  private range(name: string, location: unknown): WorkbookRange {
    const log = (operation: string, value?: unknown): void => {
      this.calls.push([name, location, operation, value]);
    };
    return {
      setValues: (value): void => {
        log('values', value);
      },
      setNumberFormat: (value): void => {
        log('numberFormat', value);
      },
      setFont: (value): void => {
        log('font', value);
      },
      setFillColor: (value): void => {
        log('fill', value);
      },
      setFormat: (value): void => {
        log('format', value);
      },
      autofitColumns: (): void => {
        log('autofit');
      },
    };
  }
  addWorksheet(name: string): WorkbookWorksheet {
    this.calls.push(['add', name]);
    return this.worksheet(name);
  }
  worksheet(name: string): WorkbookWorksheet {
    return {
      range: (address) => this.range(name, address),
      rangeByIndexes: (...indexes) => this.range(name, indexes),
      usedRange: () => this.range(name, 'used'),
      freezeRows: (count): void => {
        this.calls.push([name, 'freezeRows', count]);
      },
      freezeColumns: (count): void => {
        this.calls.push([name, 'freezeColumns', count]);
      },
      showGridLines: (visible): void => {
        this.calls.push([name, 'gridLines', visible]);
      },
    };
  }
}
let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-workbook-'));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
describe('approved Intake workbook layout and verification', () => {
  it('supports separate synthetic host acceptance only in a fresh output directory', async () => {
    const fixture = new WorkbookFixture();
    const output = path.join(directory, 'synthetic');
    const result = await smokeIntakeWorkbookRuntime(fixture, output);
    expect(result.passed).toBe(true);
    const input = JSON.parse(
      await fs.readFile(path.join(output, 'synthetic-workbook-values.json'), 'utf8')
    ) as unknown;
    expect(input).toEqual({ sheets: syntheticIntakeWorkbookTables() });
    expect(syntheticIntakeWorkbookTables()['Review Queue'][0]).toHaveLength(37);
    expect(syntheticIntakeWorkbookTables()['On-Hold Review'][0]).toHaveLength(41);
    await expect(smokeIntakeWorkbookRuntime(fixture, output)).rejects.toThrow();
    expect(fixture.create).toHaveBeenCalledTimes(1);
  }, 30_000);
  it('retains all seven sheets, original values, widths, dates and operator formatting', async () => {
    const fixture = new WorkbookFixture();
    const input = tables();
    const result = await exportIntakeWorkbook(fixture, input, directory);
    expect(fixture.calls.slice(0, 7)).toEqual(INTAKE_WORKBOOK_SHEETS.map((name) => ['add', name]));
    for (const name of INTAKE_WORKBOOK_SHEETS) {
      expect(fixture.calls).toContainEqual([name, 'freezeRows', 1]);
      expect(fixture.calls).toContainEqual([name, 'gridLines', false]);
      expect(fixture.calls).toContainEqual([name, 'used', 'font', { name: 'Arial', size: 10 }]);
      expect(fixture.calls.find((call) => call[0] === name && call[2] === 'values')?.[3]).toBe(
        new Map(Object.entries(input)).get(name)
      );
    }
    expect(fixture.calls).toContainEqual([
      'Review Queue',
      [1, 0, 5, 14],
      'format',
      { rowHeightPx: 240 },
    ]);
    expect(fixture.calls).toContainEqual([
      'On-Hold Review',
      [0, 0, 1, 14],
      'format',
      { rowHeightPx: 72 },
    ]);
    expect(fixture.calls).toContainEqual([
      'Review Queue',
      [0, 11, 1, 1],
      'format',
      { columnWidthPx: 650 },
    ]);
    expect(fixture.calls).toContainEqual([
      'Review Queue',
      [0, 11, 6, 1],
      'format',
      { horizontalAlignment: 'left' },
    ]);
    expect(fixture.calls).toContainEqual(['On-Hold Review', 'AB:AB', 'numberFormat', 'yyyy-mm-dd']);
    expect(
      fixture.calls.filter(
        (call) => call[2] === 'fill' && Array.isArray(call[1]) && call[1][0] !== 0
      )
    ).toEqual([
      ['Review Queue', [1, 8, 1, 1], 'fill', '#FECACA'],
      ['Review Queue', [2, 8, 1, 1], 'fill', '#FED7AA'],
      ['Review Queue', [3, 8, 1, 1], 'fill', '#FEF3C7'],
      ['Review Queue', [4, 8, 1, 1], 'fill', '#DCFCE7'],
    ]);
    expect(fixture.inspect).toHaveBeenCalledWith({
      kind: 'sheet,table',
      tableMaxRows: 5,
      tableMaxCols: 8,
      maxChars: 4000,
    });
    expect(result).toEqual({
      workbookPath: path.join(directory, INTAKE_WORKBOOK_FILENAME),
      inspection: '',
    });
    expect(fixture.saveXlsx).toHaveBeenCalledWith(result.workbookPath);
  }, 30_000);
  it('keeps header-only reports and absent optional prose columns valid', () => {
    const fixture = new WorkbookFixture();
    populateIntakeWorkbook(fixture, { ...tables(), 'Review Queue': [['Only header']] });
    expect(fixture.calls).not.toContainEqual([
      'Review Queue',
      [1, 0, 0, 1],
      'format',
      { rowHeightPx: 240 },
    ]);
    expect(() => {
      populateIntakeWorkbook(fixture, { ...tables(), 'Generation Ledger': [] });
    }).toThrow('Missing workbook headers');
  });
  it('writes all sixteen original previews and the exact verification receipt without altering scan policy', async () => {
    const fixture = new WorkbookFixture();
    fixture.inspect
      .mockResolvedValueOnce('{"kind":"summary"}\ninvalid-json\n')
      .mockResolvedValueOnce('{"kind":"sheet","name":"Review Queue"}\n');
    const result = await verifyIntakeWorkbook(fixture, directory, () => new Date('2026-01-02'));
    expect(result).toMatchObject({
      passed: true,
      verifiedAt: '2026-01-02T00:00:00.000Z',
      formulaErrorCount: 0,
      formulaErrorScan: [{ kind: 'summary' }, { raw: 'invalid-json' }],
      overview: [{ kind: 'sheet', name: 'Review Queue' }],
    });
    expect(result.sheetsRendered).toHaveLength(16);
    expect(fixture.openXlsx).toHaveBeenCalledWith(path.join(directory, INTAKE_WORKBOOK_FILENAME));
    expect(fixture.render.mock.calls.at(-1)).toEqual([
      { sheetName: 'Generation Ledger', range: 'A1:L12', scale: 0.75, format: 'png' },
    ]);
    expect(fixture.inspect.mock.calls[0]).toEqual([
      {
        kind: 'match',
        searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
        options: { useRegex: true, maxResults: 300 },
        summary: 'shadow workbook formula error scan',
        maxChars: 8000,
      },
    ]);
    for (const image of result.sheetsRendered)
      expect(await fs.readFile(image.file)).toEqual(Buffer.from([1, 2, 3]));
    expect(await fs.readFile(path.join(directory, 'workbook-verification.json'), 'utf8')).toBe(
      JSON.stringify(result, null, 2)
    );
  }, 30_000);
  it('retains formula matches, honest failure and partial-render failure behavior', async () => {
    const fixture = new WorkbookFixture();
    fixture.inspect.mockResolvedValueOnce(
      ['#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#N/A']
        .map((value) => JSON.stringify({ kind: 'match', value }))
        .join('\n')
    );
    const result = await verifyIntakeWorkbook(fixture, directory);
    expect(result.passed).toBe(false);
    expect(result.formulaErrorCount).toBe(5);
    await fs.unlink(path.join(directory, 'workbook-verification.json'));
    fixture.render.mockRejectedValueOnce(new Error('render failed'));
    await expect(verifyIntakeWorkbook(fixture, directory)).rejects.toThrow('render failed');
    await expect(fs.stat(path.join(directory, 'workbook-verification.json'))).rejects.toThrow();
  }, 30_000);
  it('preserves primitive/empty scan handling and rejects null records like the source', async () => {
    const fixture = new WorkbookFixture();
    fixture.inspect
      .mockResolvedValueOnce('2\nfalse\n"#REF!"\n{"kind":"other","value":"#N/A"}')
      .mockResolvedValueOnce(undefined);
    expect((await verifyIntakeWorkbook(fixture, directory)).passed).toBe(true);
    fixture.inspect.mockResolvedValueOnce('null');
    await expect(verifyIntakeWorkbook(fixture, directory)).rejects.toThrow('inspection record');
  }, 30_000);
});
