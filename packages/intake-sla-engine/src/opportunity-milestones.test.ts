import { describe, expect, it } from 'vitest';

import {
  adaptOpportunityMilestones,
  type OpportunityMilestoneRecord,
} from './opportunity-milestones.js';
import { adaptStageHistory } from './stage-history-evidence.js';
import type { StructuredEvidenceEvent } from './structured-evidence.js';

const profile = {
  opportunityId: 'synthetic-opportunity',
  currentCsm: { name: 'Synthetic CSM' },
  stage: 'IA Scheduled',
};
const asOf = '2026-09-11T17:31:07.000Z';
function project(
  opportunity: OpportunityMilestoneRecord,
  gateCategory = 'intakeScheduling'
): StructuredEvidenceEvent[] {
  return adaptOpportunityMilestones({ opportunity, profile, gate: { gateCategory }, asOf });
}
describe('Opportunity milestone evidence', () => {
  it('preserves a recorded assessment start without asserting completion or stage error', () => {
    for (const opportunity of [
      { IA_Completed_Date__c: '2026-09-01', IA_Scheduled_For__c: '2026-09-15' },
      { IA_Completed_Date__c: '', iaCompletedDate: '2026-09-01' },
    ]) {
      const events = project(opportunity);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        source: 'Salesforce Opportunity / SLA',
        eventDate: '2026-09-01',
        actionType: 'Monitor',
        factType: 'ia-start-date-recorded',
        processRelevance: 11,
        milestoneDate: null,
        followUpDate: null,
      });
      expect(events[0]?.text).toBe(
        'Salesforce records the 97151 Started Date as 2026-09-01; this date alone does not establish whole-assessment completion.'
      );
      expect(events[0]?.recommendedAction).toContain(
        'do not infer a stage error from the start date alone'
      );
    }
  });
  it('retains IA scheduled date and the first available evidence timestamp', () => {
    const fields = [
      'IA_Scheduled_Timestamp__c',
      'IA_Scheduled_On__c',
      'iaScheduledOn',
      'stageEntryDate',
      'LastModifiedDate',
    ];
    for (const [index, field] of fields.entries()) {
      const opportunity = {
        IA_Scheduled_For__c: '2026-09-15',
        [field]: '2026-09-03',
        ...Object.fromEntries(fields.slice(index + 1).map((key) => [key, '2026-09-04'])),
      };
      expect(project(opportunity)[0]).toMatchObject({
        eventDate: '2026-09-03',
        milestoneDate: '2026-09-15',
        followUpDate: '2026-09-15',
        actionType: 'Monitor',
        factType: null,
      });
    }
    expect(project({ IA_Scheduled_For__c: '', iaScheduledFor: '2026-09-15' })[0]?.eventDate).toBe(
      asOf
    );
    expect(project({ IA_Scheduled_For__c: '2026-09-01' })[0]?.actionType).toBe('Monitor');
  });
  it('projects only explicitly recorded complete prerequisites and keeps their separate meaning/order', () => {
    const opportunity = {
      Vineland_Status__c: 'Filed',
      Vineland_Filed_Timestamp__c: '2026-09-02',
      Vineland_Completed_Timestamp__c: '2026-09-10',
      BASC_Status__c: 'Complete',
      BASC_Completed_Timestamp__c: '2026-09-04',
      Intake_Packet_Status__c: 'Received',
      Intake_Packet_Completed_Timestamp__c: '2026-09-03',
      IA_Completed_Date__c: '2026-09-01',
    };
    const events = project(opportunity);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      sourceRecordId: 'synthetic-opportunity:intake-prerequisites',
      eventDate: '2026-09-04T00:00:00.000Z',
      factType: 'family-document-completed',
      issueKey: 'required-documentation',
      requestedInformation: 'the Vineland assessment, the BASC assessment, and the intake packet',
      milestoneDate: null,
    });
    expect(events[0]?.text).toBe(
      'Salesforce confirms the Vineland assessment, the BASC assessment, and the intake packet are complete as of 2026-09-04.'
    );
    expect(events[1]?.factType).toBe('ia-start-date-recorded');
    const single = project(
      { BASC_Status__c: 'Completed', BASC_Completed_Timestamp__c: '2026-09-04' },
      'treatmentPlan'
    );
    expect(single[0]?.text).toContain('the BASC assessment is complete');
    expect(single[0]?.recommendedAction).toContain('current treatment-plan milestone');
    expect(
      project({
        Vineland_Status__c: 'Pending',
        Vineland_Filed_Timestamp__c: '2026-09-02',
        BASC_Status__c: 'Completed',
      })
    ).toEqual([]);
    expect(project(opportunity, 'insurance')).toEqual([]);
    expect(() =>
      project({ BASC_Status__c: 'Completed', BASC_Completed_Timestamp__c: 'invalid' })
    ).toThrow('EvidenceEvent missing eventDate');
  });
  it('preserves recorded first service and scheduled service with the original fallback precedence', () => {
    for (const opportunity of [
      { First_day_of_Treatment__c: '2026-09-04', X97153_Scheduled_For__c: '2026-09-15' },
      { First_day_of_Treatment__c: '', firstDayOfTreatment: '2026-09-04' },
    ])
      expect(project(opportunity, 'rbt')[0]).toMatchObject({
        eventDate: '2026-09-04',
        actionType: 'Salesforce Update',
        milestoneDate: null,
        factType: null,
      });
    const fields = ['X53_Provider_Confirmed_First_Day_TS__c', 'stageEntryDate', 'LastModifiedDate'];
    for (const field of fields)
      expect(
        project({ X97153_Scheduled_For__c: '2026-09-15', [field]: '2026-09-03' }, 'rbt')[0]
      ).toMatchObject({
        eventDate: '2026-09-03',
        milestoneDate: '2026-09-15',
        followUpDate: '2026-09-15',
        actionType: 'Monitor',
      });
    expect(project({ first97153ScheduledFor: '2026-09-15' }, 'rbt')[0]?.eventDate).toBe(asOf);
    expect(project({}, 'rbt')).toEqual([]);
  });
  it('preserves invalid date text, unused inputs and consumed owner/identity failures', () => {
    expect(project({ iaScheduledFor: 'invalid' })[0]?.text).toBe(
      'Salesforce schedules the initial assessment for null.'
    );
    expect(
      adaptOpportunityMilestones({
        opportunity: {},
        profile: { opportunityId: 'synthetic', currentCsm: { name: {} } },
        asOf,
      })
    ).toEqual([]);
    expect(
      adaptOpportunityMilestones({
        opportunity: { iaCompletedDate: '2026-09-01' },
        profile: { opportunityId: 'synthetic', currentCsm: '' },
        gate: { gateCategory: 'intakeScheduling' },
        asOf,
      })[0]?.actionOwner
    ).toBe('CSM');
    expect(() =>
      adaptOpportunityMilestones({
        opportunity: { iaCompletedDate: '2026-09-01' },
        profile: { opportunityId: 'synthetic', currentCsm: { name: {} } },
        gate: { gateCategory: 'intakeScheduling' },
        asOf,
      })
    ).toThrow('Evidence action owner');
  });
});
describe('stage history evidence', () => {
  it('admits current-stage transitions with original case/whitespace matching and neutral evidence', () => {
    const events = adaptStageHistory({
      records: [
        {
          Id: 'synthetic-current',
          Field: 'StageName',
          NewValue: ' IA   SCHEDULED ',
          CreatedDate: '2026-09-03',
        },
        { Id: 'synthetic-other', Field: 'StageName', NewValue: 'TA Approved' },
        { Id: 'synthetic-field', Field: 'Owner', NewValue: 'IA Scheduled' },
      ],
      profile,
      gate: { gateCategory: 'intakeScheduling' },
      asOf,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventDate: '2026-09-03',
      text: 'The Opportunity entered  IA   SCHEDULED .',
      relationship: 'Neutral',
      matchQuality: 'Direct',
      processRelevance: 4,
      source: 'Salesforce Stage History',
    });
    expect(
      adaptStageHistory({
        records: [{ Id: 'synthetic', Field: 'Stage', NewValue: null, CreatedDate: '' }],
        profile: { opportunityId: 'synthetic', stage: null },
        asOf,
      })[0]
    ).toMatchObject({ eventDate: asOf, text: 'The Opportunity entered null.', category: 'other' });
    expect(adaptStageHistory({ profile, asOf })).toEqual([]);
    expect(() =>
      adaptStageHistory({
        records: [{ Field: 'StageName', NewValue: 'IA Scheduled' }],
        profile,
        asOf,
      })
    ).toThrow('EvidenceEvent missing sourceRecordId');
  });
});
