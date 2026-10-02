import { describe, expect, it } from 'vitest';

import { sha256Json } from './json-fingerprint.js';
import { mergeSlackDelta } from './slack-delta.js';
import { materializeSlackSearchCapture } from './slack-search-capture.js';
import { normalizeSlackSearchPage } from './slack-search-page.js';
import { extendSlackSearchCapture } from './slack-search-resume.js';

const plan = {
  scope: ['all-accessible'],
  targets: [{ opportunityId: 'synthetic', queries: [{ query: 'synthetic-query' }] }],
};
function page(
  pageNumber = 1,
  requestCursor = '',
  next = ''
): {
  opportunityId: string;
  query: string;
  complete: boolean;
  pageNumber: number;
  requestCursor: string;
  response: {
    ok: boolean;
    messages: {
      matches: { channel: { id: string }; ts: string; text: string; reply_count: number }[];
    };
    response_metadata: { next_cursor: string };
  };
} {
  return {
    opportunityId: 'synthetic',
    query: 'synthetic-query',
    complete: true,
    pageNumber,
    requestCursor,
    response: {
      ok: true,
      messages: {
        matches: [
          { channel: { id: 'channel' }, ts: '1767225600.001', text: 'Synthetic', reply_count: 0 },
        ],
      },
      response_metadata: { next_cursor: next },
    },
  };
}
function capture(pages: unknown[]): {
  version: number;
  runId: string;
  asOf: string;
  collectedAt: string;
  planHash: string;
  scopeHash: string;
  accessVerified: boolean;
  pages: unknown[];
} {
  return {
    version: 1,
    runId: 'synthetic',
    asOf: '2026-01-02T00:00:00Z',
    collectedAt: '2026-01-02T00:01:00Z',
    planHash: sha256Json(plan),
    scopeHash: sha256Json(plan.scope),
    accessVerified: true,
    pages,
  };
}
describe('Intake Slack run capture and bounded recovery', () => {
  it('binds generic page mechanics to exact raw response hashes and receipt identity', () => {
    const input = page();
    const result = normalizeSlackSearchPage(input);
    expect(result).toMatchObject({
      query: input.query,
      requestCursor: '',
      pageNumber: 1,
      terminal: true,
      responseHash: sha256Json(input.response),
    });
    for (const patch of [
      { complete: false },
      { pageNumber: 0 },
      { requestCursor: null },
      { query: null },
      { response: { isError: true } },
    ])
      expect(() => normalizeSlackSearchPage({ ...input, ...patch })).toThrow();
  });
  it('extends a capture idempotently without replacing prior raw pages or changing cutoff', () => {
    const first = capture([page(1, '', 'next')]);
    const next = capture([page(2, 'next', '')]);
    const combined = extendSlackSearchCapture(first, next);
    expect(combined.pages).toHaveLength(2);
    expect(combined.pages[0]).toBe(first.pages[0]);
    expect(materializeSlackSearchCapture({ plan, capture: combined })[0]?.blocked).toBe(false);
    expect(extendSlackSearchCapture(combined, next)).toEqual(combined);
    const changed = page(1, '', 'next');
    changed.response.messages.matches[0] = {
      channel: { id: 'channel' },
      ts: '1767225600.001',
      text: 'Changed',
      reply_count: 0,
    };
    expect(() => extendSlackSearchCapture(first, capture([changed]))).toThrow('replace');
    expect(() => extendSlackSearchCapture(first, { ...next, asOf: '2026-01-03' })).toThrow(
      'bindings'
    );
    expect(() => extendSlackSearchCapture(capture([page(), page()]), next)).toThrow('duplicate');
    expect(first.pages).toHaveLength(1);
  });
  it('deduplicates overlaps while preserving row-local incomplete searches and the frozen cutoff', () => {
    const input = capture([page(1, '', 'next'), page(2, 'next', '')]);
    const result = materializeSlackSearchCapture({ plan, capture: input });
    expect(result[0]).toMatchObject({
      paginationComplete: true,
      blocked: false,
      pageCount: 2,
      captureHash: sha256Json(input),
      planHash: sha256Json(plan),
      sourceCutoff: input.asOf,
    });
    expect(result[0]?.records).toHaveLength(1);
    expect(
      materializeSlackSearchCapture({ plan, capture: capture([page(1, '', 'next')]) })[0]?.blocked
    ).toBe(true);
    const future = page();
    future.response.messages.matches[0] = {
      channel: { id: 'channel' },
      ts: '1767398400.001',
      text: 'After cutoff',
      reply_count: 0,
    };
    expect(materializeSlackSearchCapture({ plan, capture: capture([future]) })[0]?.records).toEqual(
      []
    );
    const multiPlan = {
      ...plan,
      targets: [...plan.targets, { opportunityId: 'other', queries: [{ query: 'other-query' }] }],
    };
    const rows = materializeSlackSearchCapture({
      plan: multiPlan,
      capture: { ...capture([page()]), planHash: sha256Json(multiPlan) },
    });
    expect(rows.map((row) => row.blocked)).toEqual([false, true]);
  });
  it('rejects disconnected, repeated, conflicting and unplanned source captures', () => {
    for (const pages of [
      [page(), page()],
      [page(2, 'next', '')],
      [page(1, '', 'next'), page(2, 'wrong', '')],
      [page(1, '', 'next'), page(2, 'next', 'next'), page(3, 'next', '')],
    ])
      expect(() => materializeSlackSearchCapture({ plan, capture: capture(pages) })).toThrow(
        'pagination'
      );
    const changed = page(2, 'next', '');
    changed.response.messages.matches[0] = {
      channel: { id: 'channel' },
      ts: '1767225600.001',
      text: 'Conflicting',
      reply_count: 0,
    };
    expect(() =>
      materializeSlackSearchCapture({ plan, capture: capture([page(1, '', 'next'), changed]) })
    ).toThrow('reconciliation');
    expect(() =>
      materializeSlackSearchCapture({
        plan,
        capture: capture([{ ...page(), opportunityId: 'unknown' }]),
      })
    ).toThrow('Unknown');
    for (const patch of [
      { planHash: 'wrong' },
      { scopeHash: 'wrong' },
      { accessVerified: false },
      { asOf: 'invalid' },
      { collectedAt: '2026-01-01' },
      { collectedAt: '2999-01-01' },
    ])
      expect(() =>
        materializeSlackSearchCapture({ plan, capture: { ...capture([]), ...patch } })
      ).toThrow('bound');
    expect(() =>
      materializeSlackSearchCapture({
        plan: { ...plan, targets: [...plan.targets, ...plan.targets] },
        capture: capture([]),
      })
    ).toThrow('duplicate');
  });
  it('requires edit/deletion completeness for deltas and preserves retained record references', () => {
    const old = { channelId: 'c', messageTs: '1.1', text: 'old' };
    const retained = { channelId: 'c', messageTs: '1.2', text: 'retained' };
    const base = {
      asOf: '2026-01-01T00:00:00Z',
      scope: [],
      identityHash: 'identity',
      records: [old, retained],
    };
    const delta = {
      asOf: '2026-01-02T00:00:00Z',
      scope: [],
      identityHash: 'identity',
      records: [{ ...old, text: 'edited' }],
      deletedKeys: [],
    };
    const proof = (
      next = delta
    ): {
      version: number;
      baseHash: string;
      deltaHash: string;
      scopeHash: string;
      identityHash: string;
      from: string;
      to: string;
      paginationComplete: boolean;
      coversEdits: boolean;
      coversDeletions: boolean;
    } => ({
      version: 1,
      baseHash: sha256Json(base),
      deltaHash: sha256Json(next),
      scopeHash: sha256Json([]),
      identityHash: 'identity',
      from: base.asOf,
      to: next.asOf,
      paginationComplete: true,
      coversEdits: true,
      coversDeletions: true,
    });
    const result = mergeSlackDelta({ base, delta, proof: proof() });
    expect(result.records).toEqual([delta.records[0], retained]);
    expect(result.records[1]).toBe(retained);
    expect(result.provenance.proofHash).toBe(sha256Json(proof()));
    expect(() =>
      mergeSlackDelta({ base, delta, proof: { ...proof(), coversEdits: false } })
    ).toThrow('refresh');
    const deleted = { ...delta, records: [], deletedKeys: ['c:1.1'] };
    const deletionProof = { ...proof(), deltaHash: sha256Json(deleted) };
    expect(mergeSlackDelta({ base, delta: deleted, proof: deletionProof }).records).toEqual([
      retained,
    ]);
    const conflict = { ...delta, deletedKeys: ['c:1.1'] };
    expect(() =>
      mergeSlackDelta({
        base,
        delta: conflict,
        proof: { ...proof(), deltaHash: sha256Json(conflict) },
      })
    ).toThrow('Conflicting');
    const duplicates = { ...delta, records: [old, old] };
    expect(() =>
      mergeSlackDelta({
        base,
        delta: duplicates,
        proof: { ...proof(), deltaHash: sha256Json(duplicates) },
      })
    ).toThrow('Duplicate');
    const malformed = { ...delta, records: null };
    expect(() =>
      mergeSlackDelta({
        base,
        delta: malformed,
        proof: { ...proof(), deltaHash: sha256Json(malformed) },
      })
    ).toThrow('Invalid Slack delta');
  });
});
