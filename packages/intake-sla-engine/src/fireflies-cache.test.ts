import { transcriptMetadata } from '@headstart-health/fireflies-data';
import { describe, expect, it } from 'vitest';

import { cacheFixture, executeCache } from './fireflies-cache-fixture.test-support.js';
import { materializeFirefliesCache } from './fireflies-cache-materialize.js';
import {
  cacheReuseReason,
  healthyCacheBaseline,
  planFirefliesCache,
  transcriptContentHash,
} from './fireflies-cache-plan.js';
import { verifyFirefliesCacheRun } from './fireflies-cache-verify.js';
import { sha256Json } from './json-fingerprint.js';

describe('frozen-run Fireflies cache plan and materialization', () => {
  it('builds a baseline and permits approved exact reuse without falsifying retrieval time', () => {
    const first = executeCache(cacheFixture());
    const input = cacheFixture(11);
    const result = executeCache(input, first, 'reuse');
    expect(result.report.counts).toMatchObject({ reused: 1, fetched: 0 });
    expect(result.records[0]?.retrievedAt).toBe(first.records[0]?.retrievedAt);
    expect(result.index.lastFullRevalidationAt).toBe(first.index.lastFullRevalidationAt);
    expect(result.report.provenance[0]?.source).toBe('Cache Reused');
    for (const runAt of [input.discovery.asOf, new Date(input.discovery.asOf)]) {
      expect(
        verifyFirefliesCacheRun({
          records: result.records,
          proof: result.proof,
          runAt,
          collectionPlan: input.collectionPlan,
        })
      ).toEqual(result.report);
    }
  });
  it('fetches new/reappearing IDs and excludes removed IDs from the current inventory', () => {
    const first = executeCache(cacheFixture());
    const second = executeCache(cacheFixture(11, ['new-synthetic']), first, 'reuse');
    expect(second.report.counts.fetched).toBe(1);
    expect(second.records.map((row) => row.transcriptId)).toEqual(['new-synthetic']);
    expect(executeCache(cacheFixture(12), second, 'reuse').report.counts.fetched).toBe(1);
    expect(executeCache(cacheFixture(10, [])).records).toEqual([]);
  });
  it('keeps shadow fresh, compares hidden body edits, and hashes content independently of transport time', () => {
    const first = executeCache(cacheFixture(10, ['b', 'a']));
    const next = executeCache(cacheFixture(11, ['a', 'b']), first);
    expect(next.records.map((row) => row.transcriptId)).toEqual(['a', 'b']);
    expect(next.index.entries.map((entry) => entry.contentHash)).toEqual(
      first.index.entries.map((entry) => entry.contentHash)
    );
    expect(next.report.inventoryHash).not.toBe(first.report.inventoryHash);
    expect(next.report.counts).toEqual({
      total: 2,
      fetched: 2,
      reused: 0,
      shadowCompared: 2,
      shadowChanged: 0,
    });
    const input = cacheFixture(11, ['a', 'b']);
    input.fetched = input.fetched.map((record) => ({
      ...record,
      fullTranscript: 'Changed synthetic evidence',
    }));
    const changed = executeCache(input, first);
    expect(changed.report.counts.shadowChanged).toBe(2);
    expect(changed.records[0]?.fullTranscript).toBe('Changed synthetic evidence');
    expect(changed.report.provenance[0]?.source).toBe('Cache Revalidated');
  });
  it('invalidates baseline for scope, policy, schema, duplicates and age without blocking fresh collection', () => {
    const first = executeCache(cacheFixture());
    const input = cacheFixture(11);
    const objects = new Map(first.records.map((record) => [record.transcriptId, record]));
    const args = { ...input, objects, index: first.index, mode: 'reuse' };
    const changedScope = {
      ...input.discovery,
      scope: { ...input.discovery.scope, principalId: 'different' },
    };
    for (const patch of [
      { discovery: changedScope },
      { policy: { ...input.policy, maxValidationAgeHours: 24 } },
      { index: { ...first.index, version: 'unsupported' } },
      { index: { ...first.index, entries: [null] } },
      { index: { ...first.index, entries: [...first.index.entries, ...first.index.entries] } },
      { index: { ...first.index, lastFullRevalidationAt: '2027-01-01' } },
      { index: { ...first.index, lastDiscoveryAt: '2027-01-01' } },
    ]) {
      expect(planFirefliesCache({ ...args, ...patch }).fullRevalidation).toBe(true);
    }
    expect(executeCache(cacheFixture(18), first, 'reuse').proof.plan.fullRevalidation).toBe(true);
    expect(healthyCacheBaseline(null, '', '', 0)).toBeNull();
  });
  it('fetches recent/due bodies and never replaces a missing required fetch with old content', () => {
    const recent = executeCache(
      cacheFixture(10, ['synthetic-meeting'], '2026-01-10T12:00:00.000Z')
    );
    expect(
      executeCache(
        cacheFixture(11, ['synthetic-meeting'], '2026-01-10T12:00:00.000Z'),
        recent,
        'reuse'
      ).report.counts.fetched
    ).toBe(1);
    const first = executeCache(cacheFixture());
    expect(executeCache(cacheFixture(14), first, 'reuse').report.counts.fetched).toBe(1);
    const input = cacheFixture(11);
    const objects = new Map(first.records.map((record) => [record.transcriptId, record]));
    const args = { ...input, objects, index: first.index };
    const plan = planFirefliesCache(args);
    expect(() => materializeFirefliesCache({ ...args, plan, fetched: [] })).toThrow(
      expect.objectContaining({ code: 'MISSING_REQUIRED_FETCH' })
    );
    for (const fetched of [
      input.fetched.map((record) => ({ ...record, complete: false })),
      input.fetched.map((record) => ({ ...record, fullTranscript: '' })),
      input.fetched.map((record) => ({ ...record, isLive: true })),
      input.fetched.map((record) => ({ ...record, retrievedAt: '2027-01-01' })),
      input.fetched.map((record) => ({ ...record, retrievedAt: '2026-01-01' })),
      [...input.fetched, ...input.fetched],
      input.fetched.map((record) => ({ ...record, transcriptId: 'unexpected' })),
      input.fetched.map((record) => ({ ...record, title: 'Changed metadata' })),
    ])
      expect(() => materializeFirefliesCache({ ...args, plan, fetched })).toThrow();
    expect(() => materializeFirefliesCache({ ...args, plan, completedAt: '2025-01-01' })).toThrow(
      'Invalid materialization'
    );
    const empty = cacheFixture();
    empty.fetched = empty.fetched.map((record) => ({
      ...record,
      fullTranscript: '',
      transcriptEmpty: true,
    }));
    expect(executeCache(empty).records[0]?.transcriptEmpty).toBe(true);
  });
  it('retains each existing reuse reason and explicit mode/policy approval', () => {
    const first = executeCache(cacheFixture());
    const input = cacheFixture(11);
    const record = first.records[0];
    const entry = first.index.entries[0];
    if (record === undefined || entry === undefined) throw new Error('Missing fixture');
    const meeting = transcriptMetadata(record);
    const reason = (patch: object, value: unknown = record): string | null =>
      cacheReuseReason(
        meeting,
        { ...entry, ...patch },
        value,
        input.policy,
        Date.parse(input.discovery.asOf)
      );
    expect(reason({}, null)).toBe('missing-or-corrupt');
    expect(
      cacheReuseReason(meeting, undefined, record, input.policy, Date.parse(input.discovery.asOf))
    ).toBe('missing-or-corrupt');
    expect(reason({ metadataHash: 'changed' })).toBe('metadata-changed');
    expect(reason({}, { ...record, title: 'Changed' })).toBe('metadata-changed');
    expect(reason({ contentHash: 'changed' })).toBe('content-unverifiable');
    expect(reason({ lastFetchedAt: '2026-01-01' })).toBe('invalid-fetch-time');
    expect(reason({ lastFetchedAt: '2027-01-01' }, { ...record, retrievedAt: '2027-01-01' })).toBe(
      'invalid-fetch-time'
    );
    expect(reason({ lastFetchedAt: 'invalid' })).toBe('content-unverifiable');
    expect(reason({ nextRevalidateAt: '2026-01-01' })).toBe('revalidation-due');
    expect(reason({}, { ...record, complete: false })).toBe('content-unverifiable');
    expect(reason({})).toBeNull();
    expect(transcriptContentHash(record)).toBe(entry.contentHash);
    for (const approvalReference of ['', ' ', null, 1])
      expect(() =>
        planFirefliesCache({
          ...input,
          mode: 'reuse',
          policy: { ...input.policy, approvalReference },
        })
      ).toThrow('approved');
    expect(() => planFirefliesCache({ ...input, mode: 'other' })).toThrow('Unknown cache');
    const zero = { ...input, policy: { ...input.policy, maxValidationAgeHours: 0 } };
    expect(executeCache(zero, first, 'reuse').report.counts.reused).toBe(0);
    const plan = planFirefliesCache(input);
    expect(() => materializeFirefliesCache({ ...input, plan: { ...plan, items: [] } })).toThrow(
      expect.objectContaining({ code: 'STALE_CACHE_PLAN' })
    );
  });
});

describe('cache replay receipt binding', () => {
  it('rejects missing/transplanted/mutated receipt inputs', () => {
    const first = executeCache(cacheFixture());
    const input = cacheFixture(11);
    const result = executeCache(input, first, 'reuse');
    const check = (proof: unknown, records: readonly unknown[] = result.records): unknown =>
      verifyFirefliesCacheRun({
        records,
        proof,
        runAt: input.discovery.asOf,
        collectionPlan: input.collectionPlan,
      });
    for (const proof of [
      null,
      {},
      { ...result.proof, report: { ...result.report, version: 'unknown' } },
      { ...result.proof, policy: { ...input.policy, maxValidationAgeHours: 1 } },
      { ...result.proof, report: { ...result.report, runId: 'other' } },
      { ...result.proof, plan: { ...result.proof.plan, scopeHash: 'other' } },
    ])
      expect(() => check(proof)).toThrow();
    expect(() =>
      check(
        result.proof,
        result.records.map((record) => ({ ...record, fullTranscript: 'Edited' }))
      )
    ).toThrow('binding');
    expect(() =>
      verifyFirefliesCacheRun({
        records: result.records,
        proof: result.proof,
        runAt: '2026-01-12',
        collectionPlan: input.collectionPlan,
      })
    ).toThrow('another run');
  });
  it('rechecks provenance and current eligibility beyond recomputed top-level hashes', () => {
    const input = cacheFixture(11);
    const first = executeCache(cacheFixture());
    const result = executeCache(input, first, 'reuse');
    const check = (proof: unknown): unknown =>
      verifyFirefliesCacheRun({
        records: result.records,
        proof,
        runAt: input.discovery.asOf,
        collectionPlan: input.collectionPlan,
      });
    expect(() => check({ ...result.proof, report: { ...result.report, provenance: [] } })).toThrow(
      'exactly'
    );
    expect(() =>
      check({ ...result.proof, report: { ...result.report, completedAt: '2026-01-01' } })
    ).toThrow('completion time');
    for (const patch of [
      { id: 'wrong' },
      { recordHash: 'wrong' },
      { contentHash: 'wrong' },
      { retrievedAt: '2026-01-01' },
      { discoveredAt: '2026-01-01' },
    ]) {
      expect(() =>
        check({
          ...result.proof,
          report: {
            ...result.report,
            provenance: result.report.provenance.map((item) => ({ ...item, ...patch })),
          },
        })
      ).toThrow('provenance');
    }
    expect(() =>
      check({
        ...result.proof,
        report: {
          ...result.report,
          provenance: result.report.provenance.map((item) => ({ ...item, source: 'Fresh' })),
        },
      })
    ).toThrow('no longer eligible');
    const { planHash: oldHash, ...body } = result.proof.plan;
    expect(oldHash).toHaveLength(64);
    const plan = {
      ...body,
      fullRevalidation: true,
      planHash: sha256Json({ ...body, fullRevalidation: true }),
    };
    expect(() =>
      check({ ...result.proof, plan, report: { ...result.report, planHash: plan.planHash } })
    ).toThrow('reconciliation');
    const fresh = executeCache(input, first);
    expect(
      verifyFirefliesCacheRun({
        records: fresh.records,
        proof: fresh.proof,
        runAt: input.discovery.asOf,
        collectionPlan: input.collectionPlan,
      })
    ).toEqual(fresh.report);
    expect(() =>
      verifyFirefliesCacheRun({
        records: fresh.records,
        proof: {
          ...fresh.proof,
          report: { ...fresh.report, completedAt: input.discovery.completedAt },
        },
        runAt: input.discovery.asOf,
        collectionPlan: input.collectionPlan,
      })
    ).toThrow('not fetched');
  });
});
