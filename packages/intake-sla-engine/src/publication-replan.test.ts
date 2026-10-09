import { describe, expect, expectTypeOf, it } from 'vitest';

import { publicationPlanHash } from './publication-plan.js';
import {
  remainingPublicationCalls,
  retainCapacityOnlyReadback,
  retainRejectedCellReadback,
} from './publication-replan.js';

interface TestStage {
  id: string;
  payloadHash: string;
  assertions: { id: string; expectedHash: string }[];
}
interface TestCall {
  file: string;
  payloadHash: string;
}
interface TestCallStage extends TestStage {
  calls: TestCall[];
}
interface TestPlan<T extends TestStage> {
  runId: string;
  spreadsheetId: string;
  finalAssertions: [];
  stages: T[];
  planHash: string;
}
interface TestObservations {
  runId: string;
  spreadsheetId: string;
  planHash: string;
  extra: { retained: boolean };
  stages: {
    id: string;
    payloadHash: string;
    captureVersion: number;
    evidenceHash: string;
    verifiedAt: string;
    assertions: { id: string; actualHash: string }[];
  }[];
}
interface TestRejection {
  priorPlanHash: string;
  stageId: string;
  callIndex: number;
  response: { isError: boolean; content: { type: string; text: string }[] };
}
interface TestCellRejection extends Omit<TestRejection, 'response'> {
  appliedCalls: (TestCall & {
    response: { isError: boolean; structuredContent: { spreadsheetId: string } };
  })[];
  response: { isError: boolean; structuredContent: { error_code: string; error: string } };
}
interface TestFixture<T extends TestStage, Rejection> {
  previous: TestPlan<T>;
  next: TestPlan<T>;
  observations: TestObservations;
  rejection: Rejection;
}
interface TestCellFixture extends TestFixture<TestCallStage, TestCellRejection> {
  evidenceStage: TestCallStage;
}
function capacityFixture(): TestFixture<TestStage, TestRejection> {
  const stages = [
    {
      id: '01-capacity',
      payloadHash: 'capacity',
      assertions: [{ id: 'grid', expectedHash: 'grid-hash' }],
    },
    { id: '02-review-queue', payloadHash: 'large', assertions: [] },
  ];
  const previous: TestPlan<TestStage> = {
    runId: 'synthetic-run',
    spreadsheetId: 'synthetic-sheet',
    finalAssertions: [],
    stages,
    planHash: publicationPlanHash(stages, []),
  };
  const next = structuredClone(previous);
  next.stages.splice(1, 1, { id: '02-review-queue', payloadHash: 'repartitioned', assertions: [] });
  next.planHash = publicationPlanHash(next.stages, []);
  const observations = {
    runId: previous.runId,
    spreadsheetId: previous.spreadsheetId,
    planHash: previous.planHash,
    extra: { retained: true },
    stages: [
      {
        id: '01-capacity',
        payloadHash: 'capacity',
        captureVersion: 1,
        evidenceHash: 'a'.repeat(64),
        verifiedAt: '2026-09-14T23:00:00Z',
        assertions: [{ id: 'grid', actualHash: 'grid-hash' }],
      },
    ],
  };
  const rejection = {
    priorPlanHash: previous.planHash,
    stageId: '02-review-queue',
    callIndex: 0,
    response: {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Automatic approval review failed: Guardian action exceeds the 200000-byte review limit',
        },
      ],
    },
  };
  return { previous, next, observations, rejection };
}
function cellFixture(): TestCellFixture {
  const capacity = capacityFixture();
  const first = capacity.previous.stages[0];
  if (first === undefined) throw new Error('Missing synthetic capacity stage');
  const previous = {
    ...capacity.previous,
    stages: [
      { ...first, calls: [] },
      {
        id: '04-evidence-detail',
        payloadHash: 'large',
        assertions: [],
        calls: [
          { file: 'call-1.json', payloadHash: 'first' },
          { file: 'call-2.json', payloadHash: 'oversized' },
        ],
      },
    ],
  };
  previous.planHash = publicationPlanHash(previous.stages, previous.finalAssertions);
  const next = structuredClone(previous);
  const evidenceStage = next.stages[1];
  if (evidenceStage === undefined) throw new Error('Missing synthetic evidence stage');
  evidenceStage.calls.splice(1, 1, { file: 'call-2.json', payloadHash: 'compact' });
  next.planHash = publicationPlanHash(next.stages, next.finalAssertions);
  const observations = { ...capacity.observations, planHash: previous.planHash };
  const rejection = {
    priorPlanHash: previous.planHash,
    stageId: '04-evidence-detail',
    callIndex: 1,
    appliedCalls: [
      {
        file: 'call-1.json',
        payloadHash: 'first',
        response: { isError: false, structuredContent: { spreadsheetId: previous.spreadsheetId } },
      },
    ],
    response: {
      isError: true,
      structuredContent: {
        error_code: 'INVALID_ARGUMENT',
        error:
          'Invalid requests[0].updateCells: Your input contains more than the maximum of 50000 characters in a single cell.',
      },
    },
  };
  return { previous, next, observations, rejection, evidenceStage };
}
describe('exact rejected-write publication replan', () => {
  it('retains only the unchanged verified capacity and raw rejection binding', () => {
    const v = capacityFixture();
    const before = structuredClone(v);
    const result = retainCapacityOnlyReadback(v.previous, v.next, v.observations, v.rejection);
    expect(result.stages).toBe(v.observations.stages);
    expect(result.extra).toBe(v.observations.extra);
    expect(result.planHash).toBe(v.next.planHash);
    expect(result.capacityReplan.priorPlanHash).toBe(v.previous.planHash);
    expect(result.capacityReplan.capacityEvidenceHash).toBe('a'.repeat(64));
    expect(v).toEqual(before);
  });
  it('rejects target changes, unverified capacity, content writes and uncertain outcomes', () => {
    const mutations: ((v: ReturnType<typeof capacityFixture>) => void)[] = [
      (v): void => {
        v.next.runId = 'wrong';
      },
      (v): void => {
        v.next.spreadsheetId = 'wrong';
      },
      (v): void => {
        v.next.stages[0] = { id: '01-capacity', payloadHash: 'changed', assertions: [] };
      },
      (v): void => {
        v.observations.stages.push({
          id: '02-review-queue',
          payloadHash: 'large',
          captureVersion: 1,
          evidenceHash: 'a'.repeat(64),
          verifiedAt: 'now',
          assertions: [],
        });
      },
      (v): void => {
        v.observations.stages.splice(0);
      },
      (v): void => {
        v.observations.stages[0]?.assertions.splice(0, 1, { id: 'grid', actualHash: 'wrong' });
      },
      (v): void => {
        v.rejection.priorPlanHash = 'wrong';
      },
      (v): void => {
        v.rejection.stageId = '03-on-hold-review';
      },
      (v): void => {
        v.rejection.callIndex = 1;
      },
      (v): void => {
        v.rejection.response.isError = false;
      },
      (v): void => {
        v.rejection.response.content.splice(0, 1, { type: 'text', text: 'Transport timeout' });
      },
      (v): void => {
        v.rejection.response.content.splice(0, 1, { type: 'image', text: 'Guardian' });
      },
    ];
    for (const mutate of mutations) {
      const v = capacityFixture();
      mutate(v);
      v.next.planHash = publicationPlanHash(v.next.stages, []);
      expect(() =>
        retainCapacityOnlyReadback(v.previous, v.next, v.observations, v.rejection)
      ).toThrow();
    }
    const v = capacityFixture();
    expect(() => retainCapacityOnlyReadback(v.previous, v.next, v.observations, null)).toThrow(
      'Capacity-only'
    );
    expect(() =>
      retainCapacityOnlyReadback(v.previous, v.next, v.observations, {
        ...v.rejection,
        response: { isError: true },
      })
    ).toThrow('Capacity-only');
    expect(() =>
      retainCapacityOnlyReadback(
        v.previous,
        v.next,
        { ...v.observations, stages: null },
        v.rejection
      )
    ).toThrow(TypeError);
  });
  it('skips only exact acknowledged calls and retains concrete caller types', () => {
    const v = cellFixture();
    const before = structuredClone(v);
    const result = retainRejectedCellReadback(v.previous, v.next, v.observations, v.rejection);
    expect(result.observations.stages).toBe(v.observations.stages);
    expect(result.observations.extra).toBe(v.observations.extra);
    expect(result.resume.stageId).toBe('04-evidence-detail');
    const remaining = remainingPublicationCalls(v.next, v.evidenceStage, result.resume);
    expectTypeOf(remaining).toEqualTypeOf<readonly { file: string; payloadHash: string }[]>();
    expect(remaining).toEqual(v.evidenceStage.calls.slice(1));
    expect(remainingPublicationCalls(v.next, v.evidenceStage, null)).toBe(v.evidenceStage.calls);
    expect(remainingPublicationCalls(v.next, v.evidenceStage, { stageId: 'different' })).toBe(
      v.evidenceStage.calls
    );
    expect(v).toEqual(before);
  });
  it('never changes completed content or infers a failed or uncertain prefix succeeded', () => {
    const mutations: ((v: ReturnType<typeof cellFixture>) => void)[] = [
      (v): void => {
        v.next.runId = 'wrong';
      },
      (v): void => {
        v.next.stages[0] = { id: '01-capacity', payloadHash: 'changed', assertions: [], calls: [] };
      },
      (v): void => {
        v.evidenceStage.calls[0] = { file: 'call-1.json', payloadHash: 'changed' };
      },
      (v): void => {
        v.rejection.appliedCalls[0] = {
          file: 'call-1.json',
          payloadHash: 'first',
          response: {
            isError: true,
            structuredContent: { spreadsheetId: v.previous.spreadsheetId },
          },
        };
      },
      (v): void => {
        v.rejection.appliedCalls[0] = {
          file: 'call-1.json',
          payloadHash: 'first',
          response: {
            isError: false,
            structuredContent: { spreadsheetId: 'wrong' },
          },
        };
      },
      (v): void => {
        v.rejection.appliedCalls.splice(0);
      },
      (v): void => {
        v.rejection.callIndex = -1;
      },
      (v): void => {
        v.rejection.callIndex = 2;
      },
      (v): void => {
        v.rejection.response.structuredContent.error_code = 'TIMEOUT';
      },
      (v): void => {
        v.rejection.response.structuredContent.error = 'Unknown write result';
      },
      (v): void => {
        v.rejection.stageId = '09-run-history';
      },
      (v): void => {
        v.next.stages.splice(1);
      },
    ];
    for (const mutate of mutations) {
      const v = cellFixture();
      mutate(v);
      v.next.planHash = publicationPlanHash(v.next.stages, []);
      expect(() =>
        retainRejectedCellReadback(v.previous, v.next, v.observations, v.rejection)
      ).toThrow();
    }
    const v = cellFixture();
    expect(() => retainRejectedCellReadback(v.previous, v.next, v.observations, undefined)).toThrow(
      'Rejected-cell'
    );
    expect(() =>
      retainRejectedCellReadback(v.previous, v.next, v.observations, {
        ...v.rejection,
        appliedCalls: null,
      })
    ).toThrow('Rejected-cell');
  });
  it('binds resume identity, rejection and every acknowledged prefix field', () => {
    const v = cellFixture();
    const { resume } = retainRejectedCellReadback(v.previous, v.next, v.observations, v.rejection);
    for (const patch of [
      { runId: 'wrong' },
      { spreadsheetId: 'wrong' },
      { planHash: 'wrong' },
      { rejectionHash: '' },
      { rejectionHash: null },
      { appliedCalls: null },
      { appliedCalls: [{ file: 'call-1.json', payloadHash: 'wrong' }] },
      { appliedCalls: [{ file: 'call-1.json', payloadHash: 'first', extra: true }] },
    ])
      expect(() =>
        remainingPublicationCalls(v.next, v.evidenceStage, { ...resume, ...patch })
      ).toThrow('prefix differs');
  });
});
