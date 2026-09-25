import { describe, expect, it } from 'vitest';

import { isSupportingOnlyEvidence } from './contracts.js';
import { coreEvidenceEvents } from './evidence-assembly.js';
import { createEvidenceEvent, type EvidenceInput } from './evidence.js';
import { buildFactPacket } from './fact-packet.js';
import { resolveGate } from './gate-engine.js';
import type {
  FactPacketInput,
  RecommendationEvent,
  RecommendationGate,
} from './recommendation-types.js';
import { createSourceResult } from './source-result.js';

const asOf = '2026-09-24T12:00:00Z';
const opportunity = {
  id: 'synthetic',
  name: 'Synthetic Example',
  stage: 'IA Scheduled',
  csm: 'Synthetic CSM',
  provider: 'Synthetic Provider',
  slaCreatedDate: '2026-09-20',
  stageEntryDate: '2026-09-20',
};
const assessment: RecommendationGate = {
  gateCategory: 'intakeScheduling',
  processPosition: 'Initial assessment',
  unresolvedGate: 'Confirm initial assessment completion',
  owner: 'CSM',
  readyToCopy: 'Yes',
};
function event(
  extra: Partial<RecommendationEvent> & Partial<EvidenceInput> = {}
): RecommendationEvent {
  return createEvidenceEvent({
    opportunityId: opportunity.id,
    source: 'Task',
    sourceRecordId: 'synthetic-task',
    eventDate: '2026-09-23',
    category: 'intakeScheduling',
    text: 'Initial assessment is scheduled for2026-09-25.',
    factType: 'ia-scheduled',
    substantive: true,
    matchQuality: 'Direct',
    relationship: 'Supports',
    processRelevance: 9,
    collectionDate: asOf,
    ...extra,
  });
}
function packet(
  events: readonly RecommendationEvent[],
  overrides: Partial<FactPacketInput> = {}
): ReturnType<typeof buildFactPacket> {
  return buildFactPacket({
    opportunity,
    gate: assessment,
    evidenceEvents: events,
    sourceResults: [],
    asOf,
    ...overrides,
  });
}

describe('approved fact-packet assembly', () => {
  it('composes actual assembled evidence, gate and source-result producers with exact nullable metadata', () => {
    const provenance = { run: 'synthetic', mode: 'codex-current-run' };
    const evidence = coreEvidenceEvents([
      {
        opportunityId: opportunity.id,
        source: 'Fireflies',
        sourceRecordId: 'synthetic-packet',
        eventDate: '2026-09-23',
        category: 'rbt',
        fact: 'Synthetic RBT is assigned.',
        factType: 'rbt-assigned',
        substantive: true,
        matchQuality: 'Direct',
        relationship: 'Supports',
        candidateActive: null,
        milestoneKind: null,
        interpretationProvenance: provenance,
        rawText: 'Private synthetic raw conversation text is not a report fact.',
      },
    ]);
    const gate = resolveGate({ stage: 'IA Scheduled', opportunity: {}, authorizations: [], asOf });
    if (gate.excluded) throw new Error('Synthetic gate unexpectedly excluded');
    const result = buildFactPacket({
      opportunity,
      gate,
      evidenceEvents: evidence,
      sourceResults: [
        createSourceResult({
          source: 'Fireflies',
          searchStatus: 'Found',
          events: evidence,
          collectedAt: asOf,
        }),
      ],
      asOf,
    });
    expect(result.approvedFacts[0]?.interpretationProvenance).toBe(provenance);
    expect(result.approvedFacts[0]?.milestoneKind).toBeNull();
    expect(result.approvedFacts[0]?.candidateActive).toBeNull();
    expect(result.approvedFacts[0]).not.toHaveProperty('rawText');
    expect(evidence[0]?.rawText).toContain('Private synthetic');
    expect(result.sourceCoverage.found).toEqual(['Fireflies']);
  });
  it('retains own undefined supporting metadata without inventing a supporting classification', () => {
    const input = { ...event(), supportingOnly: undefined };
    expect(isSupportingOnlyEvidence(input)).toBe(false);
    expect(packet([input]).approvedFacts[0]).toHaveProperty('supportingOnly', undefined);
    expect(packet([input]).newestUpdate?.sourceRecordId).toBe(input.sourceRecordId);
  });
  it('preserves frozen narrative admission, audit facts, complete context and input immutability', () => {
    const current = event();
    const future = event({
      eventDate: '2026-09-25',
      text: 'Future update, unavailable at cutoff.',
      sourceRecordId: 'future',
    });
    const evidence = [
      current,
      future,
      event({ text: 'Weak match.', sourceRecordId: 'weak', matchQuality: 'Weak' }),
    ];
    const original = structuredClone(evidence);
    const result = packet(evidence);
    expect(result.newestUpdate?.sourceRecordId).toBe(current.sourceRecordId);
    expect(result.delayHistory.entries.map((entry) => entry.fact)).not.toContain(future.text);
    expect(
      result.approvedFacts.find((item) => item.sourceRecordId === 'future')?.contribution
    ).toBe('Audit Only');
    expect(result.approvedFacts.find((item) => item.sourceRecordId === 'weak')).toBeUndefined();
    expect(evidence).toEqual(original);
  });
  it('keeps VOB in coverage but not later-stage narrative and separates supporting evidence', () => {
    const vob = event({
      source: 'VOB',
      sourceRecordId: 'vob',
      text: 'Coverage verification update.',
    });
    const supporting = event({
      source: 'Salesforce Emails',
      sourceRecordId: 'email',
      text: 'Supporting scheduling message.',
      supportingOnly: true,
    });
    const result = packet([event(), vob, supporting], {
      sourceResults: [
        { source: 'VOB', status: 'Found' },
        { source: 'Salesforce Emails', status: 'Found' },
      ],
    });
    expect(result.evidenceTimeline.some((item) => item.source === 'VOB')).toBe(false);
    expect(result.sourceCoverage.found).toContain('VOB');
    expect(result.supportingContext[0]?.source).toBe('Salesforce Emails');
    expect(
      result.approvedFacts.find((item) => item.source === 'Salesforce Emails')?.contribution
    ).toBe('Supporting');
    expect(result.sourceCoverage.checkedCount).toBe(2);
  });
  it('retains original material-failure, supplementary-failure and stale readiness precedence', () => {
    const primary = [{ source: 'Salesforce Opportunity / SLA', status: 'Blocked' }];
    expect(packet([event()], { sourceResults: primary }).readyToCopy).toBe('Blocked');
    expect(
      packet([event()], { sourceResults: [{ source: 'Slack', status: 'Timed Out' }] }).readyToCopy
    ).toBe('Review');
    expect(
      packet([event({ eventDate: '2026-09-20' })], { sourceResults: primary }).readyToCopy
    ).toBe('Review');
    expect(packet([], { sourceResults: primary }).readyToCopy).toBe('Review');
    expect(packet([]).gaps[0]).toBe(
      'No dated substantive evidence was found for the current gate.'
    );
  });
  it('groups assumed-identity evidence by source and retains both specific missing-information explanations', () => {
    const inputs = [
      event({
        source: 'Fireflies',
        assumedIdentityMatch: true,
        matchedAs: 'Synthetic variant',
        specificityMissing: true,
        factType: 'auth-pending',
        text: 'Insurance approval remains pending.',
      }),
      event({
        source: 'Fireflies',
        sourceRecordId: 'second',
        assumedIdentityMatch: true,
        matchedAs: 'Another variant',
        specificityMissing: true,
        factType: 'required-document',
        text: 'An unspecified required document remains missing.',
      }),
    ];
    const result = packet(inputs);
    expect(result.identityMatchReview).toHaveLength(1);
    expect(result.identityMatchReview[0]?.sourceRecordIds).toEqual(
      expect.arrayContaining(['synthetic-task', 'second'])
    );
    expect(result.identityMatchReview[0]?.matchedAs).toEqual(
      expect.arrayContaining(['Synthetic variant', 'Another variant'])
    );
    expect(result.readyToCopy).toBe('Review');
    expect(result.gaps.join(' ')).toContain('Verify the client identity');
  });
  it('keeps confirmed staffing above a newer proposed candidate and preserves a scheduled start date', () => {
    const assigned = event({
      source: 'RBT Request',
      category: 'rbt',
      text: 'Synthetic RBT is assigned.',
      factType: 'rbt-assigned',
      candidateName: 'Synthetic RBT',
      milestoneDate: '2026-09-28',
    });
    const proposed = event({
      source: 'Ticket Match',
      sourceRecordId: 'proposed',
      eventDate: '2026-09-24',
      category: 'rbt',
      text: 'Another candidate is proposed.',
      factType: 'rbt-candidate',
      candidateName: 'Another RBT',
      candidateActive: true,
    });
    const result = packet([assigned, proposed], {
      opportunity: { ...opportunity, stage: 'TA Approved - Pending Scheduling' },
      gate: {
        gateCategory: 'rbt',
        processPosition: 'RBT staffing',
        unresolvedGate: 'Confirm staffing',
        owner: 'CSM',
      },
    });
    expect(result.structuredGateDetail?.source).toBe('RBT Request');
    expect(result.newestUpdate?.candidateName).toBe('Synthetic RBT');
    expect(result.action).toMatchObject({ type: 'Monitor', date: '2026-09-28', basis: 'Explicit' });
    expect(result.action.text).toContain('first 97153');
  });
  it('combines same-day required assessments without claiming completed IA evidence resolves them', () => {
    const result = packet([
      event({
        source: 'Fireflies',
        text: 'Provider reports the IA completed.',
        factType: 'ia-completed',
      }),
      event({
        sourceRecordId: 'basc',
        text: 'BASC remains outstanding.',
        factType: 'required-document',
        requestedInformation: 'the BASC assessment',
      }),
      event({
        sourceRecordId: 'vineland',
        text: 'Vineland remains outstanding.',
        factType: 'required-document',
        requestedInformation: 'the Vineland assessment',
      }),
    ]);
    expect(result.iaCompletionDocumentationConflict?.requiredItem).toBe(
      'the Vineland assessment and the BASC assessment'
    );
    expect(result.action.type).toBe('Salesforce Update');
    expect(result.action.text).toContain(
      'whether the Vineland assessment and the BASC assessment are still outstanding'
    );
    expect(result.readyToCopy).toBe('Review');
  });
  it('preserves same-day corrected-package action and overlap remediation precedence', () => {
    const gate: RecommendationGate = {
      gateCategory: 'insurance',
      processPosition: 'Treatment authorization',
      unresolvedGate: 'Confirm payer determination',
      owner: 'Insurance Ops',
    };
    const denied = event({
      source: 'Authorization',
      category: 'insurance',
      text: 'TA denied for overlapping authorization.',
      factType: 'auth-denial-reason',
      denialReason: 'overlapping authorization',
      recommendedAction: 'Insurance Ops to confirm determination.',
      actionType: 'Insurance Follow-Up',
    });
    const remediation = event({
      category: 'insurance',
      sourceRecordId: 'remediation',
      text: 'Prior-provider termination proof remains pending.',
      factType: 'auth-overlap-remediation',
      recommendedAction: 'Intake to confirm prior-provider termination.',
      actionOwner: 'Intake',
      actionType: 'Family Outreach',
    });
    const result = packet([denied, remediation], {
      opportunity: { ...opportunity, stage: 'TA Requested' },
      gate,
    });
    expect(result.action.type).toBe('Family Outreach');
    expect(result.action.text).toContain('prior-provider termination');
  });
});
