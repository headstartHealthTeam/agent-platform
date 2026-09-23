import { describe, expect, it } from 'vitest';

import { assessBillingClaims, selectBillingClaimAppointments } from './billing-claims.js';
import {
  assertBillingCollectionReceipt,
  billingClaimsQuery,
  billingCollectionReceipt,
  groupBillingClaims,
} from './billing-collection.js';
import { normalizeBillingClaimAppointments } from './billing-normalization.js';
import type { BillingClaim, BillingOpportunity, BillingState } from './billing-types.js';

const AS_OF = '2026-09-11T17:31:07.000Z';
function record(code = '97151', date = '2026-09-01', completed = false): BillingClaim {
  return {
    Id: `record-${code}-${date}`,
    Appointment_ID__c: `appointment-${code}-${date}`,
    Billing_Code__c: code,
    Service_Name__c: code === '97151' ? 'Assessment' : 'Direct Care',
    Appt_Date__c: date,
    Appointment_Status__c: 'Active',
    Completed__c: completed ? 'Yes' : 'No',
    Completed_Date__c: completed ? `${date}T00:00:00.000Z` : null,
    CreatedDate: `${date > '2026-09-10' ? '2026-09-10' : date}T12:00:00.000Z`,
  };
}
function assess(
  records: readonly BillingClaim[],
  opportunity: BillingOpportunity = { StageName: 'IA Scheduled' },
  coverageComplete = true
): BillingState {
  return assessBillingClaims({ records, opportunity, asOf: AS_OF, coverageComplete });
}

describe('approved Production billing semantics', () => {
  it('excludes post-cutoff completed, outstanding and conflicting records before raw or normalized aggregation', () => {
    const completed = record('97151', '2026-09-01', true);
    const future = { ...record('97151', '2026-09-15'), CreatedDate: '2026-09-11T18:00:00Z' };
    const conflict = {
      ...future,
      Id: 'synthetic-conflict',
      Completed__c: 'Yes',
      Appointment_Status__c: 'Cancelled',
    };
    for (const input of [
      { records: [completed, future, conflict] },
      {
        appointments: normalizeBillingClaimAppointments([completed, future, conflict], {
          asOf: '2026-09-16T00:00:00Z',
        }),
      },
    ]) {
      const state = assessBillingClaims({
        ...input,
        opportunity: { StageName: 'IA Scheduled' },
        asOf: AS_OF,
        coverageComplete: true,
      });
      expect(state.appointments).toHaveLength(1);
      expect(state.outstanding).toEqual([]);
      expect(state.nextScheduledAssessment).toBeNull();
      expect(state.transitionSupported).toBe(true);
      expect(state.gaps).toHaveLength(2);
      expect(state.reviewReasons).toEqual([]);
    }
    for (const code of ['97151', '97153']) {
      const row = {
        ...record(code, '2026-09-10', true),
        CreatedDate: '2026-09-11T18:00:00Z',
        Completed_Date__c: null,
      };
      const appointments = normalizeBillingClaimAppointments([row], {
        asOf: '2026-09-12T00:00:00Z',
      });
      for (const input of [{ records: [row] }, { appointments }]) {
        expect(
          assessBillingClaims({ ...input, asOf: AS_OF, coverageComplete: true })
        ).toMatchObject({
          appointments: [],
          firstAssessment: null,
          firstTreatment: null,
          transitionSupported: false,
          gaps: [],
          reviewReasons: [],
        });
      }
      expect(selectBillingClaimAppointments({ appointments, asOf: AS_OF })).toEqual([]);
    }
  });

  it('uses exact creation instants, keeps known future appointments and requires creation provenance', () => {
    const base = record('97151', '2026-09-15');
    for (const CreatedDate of ['2026-09-11T17:31:06.999Z', AS_OF, '2026-09-11T13:31:07-04:00']) {
      expect(assess([{ ...base, CreatedDate }]).nextScheduledAssessment?.serviceDate).toBe(
        '2026-09-15'
      );
    }
    expect(assess([{ ...base, CreatedDate: '2026-09-11T17:31:07.001Z' }]).appointments).toEqual([]);
    for (const CreatedDate of [null, '', 'not-a-date']) {
      expect(() => assess([{ ...base, CreatedDate }])).toThrow('valid creation timestamp');
      const appointments = normalizeBillingClaimAppointments([base], { asOf: AS_OF }).map(
        (row) => ({ ...row, createdDate: CreatedDate })
      );
      expect(() => assessBillingClaims({ appointments, asOf: AS_OF })).toThrow(
        'valid creation timestamp'
      );
    }
    expect(() => assessBillingClaims({ appointments: [] })).toThrow('valid frozen cutoff');
    expect(() => {
      Reflect.apply(assessBillingClaims, undefined, [
        { appointments: [{ status: 'Completed' }], asOf: AS_OF },
      ]);
    }).toThrow('current-contract normalization');
  });

  it('retains partial progress without inventing full completion or stale-stage reconciliation', () => {
    const records = [record('97151', '2026-09-01', true), record('97151', '2026-09-15')];
    for (const iaDate of [null, '2026-09-01']) {
      const state = assess(records, {
        StageName: 'IA Scheduled',
        IA_Completed_Date__c: iaDate,
        IA_Scheduling_Status__c: 'Scheduled',
      });
      expect(state.firstAssessment?.serviceDate).toBe('2026-09-01');
      expect(state.outstanding).toHaveLength(1);
      expect(state.transitionSupported).toBe(false);
      expect(state.gaps).toEqual([]);
      expect(state.reviewReasons).toEqual([]);
    }
    const selected = selectBillingClaimAppointments({
      appointments: normalizeBillingClaimAppointments(records, { asOf: AS_OF }),
      asOf: AS_OF,
      coverageComplete: true,
    });
    expect(
      selected.every((row) => row.assessmentPartial && !row.assessmentTransitionSupported)
    ).toBe(true);
    expect(
      assess(records, { IA_Scheduling_Status__c: 'Assessment Completed' }).reviewReasons.join(' ')
    ).toContain('conflicts');
  });

  it('requires all linked active assessments completed for the existing Production transition', () => {
    const rows = [record('97151', '2026-09-01', true), record('97151', '2026-09-04', true)];
    const state = assess(rows, { StageName: 'IA Scheduled', IA_Completed_Date__c: '2026-09-01' });
    expect(state.transitionSupported).toBe(true);
    expect(state.gaps).toHaveLength(1);
    expect(state.gaps[0]).toContain('remains IA Scheduled');
    expect(
      assess(rows, {
        StageName: 'IA Approved - Pending Scheduling',
        IA_Completed_Date__c: '2026-09-01',
      }).gaps
    ).toEqual([]);
    expect(assess(rows, {}, false).reviewReasons.join(' ')).toContain(
      'coverage has not been proven'
    );
    const cancelled = { ...record('97151', '2026-09-15'), Appointment_Status__c: 'Cancelled' };
    expect(assess([...rows, cancelled]).transitionSupported).toBe(true);
    expect(
      assess([], { StageName: 'IA Scheduled', IA_Completed_Date__c: '2026-09-01' }).gaps
    ).toEqual([]);
  });

  it('keeps ambiguous or contradictory completion signals as review evidence', () => {
    const base = record('97151', '2026-09-01', true);
    const variants: readonly BillingClaim[] = [
      { ...base, Appt_Date__c: '2026-09-15' },
      { ...base, Appointment_Status__c: 'Cancelled' },
      { ...base, Appointment_Status__c: 'No-show' },
      { ...base, Appointment_Status__c: 'Incomplete', Completed__c: 'No', Completed_Date__c: null },
      { ...base, Completed__c: 'No' },
      { ...base, Completed_Date__c: '2026-09-15T01:00:00Z' },
      { ...base, Completed_Date__c: '2026-09-11T18:00:00Z' },
      { ...base, Completed_Date__c: 'invalid' },
      { ...base, Appt_Date__c: null },
      {
        ...base,
        Client_Opportunity__c: 'synthetic-A',
        Authorization__r: { Client_Opportunity_Record__c: 'synthetic-B' },
      },
      { ...base, Service_Name__c: 'Direct care' },
    ];
    for (const row of variants) {
      const state = assess([row]);
      expect(state.firstAssessment).toBeNull();
      expect(state.transitionSupported).toBe(false);
      expect(state.reviewReasons.length).toBeGreaterThan(0);
      const selected = selectBillingClaimAppointments({
        appointments: state.appointments,
        asOf: AS_OF,
      });
      expect(selected).toHaveLength(1);
      expect(selected[0]?.status).toBe('Review');
    }
  });

  it('distinguishes support sessions and inactive historical evidence from transition support', () => {
    const support = {
      ...record('97151', '2026-09-01', true),
      Billing_Code__c: '97152',
      Service_Name__c: 'Assessment Support',
    };
    expect(assess([support]).firstAssessment).toBeNull();
    const state = assess([
      record('97151', '2026-09-04', true),
      { ...support, Completed__c: 'No', Completed_Date__c: null },
    ]);
    expect(state.transitionSupported).toBe(false);
    expect(state.outstanding).toHaveLength(1);
    const inactive = assess([
      { ...record('97151', '2026-09-01', true), Appointment_Status__c: 'Inactive' },
    ]);
    expect(inactive.firstAssessment).not.toBeNull();
    expect(inactive.gaps).toEqual([]);
    expect(inactive.reviewReasons.join(' ')).toContain('inactive 97151');
  });

  it('requires explicit Active nonfuture direct-care completion and retains earliest service evidence', () => {
    const a = record('97153', '2026-09-01', true);
    const b = record('97153', '2026-09-04', true);
    for (const rows of [
      [a, b],
      [b, a],
    ])
      expect(assess(rows).firstTreatment?.serviceDate).toBe('2026-09-01');
    expect(assess([{ ...a, Billing_Code__c: null }]).firstTreatment).not.toBeNull();
    for (const row of [
      { ...a, Appointment_Status__c: 'Inactive' },
      { ...a, Completed__c: 'No', Completed_Date__c: null },
      { ...a, Appt_Date__c: '2026-09-15' },
    ]) {
      expect(assess([row]).firstTreatment).toBeNull();
    }
    expect(
      assess([a, b], { First_day_of_Treatment__c: '2026-09-04' }).reviewReasons.join(' ')
    ).toContain('differs from the earliest');
    expect(
      assess([a], {
        StageName: 'First Day of 97153 Scheduled',
        First_day_of_Treatment__c: '2026-09-01',
      }).reviewReasons.join(' ')
    ).toContain('verify the admission prerequisites');
    expect(
      assess([a], {
        First_day_of_Treatment__c: 'invalid',
        IA_Completed_Date__c: '2026-09-20',
      }).reviewReasons.filter((reason) => reason.includes('invalid or after'))
    ).toHaveLength(2);
  });

  it('retains a past unresolved session instead of hiding it behind a future one', () => {
    const rows = [record('97151', '2026-09-15'), record('97151', '2026-09-04')];
    const state = assess(rows);
    expect(state.firstAssessment).toBeNull();
    expect(state.nextScheduledAssessment).toBeNull();
    expect(state.pastUnverifiedAssessment?.serviceDate).toBe('2026-09-04');
    const selected = selectBillingClaimAppointments({
      appointments: state.appointments,
      asOf: AS_OF,
    });
    expect(selected.map((row) => row.serviceDate)).toEqual(['2026-09-15', '2026-09-04']);
    expect(
      selectBillingClaimAppointments({
        appointments: assess([rows[1] ?? record()]).appointments,
        asOf: AS_OF,
      })
    ).toHaveLength(1);
    const cancelled = assess([{ ...record(), Appointment_Status__c: 'Cancelled' }]);
    expect(
      selectBillingClaimAppointments({ appointments: cancelled.appointments, asOf: AS_OF })[0]
        ?.status
    ).toBe('Cancelled');
  });
});

describe('billing collection provenance', () => {
  const ids = ['006000000000001AAA', '006000000000002AAA'];
  const records: readonly BillingClaim[] = [
    {
      ...record(),
      Client_Opportunity__c: ids[0] ?? null,
      Authorization__r: { Client_Opportunity_Record__c: ids[1] ?? null },
    },
  ];
  const input = { records, opportunityIds: ids, cutoff: AS_OF };
  it('retains both relationship paths and does not add time, status or result limits', () => {
    const query = billingClaimsQuery(ids);
    expect(query).toContain('OR Authorization__r.Client_Opportunity_Record__c IN');
    expect(query).not.toMatch(/LAST_N_DAYS|TODAY|LIMIT|Appointment_Status__c =/);
    const groups = groupBillingClaims(records, ids);
    expect([...groups.values()].map((group) => group.length)).toEqual([1, 1]);
    expect([...groupBillingClaims([{}, ...records], ['other']).values()]).toEqual([[]]);
    const receipt = billingCollectionReceipt(input);
    expect(() => {
      assertBillingCollectionReceipt({ ...input, receipt });
    }).not.toThrow();
    for (const change of [{ receipt: null }, { records: [] }, { cutoff: '2026-09-12T00:00:00Z' }]) {
      expect(() => {
        assertBillingCollectionReceipt({ ...input, receipt, ...change });
      }).toThrow('refresh this source only');
    }
  });
  it('rejects incomplete relationship or identity evidence and invalid query inputs', () => {
    for (const invalid of [[], ["bad'query"], ['006short'], ['007000000000001AAA']])
      expect(() => billingClaimsQuery(invalid)).toThrow('explicit Salesforce Opportunity IDs');
    expect(billingClaimsQuery(['006000000000001'])).toContain("'006000000000001'");
    for (const rows of [
      [...records, ...records],
      [record()],
      [{ Client_Opportunity__c: null, Authorization__r: null }],
    ]) {
      expect(() => billingCollectionReceipt({ ...input, records: rows })).toThrow(
        'unique record identities or explicit relationship fields'
      );
    }
    expect(() => billingCollectionReceipt({ ...input, cutoff: 'invalid' })).toThrow();
  });
});
