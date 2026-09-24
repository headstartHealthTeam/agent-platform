import { describe, expect, it } from 'vitest';

import { createNoteAdjudicator } from './note-adjudication.js';
import { adaptOpportunityNotes } from './opportunity-note-evidence.js';
import type {
  OpportunityNoteAdjudicationInput,
  OpportunityNotesInput,
} from './opportunity-note-evidence.js';

const base: OpportunityNotesInput = {
  opportunity: {
    Current_SLA__c: 'synthetic-sla',
    Current_SLA__r: {
      Reason_for_Delay__c: 'Treatment plan',
      Reason_for_Delay_Notes__c: 'Provider working on treatment plan.',
      Reason_for_Delay_Notes_Last_Updated__c: '2026-09-23',
    },
  },
  profile: {
    opportunityId: 'synthetic',
    opportunityName: 'Synthetic Example',
    stageEntryDate: '2026-09-01',
  },
  gate: { gateCategory: 'treatmentPlan' },
  asOf: '2026-09-24T22:00:00.000Z',
};
describe('approved Salesforce note evidence projection', () => {
  it('uses supported agent judgment for a staffing pause without adding a parser phrase rule', () => {
    const input: OpportunityNotesInput = {
      ...base,
      gate: { gateCategory: 'rbt', processPosition: 'RBT staffing' },
      opportunity: {
        Current_SLA__c: 'synthetic-sla',
        Current_SLA__r: {
          Reason_for_Delay_Notes__c: 'RBT recruiting is paused',
          LastModifiedDate: '2026-09-23',
        },
      },
    };
    const runId = 'synthetic-pause-run';
    const planner = createNoteAdjudicator({ runId, asOf: input.asOf });
    adaptOpportunityNotes({ ...input, adjudicateNote: planner.interpret });
    const packet = planner.packets[0];
    if (packet === undefined) throw Error('Missing synthetic pause packet');
    const adjudicator = createNoteAdjudicator({
      runId,
      asOf: input.asOf,
      artifact: {
        schemaVersion: 1,
        runId,
        sourceCutoff: input.asOf,
        executionProvenance: { kind: 'codex-current-run' },
        decisions: [
          {
            opportunityId: 'synthetic',
            sourceRecordId: packet.sourceRecordId,
            packetHash: packet.packetHash,
            disposition: 'substantive',
            rationale: 'Reviewed the complete staffing source in current gate context.',
            supportSpan: packet.text,
            findings: [
              {
                matchedOpportunityId: 'synthetic',
                synthesizedFact: 'The staffing search is paused; no restart condition was stated.',
                gateImpact: 'The staffing restart needs clarification.',
                substantive: true,
                relationship: 'Supports',
                supportSpan: 'RBT recruiting is paused',
                actionOwner: 'RBT Team',
                actionType: 'RBT Follow-Up',
                recommendedAction: 'RBT Team to confirm the staffing restart condition.',
                milestoneDate: null,
                followUpDate: null,
                milestoneKind: null,
                category: 'rbt',
                issueKey: 'rbt-staffing',
                factType: 'rbt-recruiting-paused',
              },
            ],
          },
        ],
      },
    });
    expect(
      adaptOpportunityNotes({ ...input, adjudicateNote: adjudicator.interpret })
    ).toMatchObject([
      {
        factType: 'rbt-recruiting-paused',
        milestoneDate: null,
        interpretationProvenance: { kind: 'codex-current-run', packetHash: packet.packetHash },
      },
    ]);
    adjudicator.assertConsumed();
    expect(adjudicator.administrativeNote('synthetic', 'synthetic-sla')).toBe(false);
  });
  it('retains contextual labeling, raw note text and source timestamps', () => {
    const captured: OpportunityNoteAdjudicationInput[] = [];
    const events = adaptOpportunityNotes({
      ...base,
      adjudicateNote(input) {
        captured.push(input);
        return null;
      },
    });
    expect(events).toMatchObject([
      {
        source: 'SLA / Intake / On-Hold Notes',
        sourceRecordId: 'synthetic-sla:1',
        eventDate: '2026-09-23',
        factType: 'tp-drafting',
        milestoneDate: null,
      },
    ]);
    expect(captured).toMatchObject([
      {
        noteRecordId: 'synthetic-sla',
        text: 'Treatment plan update: Provider working on treatment plan.',
        rawText: 'Treatment plan update: Provider working on treatment plan.',
        stageEntryDate: '2026-09-01',
        context: { noteType: 'sla', slaReason: 'Treatment plan' },
      },
    ]);
  });
  it('preserves reason-only family nonresponse without admitting arbitrary reason-only facts', () => {
    const opportunity = {
      Current_SLA__c: 'synthetic-sla',
      Current_SLA__r: {
        Reason_for_Delay__c: 'Family unresponsive',
        Reason_for_Delay_Notes__c: '',
        LastModifiedDate: '2026-09-23',
      },
    };
    expect(adaptOpportunityNotes({ ...base, opportunity, gate: {} })).toMatchObject([
      { factType: 'family-unresponsive' },
    ]);
    expect(
      adaptOpportunityNotes({
        ...base,
        opportunity: {
          ...opportunity,
          Current_SLA__r: {
            ...opportunity.Current_SLA__r,
            Reason_for_Delay__c: 'Unspecified reason',
          },
        },
        gate: {},
      })
    ).toEqual([]);
  });
  it('keeps dated updates at the frozen cutoff and restores context for each SLA segment', () => {
    const captured: OpportunityNoteAdjudicationInput[] = [];
    adaptOpportunityNotes({
      ...base,
      opportunity: {
        ...base.opportunity,
        Current_SLA__r: {
          Reason_for_Delay__c: 'Treatment plan',
          Reason_for_Delay_Notes__c:
            '9/20: Provider working on treatment plan. 9/23: Provider submitted. 9/25: Provider on leave.',
          LastModifiedDate: '2026-09-24',
        },
      },
      adjudicateNote(input) {
        captured.push(input);
        return [];
      },
    });
    expect(captured.map((input) => [input.sourceRecordId, input.eventDate, input.text])).toEqual([
      [
        'synthetic-sla:1',
        '2026-09-20',
        'Treatment plan update: 9/20: Provider working on treatment plan.',
      ],
      ['synthetic-sla:2', '2026-09-23', 'Treatment plan update: 9/23: Provider submitted.'],
    ]);
    expect(captured[1]?.rawText).toBe('9/23: Provider submitted.');
  });
  it('preserves intake/on-hold note IDs and date precedence', () => {
    const captured: OpportunityNoteAdjudicationInput[] = [];
    adaptOpportunityNotes({
      ...base,
      gate: {},
      opportunity: {
        Intake_Notes__c: 'Family unresponsive.',
        Intake_Notes_Last_Updated__c: '2026-09-20',
        On_Hold_Notes__c: 'Client on hold.',
        On_Hold_Start_Date__c: '2026-09-22',
        LastModifiedDate: '2026-09-23',
      },
      adjudicateNote(input) {
        captured.push(input);
        return [];
      },
    });
    expect(
      captured.map((input) => [input.noteRecordId, input.eventDate, input.context?.noteType])
    ).toEqual([
      ['synthetic:intake-note', '2026-09-20', 'salesforce-note'],
      ['synthetic:on-hold-note', '2026-09-22', 'salesforce-note'],
    ]);
    expect(adaptOpportunityNotes({ ...base, opportunity: {}, gate: {} })).toEqual([]);
  });
  it('composes exact-bound current-run Codex adjudication and preserves administrative empty results', () => {
    const runId = 'synthetic-note-run';
    const planner = createNoteAdjudicator({ runId, asOf: base.asOf });
    const fallback = adaptOpportunityNotes({ ...base, adjudicateNote: planner.interpret });
    expect(fallback).toHaveLength(1);
    const packet = planner.packets[0];
    expect(packet).toBeDefined();
    if (packet === undefined) throw Error('Missing synthetic note packet');
    const adjudicator = createNoteAdjudicator({
      runId,
      asOf: base.asOf,
      artifact: {
        schemaVersion: 1,
        runId,
        sourceCutoff: base.asOf,
        executionProvenance: { kind: 'codex-current-run' },
        decisions: [
          {
            opportunityId: 'synthetic',
            sourceRecordId: packet.sourceRecordId,
            packetHash: packet.packetHash,
            disposition: 'administrative',
            rationale: 'Synthetic judgment verifies an administrative source.',
            supportSpan: packet.text,
            findings: [],
          },
        ],
      },
    });
    expect(adaptOpportunityNotes({ ...base, adjudicateNote: adjudicator.interpret })).toEqual([]);
    adjudicator.assertConsumed();
    expect(adjudicator.administrativeNote('synthetic', 'synthetic-sla')).toBe(true);
  });
  it.each([
    ['Insurance delay', 'insurance', 'Authorization update'],
    ['RBT staffing', 'rbt', 'Staffing and scheduling update'],
    ['Assessment scheduling', 'intakeScheduling', 'Initial-assessment update'],
  ] as const)('retains the existing context label for %s', (reason, category, label) => {
    const captured: OpportunityNoteAdjudicationInput[] = [];
    adaptOpportunityNotes({
      ...base,
      gate: { gateCategory: category },
      opportunity: {
        Current_SLA__c: 'synthetic-sla',
        Current_SLA__r: {
          Reason_for_Delay__c: reason,
          Reason_for_Delay_Notes__c: 'Update from source.',
          LastModifiedDate: '2026-09-23',
        },
      },
      adjudicateNote(input) {
        captured.push(input);
        return [];
      },
    });
    expect(captured[0]?.text).toBe(`${label}: Update from source.`);
  });
});
