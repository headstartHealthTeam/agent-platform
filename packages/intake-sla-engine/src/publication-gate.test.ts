import { describe, expect, it } from 'vitest';

import {
  assertPublicationGateFreshness,
  DEFAULT_PUBLICATION_MAX_AGE_MS,
} from './publication-freshness.js';
import type { PublicationGateInputs } from './publication-gate-types.js';
import { evaluatePublicationGate } from './publication-gate.js';
import { publicationPlanHash } from './publication-plan.js';
import { publicationMarker, reviewerSnapshotHash } from './publication-state.js';

const NOW = '2026-01-02T12:00:00Z';
function fixture(): PublicationGateInputs {
  const marker = {
    capturedAt: NOW,
    values: [
      ['Last Refresh (ET)', 'prior'],
      ['Run ID', 'prior-run'],
    ],
  };
  const reviewer = {
    capturedAt: NOW,
    spreadsheetId: 'synthetic-sheet',
    rows: [
      {
        opportunityId: 'synthetic-opportunity',
        needsCsmReview: false,
        reviewerNotes: '',
        copiedToSalesforce: 'No',
        reviewedBy: 'Reviewer',
        reviewedAt: '2026-01-01',
      },
    ],
  };
  const stages = [{ id: '08-terminal-marker' }, { id: '09-run-history' }];
  const finalAssertions = [{ id: 'final:synthetic', expectedHash: 'final' }];
  return {
    now: NOW,
    expectedSpreadsheetId: 'synthetic-sheet',
    runManifest: { runId: 'current-run', expectedRows: 1, processedRows: 1 },
    qualityAudit: { passed: true, auditedAt: NOW },
    workbookVerification: { passed: true, verifiedAt: NOW },
    productionDrift: { result: { publishable: true, checkedAt: NOW } },
    metadata: { spreadsheetId: 'synthetic-sheet', capturedAt: NOW },
    publicationState: { spreadsheetId: 'synthetic-sheet', capturedAt: NOW },
    baselineMarker: marker,
    currentMarker: structuredClone(marker),
    baselineReviewerState: reviewer,
    currentReviewerState: structuredClone(reviewer),
    cohortRefresh: {
      queriedAt: NOW,
      organizationId: 'synthetic-org',
      isSandbox: false,
      material: false,
      liveCount: 1,
    },
    competingRunState: { checkedAt: NOW, conflict: false, currentRunId: 'current-run' },
    publicationPlan: {
      runId: 'current-run',
      spreadsheetId: 'synthetic-sheet',
      planHash: publicationPlanHash(stages, finalAssertions),
      runHistoryLast: true,
      finalAssertions,
      stages,
    },
  };
}
function postCutoff(): PublicationGateInputs {
  const value = fixture();
  return {
    ...value,
    runManifest: { ...value.runManifest, startedAt: '2026-01-02T10:00:00Z' },
    cohortRefresh: {
      ...value.cohortRefresh,
      material: true,
      liveCount: 0,
      changes: {
        removed: ['synthetic-opportunity'],
        stage: [{ id: 'synthetic-opportunity' }],
        added: [],
      },
      postCutoffDisposition: {
        schemaVersion: 1,
        disposition: 'defer-to-next-run',
        runCutoff: '2026-01-02T10:00:00Z',
        salesforceReadOnly: true,
        nextRunRequired: true,
        records: [
          { opportunityId: 'synthetic-opportunity', observedModifiedAt: '2026-01-02T10:01:00Z' },
        ],
      },
    },
  };
}
describe('publication gate parity', () => {
  it('preserves the two-hour write lease, including exact boundary and invalid/future timestamps', () => {
    const now = Date.parse(NOW);
    for (const age of [0, DEFAULT_PUBLICATION_MAX_AGE_MS])
      expect(
        assertPublicationGateFreshness({ evaluatedAt: new Date(now - age).toISOString() }, now)
      ).toBe(true);
    for (const age of [-1, DEFAULT_PUBLICATION_MAX_AGE_MS + 1])
      expect(() =>
        assertPublicationGateFreshness({ evaluatedAt: new Date(now - age).toISOString() }, now)
      ).toThrow('refresh all required checks');
    for (const gate of [undefined, null, {}, { evaluatedAt: 'invalid' }])
      expect(() => assertPublicationGateFreshness(gate, now)).toThrow('valid timestamp');
    expect(assertPublicationGateFreshness({ evaluatedAt: new Date().toISOString() })).toBe(true);
  });
  it('accepts stable state and records the original ordered gate checks', () => {
    const result = evaluatePublicationGate(fixture());
    expect(result).toMatchObject({
      schemaVersion: 1,
      passed: true,
      runId: 'current-run',
      cohortDisposition: {
        mode: 'stable-live-cohort',
        sourceCutoff: undefined,
        liveCount: 1,
        deferredChangeCount: 0,
      },
    });
    expect(result.checks).toEqual([
      'row-parity',
      'quality-audit',
      'workbook-verification',
      'production-fingerprint',
      'quality audit-fresh',
      'workbook verification-fresh',
      'production fingerprint-fresh',
      'google metadata-fresh',
      'google publication state-fresh',
      'current sheet marker-fresh',
      'current reviewer state-fresh',
      'salesforce cohort refresh-fresh',
      'competing-run check-fresh',
      'spreadsheet:configured spreadsheet',
      'spreadsheet:metadata spreadsheet',
      'spreadsheet:publication-state spreadsheet',
      'spreadsheet:baseline reviewer spreadsheet',
      'spreadsheet:current reviewer spreadsheet',
      'spreadsheet:publication plan spreadsheet',
      'live-marker-present',
      'live-marker-unchanged',
      'reviewer-state-unchanged',
      'cohort-production',
      'cohort-count',
      'no-competing-run',
      'competing-run-target',
      'plan-run',
      'final-state-contract',
      'final-state-identities',
      'plan-hash',
      'run-history-last',
      'terminal-marker-order',
    ]);
  });
  it('requires the unchanged-file proof to bind all four current Google states', () => {
    const base = fixture();
    const fresh = {
      capturedAt: '2026-01-02T09:00:00Z',
      revalidatedAt: NOW,
      revalidationHash: 'a'.repeat(64),
    };
    const input = {
      ...base,
      metadata: { ...base.metadata, ...fresh, captureHash: 'b'.repeat(64) },
      publicationState: { ...base.publicationState, ...fresh },
      currentMarker: { ...base.currentMarker, ...fresh },
      currentReviewerState: { ...base.currentReviewerState, ...fresh },
    };
    expect(evaluatePublicationGate(input).passed).toBe(true);
    expect(() =>
      evaluatePublicationGate({ ...input, metadata: { ...input.metadata, captureHash: undefined } })
    ).toThrow('one verified capture');
    expect(() =>
      evaluatePublicationGate({
        ...input,
        currentMarker: { ...input.currentMarker, revalidationHash: undefined },
      })
    ).toThrow('one verified capture');
    expect(() =>
      evaluatePublicationGate({
        ...input,
        currentReviewerState: {
          ...input.currentReviewerState,
          revalidatedAt: '2026-01-02T11:00:00Z',
        },
      })
    ).toThrow('one verified capture');
  });
  it('rejects each existing failure without adding a new report restriction', () => {
    const base = fixture();
    const cases: [Partial<PublicationGateInputs>, string][] = [
      [{ runManifest: { ...base.runManifest, processedRows: 0 } }, 'row counts differ'],
      [{ qualityAudit: { passed: false } }, 'Quality audit blocks'],
      [{ workbookVerification: { passed: false } }, 'Workbook verification blocks'],
      [{ productionDrift: {} }, 'Production automation drift'],
      [
        { metadata: { ...base.metadata, capturedAt: '2026-01-02T09:00:00Z' } },
        'older than two hours',
      ],
      [{ metadata: { ...base.metadata, capturedAt: '2026-01-02T13:00:00Z' } }, 'future-dated'],
      [{ metadata: { ...base.metadata, capturedAt: null } }, 'no valid timestamp'],
      [{ now: 'bad' }, 'Publication gate time has no valid timestamp'],
      [{ metadata: { ...base.metadata, spreadsheetId: 'wrong' } }, 'metadata spreadsheet identity'],
      [{ currentMarker: {} }, 'Current Sheet marker has no valid timestamp'],
      [{ currentMarker: { capturedAt: NOW, values: [] } }, 'Live Sheet marker is incomplete'],
      [
        {
          currentMarker: {
            capturedAt: NOW,
            values: [
              ['Run ID', 'other'],
              ['Last Refresh (ET)', 'prior'],
            ],
          },
        },
        'live Sheet marker changed',
      ],
      [
        { currentReviewerState: { ...base.currentReviewerState, rows: [] } },
        'Reviewer-owned state changed',
      ],
      [{ cohortRefresh: { ...base.cohortRefresh, isSandbox: true } }, 'did not verify Production'],
      [{ cohortRefresh: { ...base.cohortRefresh, liveCount: 0 } }, 'cohort count differs'],
      [
        { cohortRefresh: { ...base.cohortRefresh, material: undefined } },
        'material-change state is invalid',
      ],
      [
        { cohortRefresh: { ...base.cohortRefresh, material: true } },
        'lacks a valid post-cutoff disposition',
      ],
      [
        { competingRunState: { ...base.competingRunState, conflict: true } },
        'competing Intake SLA',
      ],
      [
        { competingRunState: { ...base.competingRunState, currentRunId: 'different' } },
        'targets a different run',
      ],
      [
        { publicationPlan: { ...base.publicationPlan, runId: 'different' } },
        'plan targets a different run',
      ],
      [
        { publicationPlan: { ...base.publicationPlan, finalAssertions: undefined } },
        'no final-state assertion',
      ],
      [
        {
          publicationPlan: {
            ...base.publicationPlan,
            finalAssertions: [{ id: 'same' }, { id: 'same' }],
          },
        },
        'duplicate final-state',
      ],
      [
        { publicationPlan: { ...base.publicationPlan, planHash: 'bad' } },
        'plan hash is missing or invalid',
      ],
      [
        { publicationPlan: { ...base.publicationPlan, runHistoryLast: false } },
        'Run History must be the final',
      ],
    ];
    for (const [change, message] of cases)
      expect(() => evaluatePublicationGate({ ...base, ...change })).toThrow(message);
    const stages = [{ id: '08-terminal-marker' }, { id: 'middle' }, { id: '09-run-history' }];
    expect(() =>
      evaluatePublicationGate({
        ...base,
        publicationPlan: {
          ...base.publicationPlan,
          stages,
          planHash: publicationPlanHash(stages, base.publicationPlan.finalAssertions),
        },
      })
    ).toThrow('immediately precede');
  });
  it('preserves bounded frozen snapshots and requires complete post-cutoff disposition', () => {
    const base = postCutoff();
    expect(evaluatePublicationGate(base).cohortDisposition).toEqual({
      mode: 'frozen-snapshot-with-post-cutoff-delta',
      sourceCutoff: '2026-01-02T10:00:00Z',
      liveCount: 0,
      deferredChangeCount: 1,
    });
    const disposition = base.cohortRefresh.postCutoffDisposition;
    const cases = [
      [{ runCutoff: 'wrong' }, 'does not match the frozen'],
      [{ salesforceReadOnly: false }, 'verified read-only'],
      [{ records: [] }, 'every material record exactly once'],
      [
        {
          records: [
            { opportunityId: 'synthetic-opportunity', observedModifiedAt: '2026-01-02T10:00:00Z' },
          ],
        },
        'at or before',
      ],
      [
        { records: [{ opportunityId: 'synthetic-opportunity', observedModifiedAt: 'bad' }] },
        'has no valid timestamp',
      ],
      [{ nextRunRequired: false }, 'retained for the next run'],
    ] as const;
    for (const [change, message] of cases)
      expect(() =>
        evaluatePublicationGate({
          ...base,
          cohortRefresh: {
            ...base.cohortRefresh,
            postCutoffDisposition: { ...disposition, ...change },
          },
        })
      ).toThrow(message);
    expect(() =>
      evaluatePublicationGate({
        ...base,
        cohortRefresh: { ...base.cohortRefresh, changes: undefined },
      })
    ).toThrow('every material record');
  });
  it('preserves typed reviewer cells and own-property distinctions without mutation', () => {
    expect(publicationMarker()).toEqual({ runId: null, lastRefresh: null });
    expect(
      publicationMarker({
        values: [
          ['Run ID', 'first'],
          ['Run ID', 'second'],
        ],
      }).runId
    ).toBe('first');
    expect(reviewerSnapshotHash()).toBe(reviewerSnapshotHash({ rows: [] }));
    const rows = [
      { opportunityId: 'b', reviewerNotes: '  exact  ', needsCsmReview: false },
      { opportunityName: 'a', reviewedAt: 3 },
    ];
    const before = structuredClone(rows);
    expect(reviewerSnapshotHash({ rows })).toBe(
      reviewerSnapshotHash({ rows: [...rows].reverse() })
    );
    expect(rows).toEqual(before);
    expect(reviewerSnapshotHash({ rows: [{ opportunityId: 'a' }] })).not.toBe(
      reviewerSnapshotHash({ rows: [{ opportunityId: 'a', reviewerNotes: undefined }] })
    );
    expect(() => reviewerSnapshotHash({ rows: [{}] })).toThrow('missing or duplicate identity');
    expect(() =>
      reviewerSnapshotHash({ rows: [{ opportunityId: 'a' }, { opportunityId: 'a' }] })
    ).toThrow('missing or duplicate identity');
  });
  it('reads non-enumerable own reviewer values but never unrelated accessors', () => {
    const row = { opportunityId: 'synthetic' };
    Object.defineProperty(row, 'reviewerNotes', { value: 'exact non-enumerable value' });
    Object.defineProperty(row, 'unrelated', {
      enumerable: true,
      get: () => {
        throw new Error('must not read');
      },
    });
    expect(reviewerSnapshotHash({ rows: [row] })).toBe(
      reviewerSnapshotHash({
        rows: [
          {
            opportunityId: 'synthetic',
            reviewerNotes: 'exact non-enumerable value',
          },
        ],
      })
    );
  });
});
