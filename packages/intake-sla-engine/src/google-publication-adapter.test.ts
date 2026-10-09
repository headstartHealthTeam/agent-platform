import type { GoogleReadResponse } from '@headstart-health/google-read-transport';
import { describe, expect, it, vi } from 'vitest';

import {
  assertionA1,
  createGoogleReadOnlyAdapter,
  createGoogleRestAdapter,
} from './google-publication-adapter.js';
import type { GooglePublicationAdapterOptions } from './google-publication-adapter.js';
import { sha256Json } from './json-fingerprint.js';

const manifest = { spreadsheetId: 'synthetic-sheet', runId: 'synthetic-run', stages: [] };
const grid = { id: 'grid', title: "Operator's Queue", sheetId: 1, kind: 'grid-properties' };
const values = {
  ...grid,
  kind: 'values',
  startRowIndex: 0,
  endRowIndex: 1,
  startColumnIndex: 0,
  endColumnIndex: 1,
};
function response(): GoogleReadResponse {
  return {
    ok: true,
    json: (): Promise<unknown> =>
      Promise.resolve({
        spreadsheetId: manifest.spreadsheetId,
        sheets: [
          {
            properties: { sheetId: 1, gridProperties: { rowCount: 100 } },
            basicFilter: {
              range: { sheetId: 1 },
              criteria: { 1: { hiddenValues: ['synthetic'] } },
            },
            data: [
              {
                rowData: [
                  { values: [{ userEnteredValue: { stringValue: 'first' } }] },
                  { values: [{ userEnteredValue: { boolValue: false } }] },
                ],
                rowMetadata: [{ pixelSize: 240 }],
              },
            ],
          },
        ],
      }),
  };
}
function setup(
  overrides: Partial<GooglePublicationAdapterOptions> = {}
): GooglePublicationAdapterOptions {
  let time = 0;
  return {
    manifest,
    tokenProvider: (): Promise<string> => Promise.resolve('synthetic'),
    checkConcurrency: (): Promise<undefined> => Promise.resolve(undefined),
    now: () => time,
    sleep: (ms): Promise<void> => {
      time += ms;
      return Promise.resolve();
    },
    random: () => 0,
    fetchImpl: (): Promise<GoogleReadResponse> => Promise.resolve(response()),
    ...overrides,
  };
}
describe('Google publication provider composition', () => {
  it('rejects absent consumed sheet/block containers without treating them as blank evidence', async () => {
    for (const absent of [null, undefined]) {
      for (const sheets of [
        [{ properties: { sheetId: 1 }, data: [absent] }],
        [{ properties: { sheetId: 1 }, data: [] }, absent],
      ]) {
        const adapter = createGoogleRestAdapter(
          setup({
            fetchImpl: (): Promise<GoogleReadResponse> =>
              Promise.resolve({
                ok: true,
                json: (): Promise<unknown> =>
                  Promise.resolve({ spreadsheetId: manifest.spreadsheetId, sheets }),
              }),
          })
        );
        const onIncompleteCapture = vi.fn((): Promise<void> => Promise.resolve());
        await expect(
          adapter.readAssertions({ ...manifest, assertions: [values], onIncompleteCapture })
        ).rejects.toBeInstanceOf(TypeError);
        expect(onIncompleteCapture).toHaveBeenCalledWith({
          runId: manifest.runId,
          spreadsheetId: manifest.spreadsheetId,
          complete: false,
          expectedAssertions: 1,
          assertions: [],
        });
      }
    }
  });
  it('narrows only the selected assertion, preserving null blanks and ignored metadata', async () => {
    const raw = {
      spreadsheetId: manifest.spreadsheetId,
      sheets: [
        {
          properties: { sheetId: 1, gridProperties: { rowCount: 'unused' } },
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
        { properties: { sheetId: 2, gridProperties: { columnCount: 'unused' } }, data: 'unused' },
      ],
    };
    const adapter = createGoogleRestAdapter(
      setup({
        fetchImpl: (): Promise<GoogleReadResponse> =>
          Promise.resolve({ ok: true, json: (): Promise<unknown> => Promise.resolve(raw) }),
      })
    );
    expect(await adapter.readMetadata()).toBe(raw);
    expect(
      (await adapter.readAssertions({ ...manifest, assertions: [values] })).assertions.at(0)?.values
    ).toEqual([[null]]);
    await expect(
      adapter.readAssertions({
        ...manifest,
        assertions: [{ ...values, kind: 'dimension-pixels', dimension: 'ROWS' }],
      })
    ).rejects.toThrow('invalid Google dimension');
  });
  it('preserves exact quoted ranges and rejects invalid coordinates before I/O', async () => {
    expect(
      assertionA1({
        ...values,
        startRowIndex: 1,
        endRowIndex: 3,
        startColumnIndex: 26,
        endColumnIndex: 28,
      })
    ).toBe("'Operator''s Queue'!AA2:AB3");
    const fetchImpl = vi.fn(setup().fetchImpl);
    const adapter = createGoogleRestAdapter(setup({ fetchImpl }));
    for (const invalid of [
      { ...values, title: '' },
      { ...values, startRowIndex: -1 },
      { ...values, startColumnIndex: 0.5 },
      { ...values, endRowIndex: 0 },
      { ...values, rowCount: 2 },
      { ...values, columnCount: 2 },
    ])
      await expect(
        adapter.readAssertions({ ...manifest, assertions: [invalid] })
      ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('writes exact prepared controls once and rejects altered payloads, targets and property indices', async () => {
    const payload = {
      requests: [{ synthetic: true }],
      include_spreadsheet_in_response: true,
      response_include_grid_data: false,
    };
    const prepared = {
      ...manifest,
      stages: [{ id: 'stage', calls: [{ payloadHash: sha256Json(payload) }] }],
    };
    const fetchImpl = vi.fn(setup().fetchImpl);
    const adapter = createGoogleRestAdapter(setup({ manifest: prepared, fetchImpl }));
    const call = { spreadsheetId: manifest.spreadsheetId, stageId: 'stage', callIndex: 0, payload };
    expect(await adapter.apply(call)).toEqual({ ok: true, spreadsheetId: manifest.spreadsheetId });
    expect(fetchImpl.mock.calls.at(0)?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      body: JSON.stringify({
        requests: payload.requests,
        includeSpreadsheetInResponse: true,
        responseIncludeGridData: false,
      }),
    });
    for (const callIndex of [-1, 0.1, Number.NaN, 1])
      await expect(adapter.apply({ ...call, callIndex })).rejects.toThrow('exact prepared');
    await expect(adapter.apply({ ...call, spreadsheetId: 'other' })).rejects.toThrow('target');
    await expect(adapter.apply({ ...call, payload: { requests: [] } })).rejects.toThrow(
      'exact prepared'
    );
    const extra = { requests: payload.requests, unapproved: true };
    prepared.stages[0]?.calls.push({ payloadHash: sha256Json(extra) });
    await expect(adapter.apply({ ...call, callIndex: 1, payload: extra })).rejects.toThrow(
      'Unknown prepared'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('preserves construction bindings while retaining the original manifest object for run and stage updates', async () => {
    const original = { ...manifest, stages: [] };
    const fetchImpl = vi.fn(setup().fetchImpl);
    const options = { ...setup({ manifest: original, fetchImpl }), maxCoalescedCells: 1 };
    const adapter = createGoogleRestAdapter(options);
    Object.assign(
      options,
      setup({
        manifest: { ...manifest, spreadsheetId: 'wrong' },
        fetchImpl: () => Promise.reject(new Error('replaced')),
      }),
      { maxCoalescedCells: 0 }
    );
    original.spreadsheetId = 'changed';
    original.runId = 'new-run';
    await adapter.readMetadata();
    const input = {
      ...manifest,
      runId: 'new-run',
      assertions: [values, { ...values, id: 'second', startRowIndex: 1, endRowIndex: 2 }],
    };
    expect((await adapter.readAssertions(input)).assertions).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(
      fetchImpl.mock.calls.every(([url]) => new URL(url).pathname.endsWith(manifest.spreadsheetId))
    ).toBe(true);
    await expect(adapter.readAssertions({ ...input, runId: manifest.runId })).rejects.toThrow(
      'target'
    );
  });
  it('coalesces adjacent values but captures each exact range and takes independent fresh samples', async () => {
    const fetchImpl = vi.fn(setup().fetchImpl);
    const adapter = createGoogleRestAdapter(setup({ fetchImpl }));
    const input = {
      ...manifest,
      assertions: [values, { ...values, id: 'second', startRowIndex: 1, endRowIndex: 2 }],
    };
    for (let index = 0; index < 2; index++) {
      const actual = await adapter.readAssertions(input);
      expect(actual.assertions.map((item) => item.values)).toEqual([
        [[{ stringValue: 'first' }]],
        [[{ boolValue: false }]],
      ]);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      new URL(fetchImpl.mock.calls.at(0)?.[0] ?? 'https://invalid.test').searchParams.get('ranges')
    ).toBe("'Operator''s Queue'!A1:A2");
  });
  it('shares metadata only within each sample and spaces concurrent actual fetch starts', async () => {
    let time = 0;
    const starts: number[] = [];
    const adapter = createGoogleRestAdapter(
      setup({
        now: () => time,
        sleep: (ms): Promise<void> => {
          time += ms;
          return Promise.resolve();
        },
        fetchImpl: (): Promise<GoogleReadResponse> => {
          starts.push(time);
          return Promise.resolve(response());
        },
      })
    );
    const input = {
      ...manifest,
      assertions: [grid, { ...grid, id: 'filter', kind: 'basic-filter' }],
    };
    const results = await Promise.all([
      adapter.readAssertions(input),
      adapter.readAssertions(input),
    ]);
    expect(starts).toEqual([0, 1100]);
    expect(results.every((result) => result.assertions.length === 2)).toBe(true);
  });
  it('requests bounded dimensions and exposes no write capability on its read-only facade', async () => {
    const fetchImpl = vi.fn(setup().fetchImpl);
    const adapter = createGoogleReadOnlyAdapter(setup({ fetchImpl }));
    expect(adapter).not.toHaveProperty('apply');
    expect(adapter.capabilities).toMatchObject({ readOnly: true, exactPreparedWrites: false });
    await adapter.readMetadata();
    const actual = await adapter.readAssertions({
      ...manifest,
      assertions: [{ ...values, kind: 'dimension-pixels', dimension: 'ROWS' }],
    });
    expect(actual.assertions.at(0)?.pixels).toEqual([240]);
    const url = new URL(fetchImpl.mock.calls.at(1)?.[0] ?? 'https://invalid.test');
    expect(url.searchParams.get('ranges')).toBe("'Operator''s Queue'!A1:A1");
    expect(url.searchParams.get('fields')).toContain('rowMetadata(pixelSize)');
    expect(url.searchParams.get('fields')).not.toContain('rowData');
    expect(fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });
});
