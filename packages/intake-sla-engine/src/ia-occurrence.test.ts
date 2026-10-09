import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeBillingClaimAppointments } from './billing-normalization.js';
import type { BillingClaim } from './billing-types.js';
import type { AssessmentProviderEvent, IaOccurrenceInput } from './ia-occurrence-types.js';
import { resolveIaOccurrence } from './ia-occurrence.js';

const AS_OF = '2026-09-11T17:31:07.000Z';
const appointment = { qualifyingAssessment: true, status: 'Active', serviceDate: '2026-09-15' };
const claim: BillingClaim = {
  Id: 'synthetic-claim',
  CreatedDate: '2026-09-01',
  Billing_Code__c: '97151',
  Appt_Date__c: '2026-09-01',
  Appointment_Status__c: 'Active',
  Completed__c: 'Yes',
};
const resolve = (input: IaOccurrenceInput = {}): ReturnType<typeof resolveIaOccurrence> =>
  resolveIaOccurrence({ asOf: AS_OF, ...input });
const normalized = (
  records: readonly BillingClaim[]
): ReturnType<typeof normalizeBillingClaimAppointments> =>
  normalizeBillingClaimAppointments(records, { asOf: AS_OF });
const provider: AssessmentProviderEvent = {
  kind: 'IA_PLANNED',
  matchQuality: 'Direct',
  eventDate: '2026-09-10',
  plannedDate: '2026-09-15',
};
afterEach(() => {
  vi.useRealTimers();
});

describe('assessment occurrence preserves evidence meaning', () => {
  it('keeps missing, recorded start, future schedule and elapsed schedule distinct', () => {
    expect(resolve()).toEqual({
      completionState: 'No Committed IA Milestone',
      plannedMilestone: null,
      evidenceQuality: 'Missing',
      readyToCopy: 'Review',
      actionType: 'Provider Outreach',
      owner: 'CSM',
      followUpDate: '2026-09-14',
      reason: 'No committed IA date or completion evidence was found.',
    });
    for (const opportunity of [
      { iaCompletedDate: '2026-09-01' },
      { IA_Completed_Date__c: '2026-09-01' },
    ]) {
      expect(resolve({ opportunity })).toMatchObject({
        completionState: 'Assessment Start Recorded',
        actionType: 'Monitor',
        readyToCopy: 'Review',
      });
    }
    expect(resolve({ opportunity: { iaScheduledFor: '2026-09-15' } })).toMatchObject({
      completionState: 'Scheduled',
      plannedMilestone: '2026-09-15',
      followUpDate: '2026-09-15',
      actionType: 'Monitor',
      readyToCopy: 'Yes',
    });
    expect(resolve({ opportunity: { iaScheduledFor: '2026-09-01' } })).toMatchObject({
      completionState: 'Planned Date Passed - Completion Unconfirmed',
      plannedMilestone: '2026-09-01',
      followUpDate: '2026-09-14',
      readyToCopy: 'Review',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(AS_OF));
    expect(resolveIaOccurrence({})).toEqual(resolve());
  });

  it('does not turn a completed session plus future work into a completed assessment', () => {
    const future = { ...claim, Id: 'future', Appt_Date__c: '2026-09-15', Completed__c: 'No' };
    for (const opportunity of [
      { stage: 'IA Scheduled' },
      { stage: 'IA Scheduled', iaCompletedDate: '2026-09-01' },
    ]) {
      const result = resolve({
        opportunity,
        billingClaimAppointments: normalized([claim, future]),
        billingCoverageComplete: true,
      });
      expect(result).toMatchObject({
        completionState: 'Assessment Sessions Outstanding',
        plannedMilestone: '2026-09-15',
        actionType: 'Monitor',
        followUpDate: '2026-09-15',
        readyToCopy: 'Yes',
      });
      expect(result.reason).not.toMatch(/remaining client-facing|stage.*wrong|gate is resolved/);
    }
    expect(
      resolve({ billingClaimAppointments: normalized([future]), billingCoverageComplete: true })
        .completionState
    ).toBe('Scheduled');
  });

  it('preserves incomplete past sessions and concrete billing conflicts as review exceptions', () => {
    const past = { ...claim, Completed__c: 'No' };
    const future = { ...past, Id: 'future', Appt_Date__c: '2026-09-15' };
    expect(
      resolve({
        billingClaimAppointments: normalized([past, future]),
        billingCoverageComplete: true,
      })
    ).toMatchObject({
      completionState: 'Assessment Sessions Outstanding',
      actionType: 'Provider Outreach',
      readyToCopy: 'Review',
      plannedMilestone: null,
    });
    expect(
      resolve({
        billingClaimAppointments: normalized([claim]),
        billingCoverageComplete: true,
        opportunity: { stage: 'IA Scheduled' },
      })
    ).toMatchObject({
      completionState: 'Billing Reconciliation Review',
      actionType: 'Salesforce Update',
      readyToCopy: 'Review',
    });
    expect(
      resolve({ billingClaimAppointments: normalized([claim]), billingCoverageComplete: false })
    ).toMatchObject({ completionState: 'Billing Reconciliation Review' });
    expect(
      resolve({
        billingClaimAppointments: normalized([future]),
        billingCoverageComplete: true,
        opportunity: { IA_Scheduling_Status__c: 'Assessment Completed' },
      }).reason
    ).toContain('conflicts with an incomplete active assessment');
  });

  it('never replaces filtered billing records with a different appointment source', () => {
    const later = normalized([claim]).map((row) => ({ ...row, createdDate: '2026-09-12' }));
    expect(
      resolve({ billingClaimAppointments: later, alohaAppointments: [appointment] }).completionState
    ).toBe('No Committed IA Milestone');
  });

  it('retains completed historical appointment evidence without asserting lifecycle completion', () => {
    const completed = { ...appointment, status: 'Completed', serviceDate: '2026-09-01' };
    const result = resolve({
      alohaAppointments: [{ ...completed, serviceDate: '2026-09-10' }, completed],
    });
    expect(result).toMatchObject({
      completionState: 'Completed Assessment Session - Lifecycle Verification Required',
      owner: 'Intake Ops',
      actionType: 'Salesforce Update',
      readyToCopy: 'Review',
    });
    expect(result.reason).toContain('on 2026-09-01, not whole-assessment completion');
    expect(
      resolve({ alohaAppointments: [{ ...completed, source: 'Synthetic appointments' }] }).reason
    ).toContain('Synthetic appointments confirms');
    expect(
      resolve({ alohaAppointments: [{ ...completed, serviceDate: '2026-09-15' }] }).completionState
    ).toBe('No Committed IA Milestone');
  });

  it('keeps provider-reported completion subject to verification and uses the newest report', () => {
    const report = {
      ...provider,
      kind: 'IA_REPORTED_COMPLETED',
      reportedOccurrenceDate: '2026-09-09',
    };
    const result = resolve({
      providerEvents: [
        { ...report, eventDate: '2026-09-01', reportedOccurrenceDate: '2026-09-01' },
        report,
      ],
      alohaAppointments: [appointment],
    });
    expect(result).toMatchObject({
      completionState: 'Likely Completed - Verification Required',
      evidenceQuality: 'Likely',
      actionType: 'Salesforce Update',
      readyToCopy: 'Review',
    });
    expect(result.reason).toContain('on 2026-09-09');
    expect(
      resolve({
        providerEvents: [
          { kind: 'IA_REPORTED_COMPLETED', eventDate: '2026-09-10', matchQuality: 'Likely' },
        ],
      }).reason
    ).toContain('on 2026-09-10');
    expect(
      resolve({ providerEvents: [{ ...report, matchQuality: 'Weak', plannedDate: null }] })
        .completionState
    ).toBe('No Committed IA Milestone');
  });

  it('monitors the earliest structured schedule or the newest qualifying provider commitment', () => {
    expect(
      resolve({ alohaAppointments: [{ ...appointment, serviceDate: '2026-09-20' }, appointment] })
    ).toMatchObject({
      completionState: 'Scheduled',
      followUpDate: '2026-09-15',
      evidenceQuality: 'Direct',
    });
    expect(
      resolve({ alohaAppointments: [{ ...appointment, source: 'Synthetic appointments' }] }).reason
    ).toContain('Synthetic appointments shows');
    expect(
      resolve({
        providerEvents: [
          { ...provider, eventDate: '2026-09-01', plannedDate: '2026-09-12' },
          provider,
        ],
      })
    ).toMatchObject({
      completionState: 'Provider Plan',
      plannedMilestone: '2026-09-15',
      followUpDate: '2026-09-15',
      evidenceQuality: 'Likely',
    });
    expect(resolve({ providerEvents: [{ ...provider, plannedDate: null }] }).completionState).toBe(
      'No Committed IA Milestone'
    );
  });

  it('does not infer completion from an elapsed plan or erase its source quality', () => {
    const past = { ...appointment, serviceDate: '2026-09-01' };
    expect(
      resolve({ alohaAppointments: [{ ...past, serviceDate: '2026-08-01' }, past] })
    ).toMatchObject({
      completionState: 'Planned Date Passed - Completion Unconfirmed',
      plannedMilestone: '2026-09-01',
      evidenceQuality: 'Direct',
      actionType: 'Provider Outreach',
    });
    expect(resolve({ providerEvents: [{ ...provider, plannedDate: '2026-09-02' }] })).toMatchObject(
      { plannedMilestone: '2026-09-02', evidenceQuality: 'Likely', readyToCopy: 'Review' }
    );
    expect(resolve({ alohaAppointments: [{}] }).completionState).toBe('No Committed IA Milestone');
  });
});
