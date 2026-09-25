import { describe, expect, it } from 'vitest';

import { adaptBillingClaims } from './billing-evidence.js';
import { coreEvidenceEvents } from './evidence-assembly.js';
import { createEvidenceEvent, type EvidenceInput } from './evidence.js';
import type { StoryEvent, StoryFact, StoryGate, StoryInput } from './story-types.js';
import { buildSlaStory } from './storyline.js';

const asOf = '2026-09-24T12:00:00Z';
const opportunity = {
  stage: 'IA Scheduled',
  slaCreatedDate: '2026-09-20',
  stageEntryDate: '2026-09-20',
};
const assessment: StoryGate = {
  processPosition: 'Initial assessment',
  unresolvedGate: 'Confirm initial assessment completion',
};
const authorization: StoryGate = {
  processPosition: 'Treatment authorization',
  unresolvedGate: 'Receive current treatment authorization determination',
  gateCategory: 'insurance',
};
const staffing: StoryGate = {
  processPosition: 'RBT staffing',
  unresolvedGate: 'Confirm RBT staffing',
};

function event(
  id: string,
  text: string,
  extra: Partial<EvidenceInput> &
    Pick<
      StoryFact,
      | 'candidateActive'
      | 'candidateName'
      | 'lifecycleRecordId'
      | 'specificityMissing'
      | 'requestedInformation'
    > = {}
): StoryEvent {
  return createEvidenceEvent({
    opportunityId: 'synthetic-opportunity',
    source: 'Task',
    sourceRecordId: id,
    eventDate: '2026-09-22T12:00:00Z',
    category: 'intakeScheduling',
    text,
    collectionDate: asOf,
    substantive: true,
    matchQuality: 'Direct',
    relationship: 'Supports',
    processRelevance: 9,
    ...extra,
  });
}
function story(
  events: readonly StoryEvent[],
  overrides: Partial<StoryInput> = {}
): ReturnType<typeof buildSlaStory> {
  return buildSlaStory({ opportunity, gate: assessment, events, asOf, ...overrides });
}

describe('approved full story lifecycle', () => {
  it('accepts assembled evidence with null candidate state and retains interpretation provenance', () => {
    const provenance = { syntheticRun: 'current', packet: 'exact-bound' };
    const events = coreEvidenceEvents([
      {
        opportunityId: 'synthetic-opportunity',
        source: 'Fireflies',
        sourceRecordId: 'synthetic-packet',
        eventDate: '2026-09-22',
        category: 'rbt',
        fact: 'The provider hired an RBT.',
        substantive: true,
        matchQuality: 'Direct',
        relationship: 'Supports',
        factType: 'rbt-assigned',
        candidateActive: null,
        candidateName: 'Synthetic Worker',
        interpretationProvenance: provenance,
        milestoneKind: null,
        collectedAt: asOf,
      },
    ]);
    const result = buildSlaStory({ opportunity, gate: staffing, events, asOf });
    expect(result.timeline[0]?.candidateActive).toBeNull();
    expect(result.timeline[0]?.interpretationProvenance).toBe(provenance);
    expect(result.timeline[0]?.milestoneKind).toBeNull();
    expect(events[0]?.candidateActive).toBeNull();
  });
  it('excludes unsupported, placeholder, out-of-window and post-cutoff events without mutating input', () => {
    const events = [
      event('valid', 'Initial assessment scheduling remains open', { factType: 'ia-scheduled' }),
      event('future', 'Initial assessment completed', { eventDate: '2026-09-25' }),
      event('old', 'Initial assessment completed', { eventDate: '2026-01-01' }),
      event('neutral', 'Initial assessment completed', { relationship: 'Neutral' }),
      event('weak', 'Initial assessment completed', { matchQuality: 'Weak' }),
      event('support', 'Initial assessment completed', { supportingOnly: true }),
      event('placeholder', 'Stage-relevant operational update was recorded'),
    ];
    const before = structuredClone(events);
    const result = story(events);
    expect(result.timeline.map((item) => item.sourceRecordId)).toEqual(['valid']);
    expect(result.currentGateIssueKey).toBe('initial-assessment');
    expect(result.conflicts).toEqual([]);
    expect(events).toEqual(before);
  });
  it('retains Date and opaque producer metadata in an annotated copy', () => {
    const date = new Date('2026-09-22');
    const input = {
      ...event('date', 'Assessment scheduling pending', { eventDate: date }),
      opaqueProvenance: { synthetic: true },
      milestoneKind: null,
    };
    const result = buildSlaStory({ opportunity, gate: assessment, events: [input], asOf });
    expect(result.timeline[0]?.eventDate).toBe(date);
    expect(result.timeline[0]?.opaqueProvenance).toBe(input.opaqueProvenance);
    expect(result.timeline[0]?.milestoneKind).toBeNull();
    expect(result.timeline[0]).not.toBe(input);
  });
  it('accepts actual linked billing output without inferring whole-assessment completion', () => {
    const events = adaptBillingClaims({
      profile: { opportunityId: 'synthetic-opportunity' },
      asOf,
      opportunity: { StageName: 'IA Scheduled' },
      coverageComplete: true,
      records: [
        {
          Id: 'completed',
          Appointment_ID__c: 'one',
          Billing_Code__c: '97151',
          Service_Name__c: 'Assessment',
          CreatedDate: '2026-09-21',
          Appt_Date__c: '2026-09-22',
          Appointment_Status__c: 'Active',
          Completed__c: 'Yes',
          Completed_Date__c: '2026-09-22',
        },
        {
          Id: 'scheduled',
          Appointment_ID__c: 'two',
          Billing_Code__c: '97152',
          Service_Name__c: 'Assessment Support',
          CreatedDate: '2026-09-21',
          Appt_Date__c: '2026-09-28',
          Appointment_Status__c: 'Active',
          Completed__c: 'No',
        },
      ],
    });
    const result = buildSlaStory({ opportunity, gate: assessment, events, asOf });
    expect(result.conflicts).toEqual([]);
    expect(result.currentGateIssueKey).toBe('initial-assessment');
    expect(result.resolvedIssues.some((issue) => issue.issueKey === 'initial-assessment')).toBe(
      false
    );
    expect(result.timeline.some((item) => item.factType === 'ia-partial')).toBe(true);
    expect(result.timeline.find((item) => item.sourceRecordId === 'completed')?.text).toContain(
      'explicitly confirms a completed'
    );
  });
  it('retains a pending appeal when a later generic pending or denial restates it', () => {
    const appeal = event('appeal', 'Treatment authorization reconsideration pending', {
      factType: 'auth-appeal',
      issueKey: 'treatment-authorization',
      eventDate: '2026-09-21',
    });
    for (const restatement of [
      event('pending', 'Treatment authorization pending', { factType: 'auth-pending' }),
      event('denial', 'Treatment authorization denied', { factType: 'auth-denied' }),
    ]) {
      const result = story([appeal, restatement], { gate: authorization });
      expect(result.conflicts).toEqual([]);
      expect(result.timeline[1]?.lifecycleState).toBe('Superseded');
      expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('appeal');
    }
  });
  it('does not suppress a new authorization or an explicitly denied reconsideration', () => {
    const appeal = event('appeal', 'Treatment authorization reconsideration pending', {
      factType: 'auth-appeal',
      issueKey: 'treatment-authorization',
      eventDate: '2026-09-21',
    });
    const denied = event('denied', 'Treatment authorization denied again after reconsideration', {
      factType: 'auth-denied',
      issueKey: 'treatment-authorization',
    });
    const result = story([appeal, denied], { gate: authorization });
    expect(result.timeline[1]?.lifecycleState).not.toBe('Superseded');
    expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('denied');
    expect(
      story([appeal, event('new', 'New authorization pending', { factType: 'auth-pending' })], {
        gate: authorization,
      }).timeline[1]?.lifecycleState
    ).not.toBe('Superseded');
  });
  it('does not treat a partial authorization plus its denied scope as incompatible approval', () => {
    const result = story(
      [
        event('partial', 'Treatment authorization partially approved; denied 20 of 100 units', {
          factType: 'auth-partial',
          eventDate: '2026-09-21',
        }),
        event(
          'approved',
          'Treatment authorization approved only part; peer-to-peer denied remaining units',
          { factType: 'auth-approved', relationship: 'Conflicts' }
        ),
      ],
      { gate: authorization }
    );
    expect(result.timeline[1]?.lifecycleState).not.toBe('Conflicting');
  });
  it('reconciles an older conflict only with a later structured fact or explicit progression', () => {
    const conflict = event('conflict', 'Treatment authorization pending', {
      factType: 'auth-pending',
      issueKey: 'treatment-authorization',
      relationship: 'Conflicts',
      eventDate: '2026-09-21',
    });
    const resolved = event('structured', 'Current payer record is pending', {
      source: 'Authorization',
      factType: 'auth-pending',
      issueKey: 'treatment-authorization',
    });
    const result = story([conflict, resolved], { gate: authorization });
    expect(result.conflicts).toEqual([]);
    expect(result.timeline[0]?.lifecycleState).toBe('Superseded');
    expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('structured');
  });
  it('supersedes equivalent, less specific and lower-ranked same-record restatements', () => {
    const direct = event('request', 'Payer requested diagnostic report', {
      source: 'Authorization',
      factType: 'auth-additional-info',
      issueKey: 'treatment-authorization',
      requestedInformation: 'diagnostic report',
      processRelevance: 15,
    });
    const result = story(
      [
        direct,
        { ...direct, sourceRecordId: 'equivalent' },
        event('generic', 'Payer needs more information', {
          source: 'Authorization',
          factType: 'auth-additional-info',
          issueKey: 'treatment-authorization',
          specificityMissing: true,
        }),
        event('request', 'Payer has additional details request', {
          source: 'Authorization',
          factType: 'auth-pending',
          issueKey: 'treatment-authorization',
          processRelevance: 1,
        }),
      ],
      { gate: authorization }
    );
    expect(result.timeline.filter((item) => item.lifecycleState === 'Superseded')).toHaveLength(3);
    expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('request');
  });
  it('keeps earlier lifecycle-record versions auditable but superseded', () => {
    const result = story([
      event('version-one', 'Family availability pending', {
        factType: 'family-availability',
        lifecycleRecordId: 'family-record',
        eventDate: '2026-09-21',
      }),
      event('version-two', 'Family confirmed availability', {
        factType: 'family-availability',
        lifecycleRecordId: 'family-record',
      }),
    ]);
    expect(result.timeline[0]?.lifecycleState).toBe('Superseded');
    expect(result.timeline[1]?.lifecycleState).toBe('Resolved');
    expect(result.timeline[0]?.resolvedByEventId).toBe('Task:version-two');
  });
  it('treats a bare hire and its prerequisite as compatible even with a conflict label', () => {
    const hired = event('same-packet', 'The provider hired an RBT.', { factType: 'rbt-assigned' });
    const prerequisite = event('same-packet', 'The hired RBT still needs credentialing.', {
      factType: 'rbt-assigned',
      relationship: 'Conflicts',
    });
    for (const events of [
      [hired, prerequisite],
      [prerequisite, hired],
    ]) {
      const result = story(events, { gate: staffing });
      expect(result.conflicts).toEqual([]);
    }
  });
  it.each([
    ['The RBT is hired and credentialed.', 'The RBT is hired but not credentialed.'],
    ['The RBT is hired and ready to start.', 'The RBT is hired but cannot start.'],
    ['The RBT is hired.', 'The RBT is not hired.'],
  ])('does not hide conflicting staffing claims: %s', (support, conflict) => {
    const left = event('packet', support, { factType: 'rbt-assigned' });
    const right = event('packet', conflict, {
      factType: 'rbt-assigned',
      relationship: 'Conflicts',
    });
    for (const events of [
      [left, right],
      [right, left],
    ])
      expect(story(events, { gate: staffing }).conflicts.length).toBeGreaterThan(0);
  });
  it('does not let a different inactive candidate replace an active candidate', () => {
    const result = story(
      [
        event('active', 'RBT proposed', {
          factType: 'rbt-candidate',
          candidateName: 'Synthetic A',
          candidateActive: true,
          eventDate: '2026-09-21',
        }),
        event('inactive', 'RBT no longer available', {
          factType: 'rbt-lost',
          candidateName: 'Synthetic B',
          candidateActive: false,
        }),
      ],
      { gate: staffing }
    );
    expect(result.timeline[1]).toMatchObject({
      lifecycleState: 'Superseded',
      resolvedByEventId: null,
      resolutionDate: null,
    });
    expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('active');
  });
  it('permits replacement progress after the prior candidate became inactive', () => {
    const result = story(
      [
        event('lost', 'RBT resigned', {
          factType: 'rbt-lost',
          candidateName: 'Synthetic A',
          candidateActive: false,
          relationship: 'Conflicts',
          eventDate: '2026-09-21',
        }),
        event('replacement', 'RBT candidate proposed', {
          factType: 'rbt-candidate',
          candidateName: 'Synthetic B',
          candidateActive: true,
        }),
      ],
      { gate: staffing }
    );
    expect(result.conflicts).toEqual([]);
    expect(result.timeline[0]?.lifecycleState).toBe('Superseded');
  });
  it('preserves a known future appointment after completion of a separate prerequisite', () => {
    const result = story([
      event('appointment', 'Initial assessment scheduled for September 30', {
        factType: 'ia-scheduled',
        milestoneDate: '2026-09-30',
        eventDate: '2026-09-21',
        actionType: 'Monitor',
      }),
      event('documents', 'Diagnostic evaluation completed', {
        factType: 'family-document-completed',
      }),
    ]);
    expect(result.currentGateIssueKey).toBe('initial-assessment');
    expect(result.futureMilestones.map((item) => item.sourceRecordId)).toEqual(['appointment']);
    expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('appointment');
  });
  it('does not promote pre-window, superseded or conflicting future events into monitoring', () => {
    const result = story([
      event('old', 'Initial assessment scheduled', {
        factType: 'ia-scheduled',
        eventDate: '2026-09-18',
        milestoneDate: '2026-09-30',
      }),
      event('conflict', 'Initial assessment scheduling conflicts', {
        factType: 'ia-scheduled',
        relationship: 'Conflicts',
        milestoneDate: '2026-09-30',
      }),
    ]);
    expect(result.futureMilestones).toEqual([]);
    expect(result.timeline[0]?.narrativeContribution).toBe('History');
    expect(result.timeline[1]?.narrativeContribution).toBe('Conflict');
  });
  it('carries current unresolved structured authorization before the story window', () => {
    const old = event('old-auth', 'Treatment authorization pending', {
      source: 'Authorization',
      issueKey: 'treatment-authorization',
      factType: 'auth-pending',
      eventDate: '2026-01-01',
    });
    const result = story([old], {
      gate: { ...authorization, authorization: { phase: 'treatment', satisfied: false } },
    });
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]?.preWindowContext).toBe(true);
    expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('old-auth');
    expect(result.currentGateOverride?.owner).toBe('Insurance Ops');
  });
  it('does not let a prior IA expiry undo completed treatment-plan readiness', () => {
    const result = story(
      [
        event('expiry', 'Initial authorization expired', {
          issueKey: 'initial-authorization',
          factType: 'auth-expired',
          eventDate: '2026-09-21',
        }),
        event('ready', 'Treatment plan is ready to submit', { factType: 'tp-ready' }),
      ],
      {
        opportunity: { ...opportunity, stage: '97151 Started' },
        gate: {
          processPosition: 'Treatment plan',
          unresolvedGate: 'Complete treatment plan',
          authorization: { satisfied: true },
        },
      }
    );
    expect(result.currentGateIssueKey).not.toBe('initial-authorization');
    expect(result.timeline.some((item) => item.sourceRecordId === 'expiry')).toBe(true);
  });
  it('restores later treatment-plan work after an earlier planned submission', () => {
    const result = story(
      [
        event('target', 'Treatment plan submission planned', {
          factType: 'tp-submission-planned',
          eventDate: '2026-09-21',
        }),
        event('draft', 'Provider is still drafting treatment plan', { factType: 'tp-drafting' }),
      ],
      {
        gate: {
          processPosition: 'Clinical Quality review',
          unresolvedGate: 'Complete Clinical Quality review',
        },
      }
    );
    expect(result.currentGateIssueKey).toBe('treatment-plan');
    expect(result.latestSubstantiveEvent?.sourceRecordId).toBe('draft');
  });
  it('preserves typed portal submission as a Salesforce-record follow-up, not a provider drafting request', () => {
    const result = story(
      [
        event('portal', 'Treatment plan received in portal', {
          factType: 'tp-portal-submitted-awaiting-clinical-quality',
        }),
      ],
      { gate: { processPosition: 'Treatment plan', unresolvedGate: 'Complete treatment plan' } }
    );
    expect(result.currentGateIssueKey).toBe('clinical-review');
    expect(result.currentGateOverride).toMatchObject({
      owner: 'Insurance Ops',
      recommendedActionType: 'Salesforce Update',
    });
  });
  it('retains source coverage own-undefined fields and the source version', () => {
    const result = story([], {
      sourceResults: [{ source: 'Task', status: 'Searched - Not Found' }],
    });
    expect(result.version).toBe('2026-08-11.9');
    expect(result.sourceCoverage).toEqual([
      {
        source: 'Task',
        status: 'Searched - Not Found',
        collectedAt: undefined,
        failureReason: undefined,
      },
    ]);
    expect(Object.hasOwn(result.sourceCoverage[0] ?? {}, 'failureReason')).toBe(true);
  });
});
