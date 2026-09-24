import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assembleReport } from './report-assembly.js';
import {
  indexReportReviewerState,
  loadReportReviewerState,
  loadReportRunHistory,
  selectReportRunHistory,
} from './report-saved-state.js';
import { REPORT_HISTORY_HEADERS } from './report-vocabulary.js';

const cutoff = new Date('2026-09-24T14:00:00Z');
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true }))
  );
});
async function fixtureFile(value: unknown): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intake-report-state-'));
  directories.push(directory);
  const file = path.join(directory, 'state.json');
  await fs.writeFile(file, JSON.stringify(value));
  return file;
}

describe('approved saved report inputs', () => {
  it('indexes both original keys, preserves raw reviewer values and uses the last matching row', () => {
    const first = { opportunityId: 'one', opportunityName: 'Synthetic A', needsCsmReview: false };
    const last = {
      opportunityId: 'one',
      opportunityName: 'Synthetic B',
      needsCsmReview: null,
      copiedToSalesforce: false,
      reviewerNotes: '  literal  ',
      reviewedAt: undefined,
    };
    const rows = [first, last, { opportunityId: '', opportunityName: null }];
    const before = structuredClone(rows);
    const result = indexReportReviewerState(
      { capturedAt: cutoff.toISOString(), rows },
      cutoff,
      true
    );
    expect([...result.keys()]).toEqual(['one', 'Synthetic A', 'Synthetic B']);
    expect(result.get('one')).toBe(last);
    expect(result.get('Synthetic A')).toBe(first);
    expect(result.get('Synthetic B')).toBe(last);
    expect(rows).toEqual(before);
  });
  it('keeps the exact frozen-cutoff age boundary and permits a later capture at build time', () => {
    for (const capturedAt of ['2026-09-24T12:00:00Z', '2026-09-25T14:00:00Z'])
      expect(indexReportReviewerState({ capturedAt }, cutoff, true).size).toBe(0);
    for (const capturedAt of ['2026-09-24T11:59:59.999Z', 'invalid', '', null]) {
      expect(() => indexReportReviewerState({ capturedAt }, cutoff, true)).toThrow(
        'current capture'
      );
      expect(indexReportReviewerState({ capturedAt }, cutoff, false).size).toBe(0);
    }
  });
  it('retains headers, raw cell types, row references and the approved 99-row selection', () => {
    const rows = [
      null,
      {},
      [],
      ['', 'invalid'],
      [0, 'invalid'],
      ...Array.from({ length: 101 }, (_, index) => [
        `run-${String(index)}`,
        false,
        null,
        ' raw ',
        index,
      ]),
    ];
    const snapshot = { headers: REPORT_HISTORY_HEADERS, rows };
    const before = structuredClone(snapshot);
    const result = selectReportRunHistory(snapshot, REPORT_HISTORY_HEADERS);
    expect(result).toHaveLength(99);
    expect(result[0]).toBe(rows[5]);
    expect(result[98]?.[0]).toBe('run-98');
    expect(snapshot).toEqual(before);
    expect(
      selectReportRunHistory({ ...snapshot, headers: ['wrong'] }, REPORT_HISTORY_HEADERS)
    ).toEqual([]);
    expect(selectReportRunHistory({ rows }, REPORT_HISTORY_HEADERS)).toEqual([]);
  });
  it('bounds prior history before assembly removes the current run rather than refilling the window', () => {
    const rows = Array.from({ length: 100 }, (_, index) => [`run-${String(index)}`]);
    const priorRunHistory = selectReportRunHistory(
      { headers: REPORT_HISTORY_HEADERS, rows },
      REPORT_HISTORY_HEADERS
    );
    const result = assembleReport({
      runId: 'run-0',
      runAt: cutoff,
      runAtEastern: '2026-09-24 10:00 ET',
      expectedRows: 0,
      entries: [],
      sourceStatusRecords: [],
      combinedGenerationLedgerRows: [],
      delayHistoryRows: [],
      noteAdjudications: { inputHash: 'synthetic', receipts: [] },
      priorRunHistoryRows: priorRunHistory,
    });
    expect(result.runHistoryRows).toHaveLength(100);
    expect(result.runHistoryRows.at(-1)?.[0]).toBe('run-98');
  });
  it('loads a real saved capture without changing own values or optional empty state', async () => {
    const file = await fixtureFile({
      capturedAt: cutoff.toISOString(),
      rows: [{ opportunityId: 'one', copiedToSalesforce: false, reviewerNotes: null }],
    });
    expect((await loadReportReviewerState(file, cutoff, true)).get('one')).toEqual({
      opportunityId: 'one',
      copiedToSalesforce: false,
      reviewerNotes: null,
    });
    const absent = path.join(path.dirname(file), 'absent.json');
    expect((await loadReportReviewerState(absent, cutoff, false)).size).toBe(0);
    await expect(loadReportReviewerState(absent, cutoff, true)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await loadReportRunHistory(absent, REPORT_HISTORY_HEADERS)).toEqual([]);
    expect(
      await loadReportRunHistory(
        await fixtureFile({ headers: REPORT_HISTORY_HEADERS, rows: [['prior', false]] }),
        REPORT_HISTORY_HEADERS
      )
    ).toEqual([['prior', false]]);
  });
  it('does not disguise corrupt saved state as missing or silently swallow filesystem errors', async () => {
    const file = await fixtureFile({ rows: 'invalid' });
    await expect(loadReportReviewerState(file, cutoff, false)).rejects.toThrow(
      'Invalid saved reviewer'
    );
    await expect(loadReportRunHistory(file, REPORT_HISTORY_HEADERS)).rejects.toThrow(
      'Invalid saved Run History'
    );
    await fs.writeFile(file, '{invalid');
    await expect(loadReportReviewerState(file, cutoff, false)).rejects.toBeInstanceOf(SyntaxError);
    await expect(loadReportRunHistory(path.dirname(file), REPORT_HISTORY_HEADERS)).rejects.toThrow(
      'regular file'
    );
  });
});
