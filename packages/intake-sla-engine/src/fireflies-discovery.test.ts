import type { TranscriptMetadata } from '@headstart-health/fireflies-data';
import { describe, expect, it } from 'vitest';

import {
  cacheTimestamp,
  FIREFLIES_CACHE_VERSION,
  FirefliesCacheError,
  validateCachePolicy,
} from './fireflies-cache-contract.js';
import type { FirefliesCollectionWindow, FirefliesDiscovery } from './fireflies-cache-contract.js';
import { normalizeFirefliesDiscovery, validateDiscovery } from './fireflies-discovery.js';
import { sha256Json } from './json-fingerprint.js';

function fixture(ids: readonly string[] = ['synthetic']): {
  collectionPlan: FirefliesCollectionWindow;
  discovery: FirefliesDiscovery;
  meetings: TranscriptMetadata[];
} {
  const asOf = '2026-01-10T17:00:00.000Z';
  const collectionPlan = { fromDate: '2026-01-01', toDate: asOf };
  const meetings = ids.map((transcriptId) => ({
    transcriptId,
    date: '2026-01-02T12:00:00.000Z',
    title: 'Synthetic support meeting',
    organizerEmail: 'provider@example.test',
    participants: ['provider@example.test'],
    meetingAttendees: [],
    isLive: false,
  }));
  return {
    collectionPlan,
    meetings,
    discovery: {
      version: FIREFLIES_CACHE_VERSION,
      runId: 'synthetic-run',
      asOf,
      startedAt: asOf,
      completedAt: '2026-01-10T17:02:00.000Z',
      collectionPlanHash: sha256Json(collectionPlan),
      scope: {
        provider: 'fireflies',
        principalId: 'synthetic-operator',
        workspaceId: 'synthetic-workspace',
      },
      accessVerified: true,
      query: {
        kind: 'all-accessible-transcripts',
        fromDate: '2026-01-01',
        toDate: asOf,
        limit: 50,
      },
      pages: [{ offset: 0, nextOffset: null, status: 'Complete', meetings }],
    },
  };
}

describe('Intake discovery binding around shared Fireflies mechanics', () => {
  it('translates provider identity failures to the existing Intake command error category', () => {
    const { discovery, collectionPlan, meetings } = fixture();
    const rawDiscovery = {
      ...discovery,
      pages: [
        {
          offset: 0,
          nextOffset: null,
          status: 'Complete',
          meetings: meetings.map((meeting) => ({ ...meeting, participants: ['not-an-email'] })),
        },
      ],
    };
    let caught: unknown;
    try {
      normalizeFirefliesDiscovery({ rawDiscovery, collectionPlan });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FirefliesCacheError);
    expect(caught).toMatchObject({
      code: 'INVALID_DISCOVERY_IDENTITY',
      message: 'Unsupported discovery identity metadata',
    });
    if (!(caught instanceof FirefliesCacheError)) throw new Error('Expected Intake error');
    expect(caught.cause).toBeUndefined();
  });
  it('sorts current eligible metadata and keeps future discovery separate from cutoff admission', () => {
    const { discovery, meetings, collectionPlan } = fixture(['b', 'a']);
    const current = validateDiscovery(discovery, collectionPlan, discovery.asOf);
    expect(current.map((meeting) => meeting.transcriptId)).toEqual(['a', 'b']);
    const future = { ...meetings[0], transcriptId: 'future', date: '2026-01-11T12:00:00.000Z' };
    const extended = {
      ...discovery,
      query: { ...discovery.query, toDate: '2026-01-12' },
      pages: [{ offset: 0, nextOffset: null, status: 'Complete', meetings: [...meetings, future] }],
    };
    expect(validateDiscovery(extended, collectionPlan, discovery.asOf)).toEqual(current);
    const empty = fixture([]);
    expect(validateDiscovery(empty.discovery, empty.collectionPlan, empty.discovery.asOf)).toEqual(
      []
    );
  });
  it('preserves normalization provenance and rejects relabeling derived evidence as raw', () => {
    const { discovery, meetings, collectionPlan } = fixture();
    const rawDiscovery = {
      ...discovery,
      pages: [
        {
          offset: 0,
          nextOffset: null,
          status: 'Complete',
          meetings: meetings.map((meeting) => ({
            ...meeting,
            participants: [...meeting.participants, null],
            meetingAttendees: [
              { email: 'provider@example.test' },
              { email: 'other@example.test', displayName: null },
            ],
            summary_status: 'skipped',
          })),
        },
      ],
    };
    const before = structuredClone(rawDiscovery);
    const result = normalizeFirefliesDiscovery({ rawDiscovery, collectionPlan });
    expect(rawDiscovery).toEqual(before);
    expect(result.receipt.counts).toEqual({
      meetings: 1,
      nullParticipantsRemoved: 1,
      optionalDisplayNamesDefaulted: 2,
    });
    expect(result.receipt).toMatchObject({
      rawDiscoveryHash: sha256Json(before),
      normalizedDiscoveryHash: sha256Json(result.discovery),
      collectionPlanHash: sha256Json(collectionPlan),
      runId: discovery.runId,
      asOf: discovery.asOf,
      hashAlgorithm: 'sha256Json',
    });
    expect(result.discovery.pages[0]).toMatchObject({
      meetings: [
        {
          participants: ['provider@example.test'],
          meetingAttendees: [
            { email: 'provider@example.test', displayName: '' },
            { email: 'other@example.test', displayName: '' },
          ],
          summary_status: 'skipped',
          isLive: false,
        },
      ],
    });
    expect(() =>
      normalizeFirefliesDiscovery({ rawDiscovery: result.discovery, collectionPlan })
    ).toThrow('Derived discovery cannot be relabeled');
  });
  it('requires the existing full scope/window/access/run contract without manufacturing metadata', () => {
    const { discovery, collectionPlan } = fixture();
    for (const value of [
      { ...discovery, version: 'old' },
      { ...discovery, runId: '' },
      { ...discovery, collectionPlanHash: 'wrong' },
      { ...discovery, asOf: '2026-01-09' },
      { ...discovery, accessVerified: false },
      { ...discovery, scope: {} },
      { ...discovery, startedAt: '2026-01-09' },
      { ...discovery, completedAt: '2026-01-09' },
      { ...discovery, startedAt: 1 },
      { ...discovery, query: { ...discovery.query, keyword: 'narrow' } },
      { ...discovery, query: { ...discovery.query, fromDate: '2026-01-05' } },
      { ...discovery, query: { ...discovery.query, toDate: '2026-01-09' } },
      { ...discovery, pages: null },
      { ...discovery, pages: [] },
      {
        ...discovery,
        pages: [{ offset: 0, nextOffset: null, status: 'Complete', meetings: [{}] }],
      },
    ])
      expect(() => validateDiscovery(value, collectionPlan, discovery.asOf)).toThrow();
    expect(() =>
      validateDiscovery(discovery, { ...collectionPlan, toDate: '2026-01-12' }, discovery.asOf)
    ).toThrow('not bound');
    const invalidQuery = { ...discovery, query: { ...discovery.query, keyword: 'narrow' } };
    expect(() => validateDiscovery(invalidQuery, collectionPlan, discovery.asOf)).toThrow(
      expect.objectContaining({ code: 'INCOMPLETE_DISCOVERY' })
    );
  });
  it('preserves pagination exhaustion, duplicate-metadata and out-of-window diagnostic distinctions', () => {
    const { discovery, collectionPlan, meetings } = fixture(
      Array.from({ length: 50 }, (_, index) => `synthetic-${String(index)}`)
    );
    expect(() => validateDiscovery(discovery, collectionPlan, discovery.asOf)).toThrow(
      'unconsumed next page'
    );
    const complete = {
      ...discovery,
      pages: [
        { offset: 0, nextOffset: 50, status: 'Complete', meetings },
        { offset: 50, nextOffset: null, status: 'Complete', meetings: [] },
      ],
    };
    expect(validateDiscovery(complete, collectionPlan, discovery.asOf)).toHaveLength(50);
    const first = meetings[0];
    if (first === undefined) throw new Error('Expected synthetic meeting');
    expect(() =>
      validateDiscovery(
        {
          ...complete,
          pages: [{ offset: 0, nextOffset: 100, status: 'Complete', meetings }, complete.pages[1]],
        },
        collectionPlan,
        discovery.asOf
      )
    ).toThrow('page continuation');
    expect(() =>
      validateDiscovery(
        {
          ...complete,
          pages: [
            complete.pages[0],
            {
              offset: 50,
              nextOffset: null,
              status: 'Complete',
              meetings: [{ ...first, title: 'Changed' }],
            },
          ],
        },
        collectionPlan,
        discovery.asOf
      )
    ).toThrow('Conflicting duplicate');
    expect(() =>
      validateDiscovery(
        {
          ...discovery,
          pages: [
            {
              offset: 0,
              nextOffset: null,
              status: 'Complete',
              meetings: [{ ...first, date: '2025-01-01' }],
            },
          ],
        },
        collectionPlan,
        discovery.asOf
      )
    ).toThrow('outside discovery bounds');
  });
});

describe('existing cache policy contract', () => {
  const policy = {
    version: FIREFLIES_CACHE_VERSION,
    stabilizationHours: 48,
    maxValidationAgeHours: 72,
    fullRevalidationHours: 168,
  };
  it('preserves optional approval metadata and permits zero non-full intervals without activating reuse', () => {
    expect(validateCachePolicy(policy)).toEqual(policy);
    expect(
      validateCachePolicy({
        ...policy,
        stabilizationHours: 0,
        maxValidationAgeHours: 0,
        approvalReference: null,
      })
    ).toMatchObject({ approvalReference: null });
    expect(cacheTimestamp('2026-01-01')).toBe(Date.parse('2026-01-01'));
    for (const value of [null, undefined, 123, 'invalid'])
      expect(() => cacheTimestamp(value)).toThrow('explicit valid timestamp');
  });
  it('rejects unsupported versions and invalid intervals', () => {
    for (const patch of [
      { version: 'old' },
      { stabilizationHours: -1 },
      { maxValidationAgeHours: Infinity },
      { fullRevalidationHours: 0 },
      { stabilizationHours: '1' },
    ]) {
      expect(() => validateCachePolicy({ ...policy, ...patch })).toThrow(
        'invalid Fireflies cache policy'
      );
    }
  });
});
