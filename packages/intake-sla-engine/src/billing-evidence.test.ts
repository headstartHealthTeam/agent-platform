import { describe, expect, it } from 'vitest';

import { adaptBillingClaims } from './billing-evidence.js';
import type { BillingClaim } from './billing-types.js';

const asOf = '2026-09-11T17:31:07.000Z';
const profile = {
  opportunityId: 'synthetic',
  opportunityName: 'Synthetic Opportunity',
  currentCsm: { name: 'Synthetic CSM' },
};
const gate = { gateCategory: 'insurance', processPosition: 'Initial authorization' };
function record(code = '97151', date = '2026-09-01', completed = false): BillingClaim {
  return {
    Id: `synthetic-${code}-${date}`,
    Appointment_ID__c: `appointment-${code}-${date}`,
    Billing_Code__c: code,
    Service_Name__c: code === '97151' ? 'Assessment' : 'Direct Care',
    Appt_Date__c: date,
    Appointment_Status__c: 'Active',
    Completed__c: completed ? 'Yes' : 'No',
    Completed_Date__c: completed ? `${date}T00:00:00.000Z` : null,
    CreatedDate: '2026-09-01T12:00:00.000Z',
  };
}
describe('linked billing evidence projection', () => {
  it('preserves completed sessions and supported reconciliation despite an inconsistent earlier gate', () => {
    const opportunity = {
      StageName: 'IA Scheduled',
      IA_Scheduled_For__c: '2026-09-01',
      IA_Completed_Date__c: null,
    };
    const events = adaptBillingClaims({
      records: [record('97151', '2026-09-01', true)],
      profile,
      gate,
      asOf,
      opportunity,
      coverageComplete: true,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'Linked Billing / Claims',
      category: 'intakeScheduling',
      eventDate: '2026-09-01',
      actionType: 'Salesforce Update',
      factType: 'ia-session-completed',
      milestoneDate: '2026-09-01',
      followUpDate: '2026-09-14',
      processRelevance: 13,
    });
    expect(events[0]?.text).toContain(
      'A completed session is distinct from whole-assessment completion.'
    );
    expect(events[0]?.recommendedAction).toContain(
      'route the supported assessment reconciliation gap'
    );
    expect(
      adaptBillingClaims({
        records: [record('97153', '2026-09-04', true)],
        profile,
        gate,
        asOf,
        opportunity: {
          StageName: 'TA Approved - Pending Scheduling',
          First_day_of_Treatment__c: null,
        },
      })[0]
    ).toMatchObject({
      factType: 'treatment-session-completed',
      actionType: 'Salesforce Update',
      category: 'rbt',
    });
  });
  it('retains future monitoring while distinguishing partial assessment and support sessions', () => {
    const completed = record('97151', '2026-09-01', true);
    for (const next of [
      record('97151', '2026-09-15'),
      { ...record('97152', '2026-09-15'), Service_Name__c: 'Assessment Support' },
    ]) {
      const events = adaptBillingClaims({
        records: [completed, next],
        profile,
        gate,
        asOf,
        opportunity: { StageName: 'IA Scheduled' },
        coverageComplete: true,
      });
      expect(events[0]).toMatchObject({
        factType: 'ia-partial',
        actionType: 'Monitor',
        plannedDate: '2026-09-15',
        followUpDate: '2026-09-15',
      });
      expect(events[0]?.text).toContain(
        '1 active assessment session(s) still lack explicit completion'
      );
      expect(JSON.stringify(events)).not.toMatch(
        /remaining client-facing|stage is wrong|current gate is resolved/
      );
      expect(events[1]).toMatchObject({
        factType: 'ia-session-unverified',
        actionType: 'Monitor',
        followUpDate: '2026-09-15',
      });
      if (next.Billing_Code__c === '97152')
        expect(events[1]?.text).toContain('assessment-support appointment');
    }
  });
  it('routes past unverified work without discarding a separate scheduled appointment', () => {
    const events = adaptBillingClaims({
      records: [record('97151', '2026-09-02'), record('97151', '2026-09-15')],
      profile,
      asOf,
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      actionType: 'Provider Outreach',
      followUpDate: '2026-09-14',
      milestoneDate: '2026-09-15',
    });
    expect(events[0]?.text).toContain('separate active assessment session dated 2026-09-02');
    expect(events[0]?.recommendedAction).toContain(
      'do not infer completion or a Salesforce stage error'
    );
    expect(events[1]?.text).toContain('does not explicitly confirm completion');
  });
  it('retains row-level relationship/completion conflicts, replacement plans and inactive-service review', () => {
    const conflict = {
      ...record('97151', '2026-09-01', true),
      Client_Opportunity__c: 'synthetic-A',
      Authorization__r: { Client_Opportunity_Record__c: 'synthetic-B' },
    };
    expect(adaptBillingClaims({ records: [conflict], profile, asOf })[0]).toMatchObject({
      relationship: 'Conflicts',
      factType: 'billing-completion-review',
      milestoneDate: null,
      actionType: 'Salesforce Update',
    });
    for (const code of ['97151', '97153']) {
      const cancelled = { ...record(code), Appointment_Status__c: 'Cancelled' };
      const event = adaptBillingClaims({ records: [cancelled], profile, asOf })[0];
      expect(event?.actionType).toBe('Provider Outreach');
      expect(event?.recommendedAction).toContain('replacement');
    }
    const inactive = { ...record('97153', '2026-09-01', true), Appointment_Status__c: 'Inactive' };
    expect(adaptBillingClaims({ records: [inactive], profile, asOf })[0]?.gateImpact).toContain(
      'inactive direct-care evidence requires Salesforce-owner review'
    );
  });
  it('uses the same cutoff before any narrative and leaves irrelevant or absent records empty', () => {
    const after = {
      ...record('97151', '2026-09-01', true),
      CreatedDate: '2026-09-11T18:00:00.000Z',
    };
    expect(adaptBillingClaims({ records: [after], profile, asOf, coverageComplete: true })).toEqual(
      []
    );
    expect(adaptBillingClaims({ profile, asOf })).toEqual([]);
    expect(
      adaptBillingClaims({
        profile: { opportunityId: 'synthetic', currentCsm: { name: {} } },
        asOf,
      })
    ).toEqual([]);
    expect(adaptBillingClaims({ records: [{ Billing_Code__c: '99999' }], profile, asOf })).toEqual(
      []
    );
    expect(() => adaptBillingClaims({ profile, asOf: 'invalid' })).toThrow('valid frozen cutoff');
  });
  it('preserves evidence timestamps, fallback owner and required source identity failures', () => {
    const row = { ...record(), LastModifiedDate: '2026-09-09T00:00:00Z' };
    expect(
      adaptBillingClaims({
        records: [row],
        profile: { opportunityId: 'synthetic', currentCsm: 'ignored raw name' },
        asOf,
      })[0]
    ).toMatchObject({ eventDate: '2026-09-09T00:00:00Z', actionOwner: 'CSM' });
    expect(
      adaptBillingClaims({
        records: [row],
        profile: { opportunityId: 'synthetic', currentCsm: { name: '' } },
        asOf,
      })[0]?.actionOwner
    ).toBe('CSM');
    expect(() =>
      adaptBillingClaims({
        records: [{ ...row, Id: null, Appointment_ID__c: null }],
        profile,
        asOf,
      })
    ).toThrow('EvidenceEvent missing sourceRecordId');
    expect(() =>
      adaptBillingClaims({
        records: [row],
        profile: { opportunityId: 'synthetic', currentCsm: { name: {} } },
        asOf,
      })
    ).toThrow('Evidence action owner must be text');
  });
});
