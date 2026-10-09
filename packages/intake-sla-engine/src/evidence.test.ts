import { afterEach, describe, expect, it, vi } from 'vitest';

import { compareProductionFingerprint, sha256 } from './drift.js';
import {
  approvedEvidence,
  compareEvidence,
  createEvidenceEvent,
  evidenceRank,
  evidenceSpecificity,
  newestRelevantEvidence,
} from './evidence.js';
import type { EvidenceInput } from './evidence.js';
import {
  createSourceResult,
  materialSourceFailure,
  sourceCoverageComplete,
  sourceStatusSchema,
  supplementarySourceFailure,
} from './source-result.js';

const INPUT: EvidenceInput = {
  opportunityId: 'synthetic-opportunity',
  source: 'Fireflies',
  sourceRecordId: 'synthetic-record',
  eventDate: '2026-09-11',
  category: 'intakeScheduling',
  text: 'Synthetic scheduling evidence.',
};
const NOW = '2026-09-11T17:31:07.000Z';
const event = (extra: Partial<EvidenceInput> = {}): ReturnType<typeof createEvidenceEvent> =>
  createEvidenceEvent({ ...INPUT, ...extra });
afterEach(() => {
  vi.useRealTimers();
});

describe('approved evidence contract', () => {
  it('preserves defaults, caller fields and extra typed facts without inventing interpretation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    expect(event()).toEqual({
      ...INPUT,
      collectionDate: NOW,
      matchedIdentities: [],
      processRelevance: 0,
      matchQuality: 'Weak',
      substantive: false,
      relationship: 'Neutral',
      rawText: null,
      issueKey: null,
      lifecycleState: null,
      resolvedByEventId: null,
      resolutionDate: null,
      narrativeContribution: 'Audit Only',
    });
    const result = createEvidenceEvent({
      ...INPUT,
      collectionDate: '2026-09-10',
      substantive: true,
      actionOwner: 'CSM',
    });
    expect(result.actionOwner).toBe('CSM');
    expect(result.collectionDate).toBe('2026-09-10');
    for (const field of [
      'opportunityId',
      'source',
      'sourceRecordId',
      'eventDate',
      'category',
      'text',
    ] as const) {
      expect(() => event({ [field]: '' })).toThrow(`EvidenceEvent missing ${field}`);
    }
  });

  it('ranks gate relevance, identity and source reliability before recency', () => {
    const strongest = event({
      source: 'Authorization',
      processRelevance: 11,
      substantive: true,
      matchQuality: 'Direct',
      relationship: 'Supports',
      eventDate: '2026-09-01',
    });
    const newest = event({
      processRelevance: 7,
      substantive: true,
      matchQuality: 'Direct',
      relationship: 'Conflicts',
      eventDate: '2026-09-11',
    });
    expect(newestRelevantEvidence([newest, strongest])).toEqual(strongest);
    expect(
      approvedEvidence([
        newest,
        strongest,
        event(),
        event({ substantive: true, matchQuality: 'Direct' }),
        event({ substantive: true, relationship: 'Supports' }),
      ])
    ).toEqual([strongest, newest]);
    expect(newestRelevantEvidence([])).toBeNull();
    expect(compareEvidence(strongest, strongest)).toBe(0);
    expect(evidenceRank(strongest)).toEqual([4, 3, 2, 1, Date.parse('2026-09-01'), 11, 2]);
    for (const [relevance, tier] of [
      [-1, 0],
      [0, 0],
      [1, 1],
      [5, 2],
      [8, 3],
      [11, 4],
    ] as const) {
      expect(evidenceRank({ ...strongest, processRelevance: relevance })[0]).toBe(tier);
    }
    expect(
      evidenceRank({
        ...strongest,
        source: 'VOB',
        processRelevance: null,
        eventDate: 'bad',
        matchQuality: 'unknown',
        relationship: 'unknown',
        substantive: false,
      })
    ).toEqual([0, 0, 1, 0, 0, 0, 0]);
    expect(evidenceRank(event({ matchQuality: 'Likely' }))[1]).toBe(2);
    expect(evidenceRank(event())[1]).toBe(1);
  });

  it('preserves every specificity weight and the existing action/impact bonuses', () => {
    const groups = new Map([
      [30, ['rbt-lost', 'tp-signature-format', 'auth-denial-reason']],
      [25, ['treatment-start-planned']],
      [
        24,
        [
          'treatment-ready-to-schedule',
          'ia-underway',
          'ia-partial',
          'ia-medical-reschedule',
          'ia-reschedule',
          'auth-date-correction',
          'family-document-update',
          'tp-clinical-review',
        ],
      ],
      [26, ['auth-additional-info']],
      [28, ['tp-revisions']],
      [32, ['tp-portal-submitted-awaiting-clinical-quality']],
      [20, ['tp-drafting']],
      [18, ['tp-signature']],
      [16, ['rbt-assigned']],
      [10, ['rbt-candidate']],
      [8, ['rbt-recruiting']],
    ]);
    for (const [weight, names] of groups)
      for (const factType of names) {
        expect(evidenceSpecificity({ factType: factType.toUpperCase() })).toBe(weight);
        expect(
          evidenceSpecificity({ factType, gateImpact: 'supported', recommendedAction: 'monitor' })
        ).toBe(weight + 2);
      }
    expect(evidenceSpecificity()).toBe(0);
    expect(evidenceSpecificity({ factType: 'unknown' })).toBe(0);
  });
});

describe('source receipts distinguish empty evidence from incomplete search', () => {
  it('retains counters, weak matches and caller failure reason while normalizing status', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const direct = event({ substantive: true, matchQuality: 'Direct' });
    const likely = event({ substantive: true, matchQuality: 'Likely' });
    const weak = event({ substantive: true });
    const empty = createSourceResult({
      source: 'Fireflies',
      searchStatus: 'Found',
      events: [weak, event({ matchQuality: 'Direct' })],
    });
    expect(empty).toMatchObject({
      status: 'Searched - Not Found',
      collectedAt: NOW,
      runId: null,
      requestCount: 1,
      attempts: 1,
      pageCount: 1,
      recordCount: 0,
      cacheHits: 0,
      required: true,
      paginationComplete: true,
      relevantMatches: [],
      weakMatches: [weak],
    });
    expect(empty.failureReason).toBe(
      'Search completed, but no Direct or Likely substantive evidence matched.'
    );
    const found = createSourceResult({
      source: 'Slack',
      searchStatus: 'Found',
      events: [direct, likely, weak],
      recordCount: 3,
      requestCount: 2,
      attempts: 2,
      pageCount: 2,
      cacheHits: 1,
      runId: 'synthetic-run',
      collectedAt: '2026-09-10',
      required: false,
    });
    expect(found.relevantMatches).toEqual([direct, likely]);
    expect(found.status).toBe('Found');
    expect(found.failureReason).toBeNull();
    expect(
      createSourceResult({ source: 'Slack', searchStatus: 'Found', paginationComplete: false })
        .failureReason
    ).toBe('Search pagination was incomplete.');
    for (const searchStatus of sourceStatusSchema.options) {
      const result = createSourceResult({
        source: 'Slack',
        searchStatus,
        paginationComplete: false,
        failureReason: 'caller reason',
      });
      expect(result.status).toBe(
        ['Blocked', 'Timed Out', 'Unsupported'].includes(searchStatus) ? searchStatus : 'Blocked'
      );
      expect(result.failureReason).toBe('caller reason');
    }
    expect(
      createSourceResult({ source: 'Slack', searchStatus: 'Found', failureReason: 'empty reason' })
        .failureReason
    ).toBe('empty reason');
    expect(() => {
      Reflect.apply(createSourceResult, undefined, [{ source: 'Slack', searchStatus: 'invalid' }]);
    }).toThrow('Invalid source status: invalid');
  });

  it('preserves source presence separately from material and supplementary failures', () => {
    const results = [
      { source: 'Slack', status: 'Blocked' },
      { source: 'Fireflies', status: 'Found' },
    ];
    expect(sourceCoverageComplete(results, ['Slack', 'Fireflies'])).toBe(true);
    expect(sourceCoverageComplete(results, ['Authorization'])).toBe(false);
    expect(materialSourceFailure(results, ['Slack'])).toBe(true);
    expect(supplementarySourceFailure(results, ['Slack'])).toBe(false);
    expect(supplementarySourceFailure(results)).toBe(true);
    expect(
      materialSourceFailure([{ source: 'Slack', status: 'Timed Out', required: false }], ['Slack'])
    ).toBe(false);
    expect(
      supplementarySourceFailure([{ source: 'Slack', status: 'Unsupported', required: false }])
    ).toBe(false);
    expect(materialSourceFailure(results, ['Fireflies'])).toBe(false);
  });
});

describe('Production fingerprint parity', () => {
  it('normalizes only the source text whitespace defined by the approved baseline', () => {
    expect(sha256('  class A {\r\n x;  \r\n}  ')).toBe(sha256('class A {\n x;\n}'));
    expect(sha256('class A {\n  x;\n}')).not.toBe(sha256('class A {\n x;\n}'));
  });
  it('checks expected Apex, active Flow version and exact metadata ordering', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const expected = {
      apex: { A: 'hash' },
      flows: { F: { activeVersionId: 'flow-1', versionNumber: 1 } },
      slaMetadata: [{ a: 1, b: 2 }],
    };
    expect(compareProductionFingerprint(expected, expected)).toEqual({
      publishable: true,
      changes: [],
      checkedAt: NOW,
    });
    expect(compareProductionFingerprint(expected, {}).changes).toEqual([
      { type: 'Apex', name: 'A', expected: 'hash', actual: 'Missing' },
      { type: 'Flow', name: 'F', expected: 'flow-1 v1', actual: 'Missing' },
      {
        type: 'Custom Metadata',
        name: 'Intake_SLA__mdt',
        expected: [{ a: 1, b: 2 }],
        actual: undefined,
      },
    ]);
    const actual = {
      apex: { A: 'changed', Extra: 'ignored' },
      flows: { F: { activeVersionId: 'flow-2', versionNumber: 2 } },
      slaMetadata: [{ b: 2, a: 1 }],
      checkedAt: '2026-09-10',
    };
    expect(compareProductionFingerprint(expected, actual)).toMatchObject({
      publishable: false,
      checkedAt: '2026-09-10',
      changes: [
        { type: 'Apex', actual: 'changed' },
        { type: 'Flow', actual: 'flow-2 v2' },
        { type: 'Custom Metadata' },
      ],
    });
    expect(
      compareProductionFingerprint(expected, {
        ...expected,
        flows: { F: { activeVersionId: 'flow-1', versionNumber: 2 } },
      }).publishable
    ).toBe(false);
  });
});
