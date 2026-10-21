import { describe, expect, it } from 'vitest';

import { createEvidenceEvent } from './evidence.js';
import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import type { FreshnessInput, FreshnessInterpretedEvent } from './freshness-source-types.js';
import { buildIdentityProfile } from './identity-profile.js';
import { adjudicatedNoteFreshnessInput } from './note-freshness.js';

const opp = {
  Id: ['006', '000000000001'].join(''),
  Name: 'Synthetic Example',
  StageName: 'IA Scheduled',
  LastModifiedDate: '2026-09-20',
  Current_SLA__c: 'sla1',
  Current_SLA__r: { CreatedDate: '2026-09-10' },
};
const identity = buildIdentityProfile({
  opportunityId: opp.Id,
  opportunityName: opp.Name,
  stage: opp.StageName,
  providerRoles: [{ role: 'Rendering', name: 'Doctor Fiction' }],
});
const asOf = new Date('2026-09-24T12:00:00.000Z');
function event(overrides: Partial<FreshnessInterpretedEvent> = {}): FreshnessInterpretedEvent {
  return {
    ...createEvidenceEvent({
      opportunityId: opp.Id,
      source: 'Fireflies',
      sourceRecordId: 'meeting:1',
      eventDate: '2026-09-22T12:00:00.000Z',
      category: 'intakeScheduling',
      text: 'Family asked to move the assessment to 9/25.',
      substantive: true,
      matchQuality: 'Direct',
      relationship: 'Supports',
      factType: 'ia-reschedule',
      processRelevance: 12,
    }),
    milestoneDate: '2026-09-25',
    milestoneKind: 'planned',
    interpretationProvenance: { kind: 'current-run' },
    supportSpan: 'Family asked',
    ...overrides,
  };
}
function analyze(
  extra: Partial<FreshnessInput> = {}
): ReturnType<typeof analyzeOpportunityFreshness> {
  return analyzeOpportunityFreshness({ opp, identity, asOf, ...extra });
}
describe('routine freshness source assembly', () => {
  it('preserves the frozen cutoff and rejects future candidates without shifting the assessment', () => {
    const rows = [event(), event({ sourceRecordId: 'future', eventDate: '2026-09-25' })];
    const before = structuredClone(rows);
    const result = analyze({ interpretedConversationEvents: rows });
    expect(result.evidence.map((row) => row.sourceRecordId)).toEqual(['meeting:1']);
    expect(result.updateFreshness).toBe('Current');
    expect(result.needsFireflies).toBe(false);
    expect(result.evidence[0]?.collectedAt).toBe(asOf.toISOString());
    expect(rows).toEqual(before);
  });
  it.each([
    ['2026-09-21T12:00:00.001Z', 2, 'Current', 'No'],
    ['2026-09-21T12:00:00.000Z', 3, 'Semi-Stale', 'Review'],
    ['2026-09-17T12:00:00.001Z', 6, 'Semi-Stale', 'Review'],
    ['2026-09-17T12:00:00.000Z', 7, 'Stale', 'Yes'],
  ])('preserves elapsed-day freshness at %s', (eventDate, days, label, needed) => {
    expect(analyze({ interpretedConversationEvents: [event({ eventDate })] })).toMatchObject({
      daysSinceUpdate: days,
      updateFreshness: label,
      updateNeeded: needed,
    });
  });
  it('keeps explicit unknown interpretations audit-only without falling back to raw meeting text', () => {
    const input = {
      opp,
      identity,
      asOf,
      interpretedConversationEvents: [
        event({
          category: 'unknown',
          substantive: false,
          relationship: 'Neutral',
          milestoneKind: null,
        }),
      ],
      fireflies: [
        {
          id: 'meeting',
          date: '2026-09-22',
          matchedSentences: 'Synthetic Example assessment completed.',
        },
      ],
    };
    const result = analyzeOpportunityFreshness(input);
    expect(result.evidence).toEqual([]);
    expect(result.updateFreshness).toBe('Missing');
    expect(result.latestUpdateSummary).toBe('');
  });
  it('preserves cross-gate categories, nullable actions, provenance and own unknown milestone fields', () => {
    const row = event({
      category: 'insurance',
      milestoneKind: null,
      milestoneDate: null,
      actionOwner: null,
      actionType: null,
      recommendedAction: null,
    });
    const result = analyze({ interpretedConversationEvents: [row] });
    expect(result.evidence[0]).toMatchObject({
      category: 'insurance',
      milestoneKind: null,
      milestoneDate: null,
      actionOwner: null,
      supportSpan: 'Family asked',
      interpretationProvenance: { kind: 'current-run' },
    });
    expect(result.primaryOperationalFact?.owner).toBeNull();
    const { milestoneKind: _kind, ...withoutKind } = row;
    expect(_kind).toBeNull();
    expect(
      Object.hasOwn(
        analyze({ interpretedConversationEvents: [withoutKind] }).evidence[0] ?? {},
        'milestoneKind'
      )
    ).toBe(false);
  });
  it('composes reviewed-note freshness projection without reinterpreting the replaced note', () => {
    const current = {
      ...opp,
      Current_SLA__r: {
        ...opp.Current_SLA__r,
        Reason_for_Delay_Notes__c: '9/24: Family signed treatment plan',
        LastModifiedDate: '2026-09-24',
      },
    };
    const reviewed = adjudicatedNoteFreshnessInput(
      current,
      [event({ source: 'Salesforce Opportunity / SLA', sourceRecordId: 'sla1:1' })],
      new Set(['sla1'])
    );
    const result = analyze({
      opp: reviewed.opportunity,
      interpretedConversationEvents: reviewed.events,
    });
    expect(result.evidence.map((row) => row.sourceRecordId)).toEqual(['sla1:1']);
  });
  it('retains source priority above recency and old structured evidence without old discussion facts', () => {
    const result = analyze({
      interpretedConversationEvents: [
        event({ sourceRecordId: 'old', eventDate: '2026-09-01' }),
        event({
          sourceRecordId: 'newer',
          eventDate: '2026-09-24',
          factType: 'ordinary',
          processRelevance: 8,
        }),
        event({ sourceRecordId: 'critical', eventDate: '2026-09-22' }),
      ],
      authorizationGate: {
        required: true,
        satisfied: true,
        phase: 'initial',
        approvalDate: '2026-09-01',
        recordId: 'auth1',
      },
    });
    expect(result.evidence.some((row) => row.sourceRecordId === 'old')).toBe(true);
    expect(result.supportingOperationalFacts.some((fact) => fact.sourceRecordId === 'old')).toBe(
      false
    );
    expect(result.primaryOperationalFact?.sourceRecordId).toBe('critical');
    expect(result.evidence.some((row) => row.sourceRecordId === 'auth1')).toBe(true);
  });
  it('keeps message-level supplemental retrieval distinct from search bundles', () => {
    const text = 'Synthetic Example assessment scheduled for 9/25';
    const result = analyze({
      gmail: [{ text, date: '2026-09-22', sourceId: 'message1' }],
      linkedFiles: [{ text: `2026-09-23 ${text}`, category: 'search', sourceId: 'bundle1' }],
    });
    expect(result.latestUpdateSource).toBe('Gmail');
    expect(result.evidence.find((row) => row.sourceRecordId === 'bundle1')?.eventDate).toBe(
      '2026-09-23T12:00:00.000Z'
    );
    expect(result.needsFireflies).toBe(true);
  });
  it('does not confuse a 97151 started date with whole-assessment completion', () => {
    const result = analyze({ opp: { ...opp, IA_Completed_Date__c: '2026-09-22' } });
    expect(result.evidence[0]?.rawText).toContain('whole-assessment completion is not established');
    expect(result.latestUpdateFact).not.toMatch(/assessment (?:is|was) complete/i);
  });
  it('composes actual Date-valued task records and Portal captures without mutating inputs', () => {
    const created = new Date('2026-09-22T12:00:00.000Z');
    const result = analyze({
      tasks: [
        {
          Id: 'task1',
          CreatedDate: created,
          Subject: 'Assessment',
          Description: 'Family confirmed assessment scheduled for 9/25',
        },
      ],
      portalResponses: {
        chats: [
          {
            createdAt: '2026-09-21',
            messages: [{ content: 'Assessment scheduled for 9/25', createdAt: '2026-09-21' }],
          },
        ],
      },
    });
    expect(result.evidence.find((row) => row.sourceRecordId === 'task1')?.eventDate).toBe(
      created.toISOString()
    );
    expect(result.evidence.find((row) => row.source === 'Portal chat')?.sourceRecordId).toBe('');
    expect(created.toISOString()).toBe('2026-09-22T12:00:00.000Z');
  });
});
