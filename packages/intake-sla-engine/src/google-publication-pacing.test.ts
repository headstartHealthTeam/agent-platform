import type { GoogleReadResponse } from '@headstart-health/google-read-transport';
import { expect, it, vi } from 'vitest';

import { createGoogleRestAdapter } from './google-publication-adapter.js';

it('starts the HTTP timeout after queued pacing, preserving the full dispatch budget', async () => {
  let time = 0;
  const deadlines = new WeakMap<AbortSignal, number>();
  const budgets: number[] = [];
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const { signal } = new AbortController();
    deadlines.set(signal, time + milliseconds);
    return signal;
  });
  try {
    const adapter = createGoogleRestAdapter({
      manifest: { spreadsheetId: 'synthetic', runId: 'run', stages: [] },
      tokenProvider: (): Promise<string> => Promise.resolve('synthetic'),
      checkConcurrency: (): Promise<undefined> => Promise.resolve(undefined),
      now: () => time,
      sleep: (ms): Promise<void> => {
        time += ms;
        return Promise.resolve();
      },
      fetchImpl: (_url, init): Promise<GoogleReadResponse> => {
        if (init.signal === undefined || init.signal === null) throw new Error('Missing signal');
        budgets.push((deadlines.get(init.signal) ?? 0) - time);
        return Promise.resolve({
          ok: true,
          json: (): Promise<unknown> => Promise.resolve({ spreadsheetId: 'synthetic' }),
        });
      },
    });
    await Promise.all(Array.from({ length: 60 }, () => adapter.readMetadata()));
    expect(budgets).toEqual(Array.from({ length: 60 }, () => 60_000));
    expect(time).toBe(59 * 1100);
  } finally {
    timeout.mockRestore();
  }
});

it('paces two independent 117-assertion samples and retries a transient limit in place', async () => {
  const manifest = { spreadsheetId: 'synthetic-sheet', runId: 'run', stages: [] };
  const assertions = Array.from({ length: 117 }, (_, row) => ({
    id: `row-${String(row)}`,
    kind: 'values',
    title: 'Queue',
    sheetId: 1,
    startRowIndex: row,
    endRowIndex: row + 1,
    startColumnIndex: 0,
    endColumnIndex: 1,
  }));
  const calls: { time: number; row: number; sample: number }[] = [];
  let time = 0;
  let sample = 1;
  let limited = false;
  const adapter = createGoogleRestAdapter({
    manifest,
    tokenProvider: (): Promise<string> => Promise.resolve('synthetic'),
    checkConcurrency: (): Promise<undefined> => Promise.resolve(undefined),
    maxCoalescedCells: 1,
    now: () => time,
    random: () => 0,
    sleep: (ms): Promise<void> => {
      time += ms;
      return Promise.resolve();
    },
    fetchImpl: (url): Promise<GoogleReadResponse> => {
      const range = new URL(url).searchParams.get('ranges');
      const row = Number(range?.match(/!A(\d+):/)?.[1]) - 1;
      calls.push({ time, row, sample });
      if (!limited && calls.length === 61) {
        limited = true;
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '2' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: (): Promise<unknown> =>
          Promise.resolve({
            spreadsheetId: manifest.spreadsheetId,
            sheets: [
              {
                properties: { sheetId: 1 },
                data: [
                  {
                    startRow: row,
                    startColumn: 0,
                    rowData: [
                      {
                        values: [
                          { userEnteredValue: { stringValue: `${String(sample)}:${String(row)}` } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
      });
    },
  });
  for (sample = 1; sample <= 2; sample++) {
    const actual = await adapter.readAssertions({ ...manifest, assertions });
    expect(actual.assertions.map((assertion) => assertion.values)).toEqual(
      assertions.map((_, row) => [[{ stringValue: `${String(sample)}:${String(row)}` }]])
    );
  }
  expect(calls).toHaveLength(235);
  expect(calls.at(61)?.row).toBe(calls.at(60)?.row);
  expect((calls.at(61)?.time ?? 0) - (calls.at(60)?.time ?? 0)).toBeGreaterThanOrEqual(2000);
  expect(
    calls.every(
      (call) =>
        calls.filter((other) => other.time > call.time - 60_000 && other.time <= call.time)
          .length <= 60
    )
  ).toBe(true);
});
