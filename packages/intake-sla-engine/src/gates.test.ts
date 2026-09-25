import { afterEach, describe, expect, it, vi } from 'vitest';

import { STAGE_CONTRACT } from './contracts.js';
import { createEvidenceEvent } from './evidence.js';
import type { EvidenceEvent } from './evidence.js';
import { categoryForGate, isVobRelevantGate, refineGateWithEvidence } from './gate-context.js';
import { resolveGate } from './gate-engine.js';

const AS_OF = '2026-09-11T17:31:07.000Z';
const initial = {
  id: 'initial',
  type: 'Initial',
  status: 'Approved',
  initialApprovalDate: '2026-09-01',
};
const treatment = {
  id: 'treatment',
  type: 'Treatment',
  status: 'Approved',
  treatmentApprovalDate: '2026-09-01',
};
const context = {
  processPosition: 'Treatment plan drafting',
  unresolvedGate: 'Complete the treatment plan',
  owner: 'CSM',
  confidence: 'Medium',
};
const evidence = (extra: Partial<EvidenceEvent> = {}): EvidenceEvent =>
  createEvidenceEvent({
    opportunityId: 'synthetic-opportunity',
    source: 'Fireflies',
    sourceRecordId: 'synthetic-evidence',
    eventDate: '2026-09-10',
    category: 'treatmentPlan',
    text: 'Synthetic plan update.',
    substantive: true,
    matchQuality: 'Direct',
    relationship: 'Supports',
    processRelevance: 10,
    gateImpact: 'Obtain a signature',
    ...extra,
  });
afterEach(() => {
  vi.useRealTimers();
});

describe('stage contract and prerequisite composition', () => {
  it('preserves excluded and unknown stages without inventing a next stage', () => {
    expect(resolveGate({ stage: 'Pending Discharge' })).toEqual({
      excluded: true,
      stage: 'Pending Discharge',
      reason: 'Pending Discharge is excluded by policy.',
    });
    expect(resolveGate({ stage: 'Synthetic Unknown' })).toEqual({
      excluded: false,
      stage: 'Synthetic Unknown',
      processPosition: 'Unknown',
      unresolvedGate: 'Stage is not in the approved contract',
      confidence: 'Low',
      readyToCopy: 'Blocked',
      conflicts: ['Unknown stage'],
    });
  });

  it('evaluates Initial authorization before every assessment-occurrence stage', () => {
    for (const stage of [
      'IA Requested',
      'IA Approved - Pending Scheduling',
      'IC Scheduled - Pending Start',
      'IC Scheduled – Pending Start',
      'IC Completed - Pending Scheduling',
      'IC Completed – Pending Scheduling',
      'IA Scheduled',
    ]) {
      expect(resolveGate({ stage, asOf: AS_OF })).toMatchObject({
        processPosition: 'Initial authorization',
        readyToCopy: 'Yes',
        owner: 'Insurance Ops',
        authorization: { state: 'Missing' },
      });
    }
    const conflict = resolveGate({
      stage: 'IA Scheduled',
      asOf: AS_OF,
      authorizations: [initial, { ...initial, id: 'denied', status: 'Denied' }],
    });
    expect(conflict).toMatchObject({
      confidence: 'Low',
      readyToCopy: 'Review',
      authorization: { conflict: true },
    });
    if (conflict.excluded) throw new Error('Expected active gate');
    expect(conflict.conflicts).toHaveLength(1);
    expect(
      resolveGate({ stage: 'IA Scheduled', asOf: AS_OF, authorizations: [initial] })
    ).toMatchObject({ confidence: 'Low', occurrence: { evidenceQuality: 'Missing' } });
    expect(
      resolveGate({
        stage: 'IA Scheduled',
        asOf: AS_OF,
        authorizations: [initial],
        opportunity: { iaScheduledFor: '2026-09-15' },
      })
    ).toMatchObject({
      confidence: 'High',
      readyToCopy: 'Yes',
      occurrence: { followUpDate: '2026-09-15' },
      owner: 'CSM',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(AS_OF));
    expect(resolveGate({ stage: 'IA Scheduled', authorizations: [initial] })).toEqual(
      resolveGate({ stage: 'IA Scheduled', asOf: AS_OF, authorizations: [initial] })
    );
  });

  it('preserves Treatment prerequisites and each default stage position', () => {
    for (const stage of [
      'TA Requested',
      'TA Approved - Pending Scheduling',
      'First Day of 97153 Scheduled',
    ]) {
      expect(resolveGate({ stage, asOf: AS_OF })).toMatchObject({
        processPosition: 'Treatment authorization',
        owner: 'Insurance Ops',
        authorization: { state: 'Missing' },
      });
    }
    for (const stage of STAGE_CONTRACT.stages.filter(
      (item) =>
        ![
          'IA Approved - Pending Scheduling',
          'IC Scheduled - Pending Start',
          'IC Completed - Pending Scheduling',
          'IA Scheduled',
        ].includes(item.stage)
    )) {
      expect(
        resolveGate({ stage: stage.stage, asOf: AS_OF, authorizations: [initial, treatment] })
      ).toEqual({
        excluded: false,
        stage: stage.stage,
        processPosition: stage.position,
        unresolvedGate: stage.unresolvedGate,
        confidence: 'Medium',
        readyToCopy: 'Review',
        conflicts: [],
        owner: stage.defaultOwner,
      });
    }
  });
});

describe('context refines existing gates without replacing judgment', () => {
  it('preserves category precedence and VOB relevance', () => {
    expect(categoryForGate({ gateCategory: 'custom', unresolvedGate: 'insurance' })).toBe('custom');
    for (const [unresolvedGate, category] of [
      ['treatment plan and insurance', 'treatmentPlan'],
      ['staff coverage', 'rbt'],
      ['payer authorization', 'insurance'],
      ['initial assessment', 'intakeScheduling'],
      ['unclassified', 'other'],
    ] as const) {
      expect(categoryForGate({ unresolvedGate })).toBe(category);
    }
    expect(categoryForGate()).toBe('other');
    expect(categoryForGate({ processPosition: 'RBT coverage' })).toBe('rbt');
    expect(isVobRelevantGate()).toBe(false);
    expect(isVobRelevantGate({ processPosition: '  INSURANCE   VERIFICATION ' })).toBe(true);
    expect(isVobRelevantGate({ unresolvedGate: 'verify benefits' })).toBe(true);
    expect(isVobRelevantGate(context)).toBe(false);
  });

  it('leaves gates unchanged when evidence is weak, supporting-only, irrelevant or pre-stage', () => {
    const excluded = { ...context, excluded: true };
    expect(refineGateWithEvidence(excluded, [evidence()])).toBe(excluded);
    expect(
      refineGateWithEvidence(context, [
        evidence({ supportingOnly: true }),
        evidence({ category: 'rbt' }),
        evidence({ gateImpact: null }),
        evidence({ processRelevance: 6 }),
        evidence({ matchQuality: 'Weak' }),
      ])
    ).toBe(context);
    expect(refineGateWithEvidence(context, [evidence()], { stageEntryDate: '2026-09-11' })).toBe(
      context
    );
    expect(refineGateWithEvidence(context, [])).toBe(context);
  });

  it('uses newer non-authorization context while retaining the existing tie-break ordering', () => {
    const older = evidence({
      sourceRecordId: 'older',
      eventDate: '2026-09-01',
      processRelevance: 12,
      gateImpact: 'Old blocker',
    });
    const newest = evidence({
      sourceRecordId: 'newer',
      actionOwner: 'CSM',
      actionType: 'Provider Outreach',
      recommendedAction: 'Obtain signature',
      followUpDate: '2026-09-15',
    });
    expect(
      refineGateWithEvidence(context, [older, newest], { csm: 'Synthetic CSM' })
    ).toMatchObject({
      unresolvedGate: 'Obtain a signature',
      contextualEvidenceId: 'Fireflies:newer',
      owner: 'Synthetic CSM',
      recommendedAction: 'Obtain signature',
      recommendedActionType: 'Provider Outreach',
      recommendedFollowUpDate: '2026-09-15',
      confidence: 'High',
    });
    const similar = evidence({
      sourceRecordId: 'specific',
      factType: 'tp-signature-format',
      milestoneDate: '2026-09-16',
      actionOwner: 'Insurance Ops',
    });
    expect(refineGateWithEvidence(context, [newest, similar])).toMatchObject({
      contextualEvidenceId: 'Fireflies:specific',
      owner: 'Insurance Ops',
      recommendedFollowUpDate: '2026-09-16',
    });
    const later = evidence({
      sourceRecordId: 'later',
      eventDate: '2026-09-10T13:00:00Z',
      processRelevance: 7,
      matchQuality: 'Likely',
    });
    expect(
      refineGateWithEvidence(context, [
        evidence({ processRelevance: 7, matchQuality: 'Likely' }),
        later,
      ])
    ).toMatchObject({
      contextualEvidenceId: 'Fireflies:later',
      confidence: 'Medium',
      owner: 'CSM',
      recommendedAction: null,
      recommendedActionType: null,
      recommendedFollowUpDate: null,
    });
    expect(refineGateWithEvidence({}, [evidence({ category: 'other' })])).toMatchObject({
      owner: undefined,
      confidence: 'High',
    });
  });

  it('keeps an authorization prerequisite intact and prefers authoritative evidence over later chatter', () => {
    const gate = {
      processPosition: 'Initial authorization',
      unresolvedGate: 'Payer determination pending',
      owner: 'Insurance Ops',
      confidence: 'Medium',
    };
    const authoritative = evidence({
      source: 'Authorization',
      category: 'insurance',
      eventDate: '2026-09-01',
      gateImpact: 'Need payer documents',
    });
    const chatter = evidence({
      category: 'insurance',
      eventDate: '2026-09-11',
      gateImpact: 'Assessment planned',
    });
    expect(refineGateWithEvidence(gate, [chatter])).toBe(gate);
    expect(
      refineGateWithEvidence(gate, [authoritative, chatter], { stageEntryDate: '2026-09-10' })
    ).toMatchObject({
      unresolvedGate: 'Payer determination pending',
      contextualBlocker: 'Need payer documents',
      contextualEvidenceId: 'Authorization:synthetic-evidence',
    });
    expect(refineGateWithEvidence(gate, [{ ...chatter, actionOwner: 'Insurance Ops' }])).not.toBe(
      gate
    );
    expect(
      refineGateWithEvidence(gate, [{ ...chatter, actionType: 'Insurance Follow-Up' }])
    ).not.toBe(gate);
  });
});
