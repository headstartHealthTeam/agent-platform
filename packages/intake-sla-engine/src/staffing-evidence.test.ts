import { describe, expect, it } from 'vitest';

import { adaptTalentAcquisition, adaptRbtFirstInterviews } from './candidate-evidence.js';
import {
  futureStaffingDate,
  staffingDisplayName,
  staffingRecordMatches,
} from './staffing-evidence-common.js';
import { adaptStaffing } from './staffing-evidence.js';

const profile = { opportunityId: 'synthetic-opportunity', currentCsm: { name: 'Synthetic CSM' } };
const context = { profile, gate: { gateCategory: 'rbt' }, asOf: '2026-09-23T17:00:00Z' };
const linked = { Id: 'synthetic-record', Client_Opportunity__c: profile.opportunityId };
describe('staffing record selection', () => {
  it('retains all direct linkage fields and candidate mapping precedence', () => {
    for (const key of [
      'Client_Opportunity_Record__c',
      'Client_Opportunity__c',
      'Opportunity__c',
      'WhatId',
    ]) {
      expect(staffingRecordMatches({ [key]: profile.opportunityId }, profile.opportunityId)).toBe(
        true
      );
    }
    const candidateToOpportunity = new Map([['candidate', profile.opportunityId]]);
    expect(
      staffingRecordMatches(
        { Candidate__c: 'candidate' },
        profile.opportunityId,
        candidateToOpportunity
      )
    ).toBe(true);
    expect(
      staffingRecordMatches(
        { Candidate__c: 'other', Talent_Acquisition__c: 'candidate' },
        profile.opportunityId,
        candidateToOpportunity
      )
    ).toBe(false);
    expect(
      staffingRecordMatches({ Id: 'candidate' }, profile.opportunityId, candidateToOpportunity)
    ).toBe(true);
    expect(
      staffingRecordMatches(
        {},
        profile.opportunityId,
        new Map([[undefined, profile.opportunityId]])
      )
    ).toBe(true);
    expect(
      staffingRecordMatches({}, profile.opportunityId, new Map([[null, profile.opportunityId]]))
    ).toBe(false);
    expect(
      staffingRecordMatches(
        { Id: null },
        profile.opportunityId,
        new Map([[null, profile.opportunityId]])
      )
    ).toBe(true);
    expect(staffingRecordMatches({}, profile.opportunityId, null)).toBe(false);
  });
  it('preserves display-name and invalid-date behavior without inventing availability', () => {
    expect(staffingDisplayName('  synthetic provider  ')).toBe('Synthetic Provider');
    expect(staffingDisplayName('Synthetic McTest')).toBe('Synthetic McTest');
    expect(staffingDisplayName()).toBe('');
    expect(staffingDisplayName(null)).toBe('Null');
    for (const date of [undefined, null, '', 'invalid', '2026-09-23', '2026-09-22'])
      expect(futureStaffingDate(date, context.asOf)).toBe(false);
    expect(futureStaffingDate('2026-09-24', context.asOf)).toBe(true);
    expect(futureStaffingDate('2026-09-24', 'invalid')).toBe(false);
  });
  it('does not produce unrelated or irrelevant evidence', () => {
    for (const adapter of [adaptStaffing, adaptTalentAcquisition, adaptRbtFirstInterviews]) {
      expect(adapter({ ...context, records: [{ Id: 'unrelated' }] })).toEqual([]);
      expect(adapter(context)).toEqual([]);
      expect(
        adapter({ ...context, gate: { gateCategory: 'insurance' }, records: [linked] })
      ).toEqual([]);
    }
  });
});
describe('staffing evidence', () => {
  it('routes inactive staffing for replacement even with a recorded planned start', () => {
    expect(
      adaptStaffing({
        ...context,
        profile: { ...profile, currentCsm: { name: 123 } },
        records: [
          {
            ...linked,
            Name__c: 'synthetic rbt',
            Status__c: 'Active',
            In_active_Date__c: '2026-09-21',
            First_Billable_Date__c: '2026-09-25',
            Notes__c: '<p>Replacement needed</p>',
          },
        ],
      })[0]
    ).toMatchObject({
      text: 'Synthetic Rbt is no longer an active staffing path; replacement coverage and a new start date are not confirmed.',
      actionOwner: 'RBT Team',
      actionType: 'RBT Follow-Up',
      eventDate: '2026-09-21T00:00:00.000Z',
      milestoneDate: null,
      rawText: 'Replacement needed',
    });
  });
  it('keeps an active planned start as monitoring and an undated assignment unconfirmed', () => {
    expect(
      adaptStaffing({
        ...context,
        records: [{ ...linked, Name: 'Synthetic RBT', Billable_Start_Date__c: '2026-09-25' }],
      })[0]
    ).toMatchObject({
      actionType: 'Monitor',
      factType: 'treatment-start-planned',
      milestoneDate: '2026-09-25',
      followUpDate: '2026-09-25',
      actionOwner: 'Synthetic CSM',
    });
    expect(adaptStaffing({ ...context, records: [linked] })[0]).toMatchObject({
      text: 'Assigned RBT has a status not recorded staffing record, but no billable start or first 97153 date is recorded.',
      actionType: 'Provider Outreach',
      factType: 'rbt-assigned',
      eventDate: context.asOf,
    });
  });
});
describe('candidate evidence', () => {
  it('does not turn earliest candidate availability into a committed client milestone', () => {
    expect(
      adaptTalentAcquisition({
        ...context,
        records: [
          {
            ...linked,
            Name__c: 'Synthetic Candidate',
            Applicant_Status__c: 'Offer accepted',
            Earliest_Start_Date__c: '2026-09-25',
            Date_Applied__c: '2026-09-15',
            BCBA_Student_Notes__c: '<p>Background details</p>',
          },
        ],
      })[0]
    ).toMatchObject({
      text: 'As of 2026-09-15, Synthetic Candidate has reached offer accepted and reported earliest availability of 2026-09-25, but a confirmed client assignment and first 97153 date are not recorded.',
      milestoneDate: null,
      followUpDate: null,
      candidateName: 'Synthetic Candidate',
      candidateActive: true,
      factType: 'rbt-assigned',
      rawText: 'Background details',
    });
  });
  it('preserves rejected priority, unnamed-candidate state and ordinary progress', () => {
    expect(
      adaptTalentAcquisition({
        ...context,
        records: [
          {
            ...linked,
            Name: 'Synthetic Candidate',
            Applicant_Status__c: 'Hired',
            Rejection_Reason__c: 'Withdrawn',
          },
        ],
      })[0]
    ).toMatchObject({ factType: 'rbt-lost', candidateActive: false, processRelevance: 9 });
    expect(
      adaptTalentAcquisition({
        ...context,
        records: [
          {
            ...linked,
            Applicant_First_Name__c: 'Synthetic',
            Applicant_Last_Name__c: 'Candidate',
            Applicant_Status__c: 'Interview',
            Earliest_Start_Date__c: '2026-09-25',
          },
        ],
      })[0]
    ).toMatchObject({
      factType: 'rbt-candidate',
      candidateName: 'Synthetic Candidate',
      processRelevance: 8,
    });
    expect(adaptTalentAcquisition({ ...context, records: [linked] })[0]).toMatchObject({
      candidateName: null,
      candidateActive: null,
    });
  });
  it('keeps planned interviews on their known dates and excludes that future date from event freshness', () => {
    const candidateToOpportunity = new Map([['candidate', profile.opportunityId]]);
    expect(
      adaptRbtFirstInterviews({
        ...context,
        candidateToOpportunity,
        records: [
          {
            Id: 'interview',
            Candidate__c: 'candidate',
            Candidate__r: { Name: 'Synthetic Candidate' },
            Date_of_First_Interview__c: '2026-09-25',
            CreatedDate: '2026-09-20',
            Status__c: 'Scheduled',
          },
        ],
      })[0]
    ).toMatchObject({
      text: "Synthetic Candidate's first interview is planned for 2026-09-25 with status scheduled; the interview outcome and staffing decision remain unconfirmed.",
      actionType: 'Monitor',
      followUpDate: '2026-09-25',
      milestoneDate: '2026-09-25',
      eventDate: '2026-09-20T00:00:00.000Z',
      candidateActive: true,
    });
  });
  it('retains past interview outcomes and inactive candidate flags', () => {
    expect(
      adaptRbtFirstInterviews({
        ...context,
        records: [
          {
            ...linked,
            Candidate_Name__c: 'Synthetic Candidate',
            Date_of_First_Interview__c: '2026-09-20',
            Recommendation_for_Hire__c: 'Declined',
            Important_Notes__c: '<p>Outcome</p>',
          },
        ],
      })[0]
    ).toMatchObject({
      actionType: 'RBT Follow-Up',
      followUpDate: null,
      candidateActive: false,
      candidateStep: 'first interview - Declined',
      rawText: 'Outcome',
    });
    expect(adaptRbtFirstInterviews({ ...context, records: [linked] })[0]).toMatchObject({
      candidateName: null,
      candidateActive: null,
      eventDate: context.asOf,
    });
  });
});
