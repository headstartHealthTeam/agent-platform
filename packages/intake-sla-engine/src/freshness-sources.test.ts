import { describe, expect, it } from 'vitest';

import { adaptBillingClaims } from './billing-evidence.js';
import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import type { FreshnessInput } from './freshness-source-types.js';

const opp = { Id: 'synthetic-opportunity', Name: 'Synthetic Example', StageName: 'IA Scheduled' };
const record = {
  Id: 'synthetic-record',
  Name: 'Synthetic record',
  CreatedDate: '2026-09-20',
  LastModifiedDate: '2026-09-22',
};
const asOf = '2026-09-24T12:00:00Z';
interface SourceCase {
  stage: string;
  input: Partial<FreshnessInput>;
  source: string;
  text: string;
  date: string;
}
describe('freshness routine source projections', () => {
  it('accepts the actual billing projection and preserves Date-valued evidence', () => {
    const events = adaptBillingClaims({
      profile: { opportunityId: opp.Id },
      opportunity: opp,
      records: [
        {
          Id: 'synthetic-billing',
          Appointment_ID__c: 'synthetic-appointment',
          Billing_Code__c: '97151',
          Service_Name__c: 'Assessment',
          CreatedDate: '2026-09-20T12:00:00Z',
          Appt_Date__c: '2026-09-22',
          Appointment_Status__c: 'Active',
          Completed__c: 'Yes',
          Completed_Date__c: '2026-09-22',
        },
      ],
      asOf,
      coverageComplete: true,
    });
    expect(events).toHaveLength(1);
    const linkedBillingClaims = events.map((event) => ({
      ...event,
      id: event.sourceRecordId,
      summary: event.text,
      evidenceDate: event.eventDate,
    }));
    const result = analyzeOpportunityFreshness({ opp, linkedBillingClaims, asOf });
    const dated = linkedBillingClaims.map((event) => ({
      ...event,
      evidenceDate: new Date(event.evidenceDate),
    }));
    const dateResult = analyzeOpportunityFreshness({
      opp,
      linkedBillingClaims: dated,
      asOf,
    });
    expect(result.evidence).toHaveLength(1);
    expect(dateResult.evidence).toHaveLength(1);
    expect(dateResult.evidence[0]?.eventDate).toBe(dated[0]?.evidenceDate.toISOString());
    expect(dated[0]?.evidenceDate).toBeInstanceOf(Date);
    expect(dateResult.latestUpdateAt).toEqual(result.latestUpdateAt);
  });
  it.each<SourceCase>([
    {
      stage: 'IA Requested',
      source: 'Authorization',
      text: 'Resubmitted after a prior denial',
      date: '2026-09-21',
      input: {
        auths: [
          {
            ...record,
            Auth_Status__c: 'Pending',
            Insurance_Determination__c: 'Pending',
            Treatment_Auth_Submission_Date__c: '2026-09-21',
            Notes__c: 'Prior denial recorded',
          },
        ],
      },
    },
    {
      stage: 'IA Requested',
      source: 'Authorization Review',
      text: 'Initial',
      date: '2026-09-20',
      input: {
        authReviews: [{ ...record, Authorization_Type__c: 'Initial', Review_Status__c: 'Pending' }],
      },
    },
    {
      stage: 'Insurance Verification',
      source: 'VOB',
      text: 'Fiction Payer',
      date: '2026-09-21',
      input: {
        vobs: [
          {
            ...record,
            Payor__r: { Name: 'Fiction Payer' },
            Verification_Status__c: 'Complete',
            Verification_Date__c: '2026-09-21',
          },
        ],
      },
    },
    {
      stage: 'Treatment Plan In-review',
      source: 'Clinical Quality',
      text: 'parent signed',
      date: '2026-09-22',
      input: {
        clinicalQuality: [
          {
            ...record,
            Parent_Signature_Date__c: '2026-09-21',
            Treatment_Plan_Status__c: 'In review',
          },
        ],
      },
    },
    {
      stage: 'TA Approved - Pending Scheduling',
      source: 'RBT Request',
      text: '0 screened; 2 active',
      date: '2026-09-22',
      input: {
        rbts: [
          {
            ...record,
            Recruiting_Launched_Status__c: 'Recruiting launched',
            Total_Screened_Candidates__c: 0,
            Active_Candidates__c: 2,
          },
        ],
      },
    },
    {
      stage: 'TA Approved - Pending Scheduling',
      source: 'Staffing',
      text: 'Active',
      date: '2026-09-21',
      input: {
        staffing: [
          {
            ...record,
            Status__c: 'Active',
            Billable_Start_Date__c: '2026-09-21',
            Supervising_Provider__r: { Name: 'Fiction Provider' },
          },
        ],
      },
    },
    {
      stage: 'TA Approved - Pending Scheduling',
      source: 'Candidate / Ticket Match',
      text: 'Hired',
      date: '2026-09-22',
      input: {
        ticketMatches: [
          {
            ...record,
            Candidate__c: 'candidate1',
            Ticket_Match_Status__c: 'Hired',
            Candidate__r: { Name: 'Fiction Candidate', Applicant_Status__c: 'Hired' },
          },
        ],
      },
    },
    {
      stage: 'TA Approved - Pending Scheduling',
      source: 'RBT First Interview',
      text: 'Completed',
      date: '2026-09-21',
      input: {
        firstInterviews: [
          {
            ...record,
            Date_of_First_Interview__c: '2026-09-21',
            Status__c: 'Completed',
            Interviewer__r: { Name: 'Fiction Interviewer' },
          },
        ],
      },
    },
    {
      stage: 'IA Scheduled',
      source: 'Aircall SMS',
      text: 'assessment scheduled',
      date: '2026-09-20',
      input: {
        aircalls: [
          {
            ...record,
            aircall__Message_Content__c: 'Family confirmed assessment scheduled for 9/25',
            aircall__SMS_Direction__c: 'Inbound',
          },
        ],
      },
    },
    {
      stage: 'IA Scheduled',
      source: 'Task update',
      text: 'assessment scheduled',
      date: '2026-09-20',
      input: {
        taskUpdates: [
          {
            ...record,
            TaskId: record.Id,
            TaskSubject: 'Assessment',
            Summary: 'Family confirmed assessment scheduled for 9/25',
          },
        ],
      },
    },
    {
      stage: 'IA Scheduled',
      source: 'Linked Billing / Claims',
      text: 'Scheduled',
      date: '2026-09-20',
      input: {
        linkedBillingClaims: [
          {
            ...record,
            billingCode: '97151',
            status: 'Scheduled',
            summary: 'Assessment scheduled for 9/25',
            serviceDate: '2026-09-25',
          },
        ],
      },
    },
  ])('retains $source dates and raw meaning in $stage', ({ stage, input, source, text, date }) => {
    const result = analyzeOpportunityFreshness({
      opp: { ...opp, StageName: stage },
      asOf,
      ...input,
    });
    const projected = result.evidence.find(
      (row) => row.source === source && row.eventDate === `${date}T00:00:00.000Z`
    );
    expect(projected?.rawText).toContain(text);
  });
  it('retains an approved authorization when the stage has moved to scheduling', () => {
    const result = analyzeOpportunityFreshness({
      opp,
      asOf,
      authorizationGate: {
        required: true,
        satisfied: true,
        phase: 'initial',
        approvalDate: '2026-09-22',
        recordId: 'auth1',
        payer: 'Fiction Payer',
        authorizationNumber: 'AUTH-123',
      },
    });
    expect(result.latestUpdateSource).toBe('Authorization');
    expect(result.latestUpdateSummary).toContain('AUTH-123');
    expect(result.latestUpdateFact).toContain('committed assessment date remains to be confirmed');
  });
  it('keeps unresolved authorization ahead of a later stage and limits VOB to its actual stage', () => {
    const result = analyzeOpportunityFreshness({
      opp,
      asOf,
      authorizationGate: { required: true, satisfied: false },
      vobs: [{ ...record, Verification_Date__c: '2026-09-22' }],
    });
    expect(result.stageFamily).toBe('insurance');
    expect(result.evidence).toEqual([]);
  });
  it('selects the active current candidate rather than a more recent rejected match', () => {
    const result = analyzeOpportunityFreshness({
      opp: { ...opp, StageName: 'TA Approved - Pending Scheduling' },
      asOf,
      ticketMatches: [
        {
          ...record,
          Id: 'hired',
          Ticket_Match_Status__c: 'Hired',
          Candidate__r: { Name: 'Fiction Candidate' },
        },
        {
          ...record,
          Id: 'rejected',
          Ticket_Match_Status__c: 'Rejected',
          LastModifiedDate: '2026-09-23',
        },
      ],
    });
    expect(result.evidence.map((row) => row.sourceRecordId)).toEqual(['hired']);
    expect(result.evidence[0]?.candidateActive).toBe(true);
  });
});
