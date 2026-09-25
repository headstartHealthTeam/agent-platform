import { describe, expect, it } from 'vitest';

import { requiredGridExpansion } from './google-grid.js';
import { googlePresentation } from './google-presentation.js';
import { planGoogleAssertionReads } from './google-read-plan.js';
import { sha256Json } from './json-fingerprint.js';
import { publicationPlanHash } from './publication-plan.js';

describe('approved Google publication planning foundations', () => {
  it('expands capacity only when the numeric integer requirement exceeds the live grid', () => {
    expect(
      requiredGridExpansion({
        liveRowCount: '1000',
        liveColumnCount: 10,
        requiredRowCount: 1501,
        requiredColumnCount: 8,
      })
    ).toEqual({ rowCount: 1501, columnCount: null });
    expect(
      requiredGridExpansion({
        liveRowCount: 10,
        liveColumnCount: '10',
        requiredRowCount: 10,
        requiredColumnCount: '11',
      })
    ).toEqual({ rowCount: null, columnCount: 11 });
    expect(requiredGridExpansion()).toEqual({ rowCount: null, columnCount: null });
    expect(
      requiredGridExpansion({
        liveRowCount: 'bad',
        requiredRowCount: 10,
        liveColumnCount: 1,
        requiredColumnCount: 2.5,
      })
    ).toEqual({ rowCount: null, columnCount: null });
  });
  it('coalesces only adjacent values in the same tab/columns while retaining original assertion references', () => {
    const row = (
      start: number
    ): {
      kind: string;
      title: string;
      sheetId: number;
      startRowIndex: number;
      endRowIndex: number;
      startColumnIndex: number;
      endColumnIndex: number;
      rowCount: number;
      extra: string;
    } => ({
      kind: 'values',
      title: 'Synthetic',
      sheetId: 1,
      startRowIndex: start,
      endRowIndex: start + 1,
      startColumnIndex: 0,
      endColumnIndex: 1,
      rowCount: 1,
      extra: 'retained',
    });
    const original = Array.from({ length: 5 }, (_, index) => row(index));
    const groups = planGoogleAssertionReads(original, 2);
    expect(groups.map((group) => group.assertions.length)).toEqual([2, 2, 1]);
    expect(groups[0]?.range).toMatchObject({
      startRowIndex: 0,
      endRowIndex: 2,
      rowCount: 2,
      extra: 'retained',
    });
    expect(groups[0]?.assertions[0]).toBe(original[0]);
    expect(original[0]?.endRowIndex).toBe(1);
    expect(
      planGoogleAssertionReads([row(0), { ...row(1), kind: 'text-layout' }, row(2)]).length
    ).toBe(3);
    expect(planGoogleAssertionReads([row(0), { ...row(1), sheetId: 2 }]).length).toBe(2);
    expect(
      planGoogleAssertionReads([row(0), { ...row(1), startColumnIndex: 1, endColumnIndex: 2 }])
        .length
    ).toBe(2);
    expect(planGoogleAssertionReads([row(0), row(2)]).length).toBe(2);
    expect(
      planGoogleAssertionReads([{ kind: 'grid-properties', title: 'Synthetic', sheetId: 1 }]).length
    ).toBe(1);
    for (const max of [0, 10_001, 0.5, Number.NaN])
      expect(() => planGoogleAssertionReads(original, max)).toThrow(/coalescing bound/);
  });
  it('keeps append-only history presentation away from existing rows and column widths', () => {
    const history = googlePresentation({
      title: 'Run History',
      sheetId: 1,
      headers: ['Summary'],
      startRowIndex: 17,
      endRowIndex: 19,
    });
    expect(history.requests).toHaveLength(2);
    expect(history.assertions.map((entry) => entry.kind)).toEqual([
      'text-layout',
      'dimension-pixels',
    ]);
    expect(
      history.assertions.every((entry) => entry.startRowIndex === 17 && entry.endRowIndex === 19)
    ).toBe(true);
    expect(history.assertions[1]).toMatchObject({
      dimension: 'ROWS',
      expectedHash: sha256Json([240, 240]),
    });
    expect(
      googlePresentation({ title: 'Generation Ledger', sheetId: 1, headers: [], endRowIndex: 2 })
    ).toEqual({ requests: [], assertions: [] });
    expect(
      googlePresentation({
        title: 'Review Queue',
        sheetId: 1,
        headers: [],
        startRowIndex: 2,
        endRowIndex: 2,
      })
    ).toEqual({ requests: [], assertions: [] });
  });
  it('preserves bounded layout, exact field masks and operator widths', () => {
    const review = googlePresentation({
      title: 'Review Queue',
      sheetId: 2,
      headers: ['In-Depth Summary', 'Reviewer Notes', 'Other'],
      endRowIndex: 2,
    });
    expect(review.requests).toHaveLength(5);
    expect(review.requests[0]).toMatchObject({
      repeatCell: {
        fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
        range: { endColumnIndex: 3 },
      },
    });
    expect(review.assertions[1]).toMatchObject({ expectedHash: sha256Json([72]) });
    expect(review.assertions[3]).toMatchObject({
      dimension: 'COLUMNS',
      expectedHash: sha256Json([650]),
    });
    const notes = googlePresentation({
      title: 'Source & Run Notes',
      sheetId: 3,
      headers: ['Label', 'Value'],
      endRowIndex: 3,
    });
    expect(notes.assertions.map((a) => a.expectedHash)).toContain(sha256Json([144, 144]));
    const evidence = googlePresentation({
      title: 'Evidence Detail',
      sheetId: 4,
      headers: ['Summary', 'Other'],
      endRowIndex: 1,
    });
    expect(evidence.requests).toHaveLength(3);
    expect(evidence.assertions.at(-1)?.expectedHash).toBe(sha256Json([420]));
    expect(() =>
      googlePresentation({ title: 'Review Queue', sheetId: 1, headers: [], endRowIndex: 2.5 })
    ).toThrow(RangeError);
  });
  it('binds only the selected stage contract and exact final assertions', () => {
    const stage = {
      id: 'stage',
      payloadHash: 'synthetic-hash',
      metadata: 'ignored',
      calls: [{ file: 'call.json', payloadHash: 'call-hash', unrelated: true }],
    };
    const expected = sha256Json({
      stages: [
        {
          id: 'stage',
          dependsOn: null,
          terminal: false,
          alreadySatisfied: false,
          file: null,
          payloadHash: 'synthetic-hash',
          calls: [{ file: 'call.json', payloadHash: 'call-hash' }],
          assertions: [],
        },
      ],
      finalAssertions: [],
    });
    expect(publicationPlanHash([stage])).toBe(expected);
    const changedMetadata = { ...stage, metadata: 'changed' };
    expect(publicationPlanHash([changedMetadata])).toBe(expected);
    expect(publicationPlanHash([stage], [{ id: 'final' }])).not.toBe(expected);
    expect(publicationPlanHash([{ ...stage, terminal: true }])).not.toBe(expected);
    expect(publicationPlanHash()).toBe(sha256Json({ stages: [], finalAssertions: [] }));
  });
});
