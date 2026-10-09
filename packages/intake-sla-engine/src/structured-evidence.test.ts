import { afterEach, expect, it, vi } from 'vitest';

import { structuredEvidenceEvent } from './structured-evidence.js';

afterEach(() => {
  vi.useRealTimers();
});
const base = {
  opportunityId: 'synthetic',
  source: 'Synthetic source',
  sourceRecordId: 'synthetic:1',
  eventDate: '2026-01-01',
  category: 'synthetic-category',
  text: 'Synthetic evidence.',
};
it('preserves structured source defaults and explicit falsy/null overrides', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
  const result = structuredEvidenceEvent(base);
  expect(result).toEqual({
    ...base,
    collectionDate: '2026-01-02T00:00:00.000Z',
    matchedIdentities: [],
    processRelevance: 9,
    matchQuality: 'Direct',
    substantive: true,
    relationship: 'Supports',
    rawText: null,
    issueKey: null,
    lifecycleState: null,
    resolvedByEventId: null,
    resolutionDate: null,
    narrativeContribution: 'Audit Only',
    gateImpact: undefined,
    actionOwner: undefined,
    actionType: undefined,
    recommendedAction: undefined,
    milestoneDate: null,
    followUpDate: null,
    factType: null,
    requestedInformation: null,
    specificityMissing: false,
    candidateStep: null,
    candidateName: null,
    candidateActive: null,
  });
  const changes = {
    gateImpact: '',
    actionOwner: null,
    actionType: 'Monitor',
    recommendedAction: 'Keep monitoring.',
    processRelevance: 0,
    milestoneDate: '2026-01-03',
    followUpDate: '2026-01-05',
    rawText: '',
    factType: 'synthetic-fact',
    requestedInformation: 'Synthetic requested item',
    specificityMissing: true,
    candidateStep: 'synthetic-step',
    candidateName: '',
    candidateActive: false,
    issueKey: 'synthetic-issue',
  };
  expect(structuredEvidenceEvent({ ...base, ...changes })).toEqual({ ...result, ...changes });
  for (const key of ['opportunityId', 'source', 'sourceRecordId', 'eventDate', 'category', 'text'])
    expect(() => structuredEvidenceEvent({ ...base, [key]: '' })).toThrow(
      `EvidenceEvent missing ${key}`
    );
});
