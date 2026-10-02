import { describe, expect, it } from 'vitest';

import { selectCurrentCandidateMatch } from './candidate-match.js';
import { adaptTicketMatches, type TicketMatchEvidenceRecord } from './ticket-match-evidence.js';

const context = {
  profile: { opportunityId: 'synthetic-opportunity' },
  gate: { gateCategory: 'rbt' },
  asOf: '2026-09-23T17:00:00Z',
  requestToOpportunity: new Map([['request', 'synthetic-opportunity']]),
};
const linked = {
  Id: 'match',
  RBT_Request__c: 'request',
  Candidate__c: 'candidate',
  CreatedDate: '2026-09-17',
};
describe('Ticket Match evidence', () => {
  it('reuses typed candidate selection with explicit undefined source fields', () => {
    const records: readonly TicketMatchEvidenceRecord[] = [
      {
        ...linked,
        Ticket_Match_Status__c: undefined,
        Candidate__r: { Name: 'Synthetic Candidate', Applicant_Status__c: undefined },
      },
    ];
    const selected = selectCurrentCandidateMatch(records);
    expect(selected).toBe(records[0]);
    expect(adaptTicketMatches({ ...context, records: selected ? [selected] : [] })).toHaveLength(2);
  });
  it('preserves request linkage, gate relevance and empty results', () => {
    expect(adaptTicketMatches(context)).toEqual([]);
    expect(adaptTicketMatches({ ...context, records: [{ Id: 'other' }] })).toEqual([]);
    expect(
      adaptTicketMatches({ ...context, gate: { gateCategory: 'insurance' }, records: [linked] })
    ).toEqual([]);
  });
  it('does not claim a future rescheduled interview has occurred', () => {
    const events = adaptTicketMatches({
      ...context,
      records: [{ ...linked, Candidate__r: { Name: 'Synthetic Candidate' } }],
      firstInterviews: [
        {
          Id: 'interview',
          Candidate__c: 'candidate',
          Date_of_First_Interview__c: '2026-09-25',
          Status__c: 'Rescheduled',
          LastModifiedDate: '2026-09-20',
        },
      ],
    });
    expect(events.map((event) => event.source)).toEqual([
      'Ticket Match',
      'Talent Acquisition',
      'RBT First Interview',
    ]);
    expect(
      events.every((event) => new Date(event.eventDate).valueOf() <= Date.parse(context.asOf))
    ).toBe(true);
    expect(JSON.stringify(events)).not.toContain('reached first interview');
    expect(events[0]?.text).toBe(
      "Synthetic Candidate's first interview is planned for 2026-09-25; the interview outcome, staffing decision, and start date remain unconfirmed."
    );
    expect(events[2]).toMatchObject({
      actionType: 'Monitor',
      milestoneDate: '2026-09-25',
      followUpDate: '2026-09-25',
      candidateStep: 'first interview - Rescheduled',
    });
  });
  it('preserves different active match and applicant statuses instead of hiding either', () => {
    const events = adaptTicketMatches({
      ...context,
      records: [
        {
          ...linked,
          Ticket_Match_Status__c: 'Proposed',
          Candidate__r: { Name: 'Synthetic Candidate', Applicant_Status__c: 'Screening' },
          Interview_Notes__c: '<p>Match note</p>',
        },
      ],
      firstInterviews: [
        {
          Id: 'interview',
          Candidate__c: 'candidate',
          Date_of_First_Interview__c: '2026-09-25',
          Important_Notes__c: 'Interview note',
        },
      ],
    });
    expect(events[0]).toMatchObject({
      text: 'As of 2026-09-17, Synthetic Candidate is proposed to the provider while the candidate record remains at screening; the staffing decision and expected start date are not recorded.',
      rawText: 'Match note Interview note',
      candidateStep: 'Proposed; Screening',
    });
  });
  it('retains rejected priority and the original hired relevance precedence on conflicting records', () => {
    const events = adaptTicketMatches({
      ...context,
      records: [
        {
          ...linked,
          Ticket_Match_Status__c: 'Hired',
          Candidate__r: { Name: 'Synthetic Candidate', Applicant_Status__c: 'Declined' },
        },
      ],
    });
    expect(events[0]).toMatchObject({
      candidateActive: false,
      factType: 'rbt-lost',
      processRelevance: 10,
      candidateStep: 'Hired; Declined',
    });
    expect(events[0]?.text).toContain('no longer an active staffing path');
    expect(events[1]?.text).toContain('this is not an active staffing path');
  });
  it('deduplicates status text case-insensitively and keeps selected candidates short of first service', () => {
    const events = adaptTicketMatches({
      ...context,
      records: [
        {
          ...linked,
          Ticket_Match_Status__c: 'Matched',
          Candidate__r: { Name: 'Synthetic Candidate', Applicant_Status__c: 'matched' },
          Reason_for_Decline__c: '',
          Rejection_Reason__c: null,
        },
      ],
    });
    expect(events[0]).toMatchObject({
      text: 'As of 2026-09-17, Synthetic Candidate is matched, but the first 97153 date is not recorded.',
      candidateStep: 'Matched',
      factType: 'rbt-assigned',
      milestoneDate: null,
    });
  });
  it('retains latest-interview selection and distinct direct event-date precedence', () => {
    const events = adaptTicketMatches({
      ...context,
      records: [{ ...linked, Ticket_Match_Status__c: 'Interview' }],
      firstInterviews: [
        {
          Id: 'old',
          Candidate__c: 'candidate',
          LastModifiedDate: '2026-09-18',
          Date_of_First_Interview__c: '2026-09-15',
        },
        {
          Id: 'new',
          Candidate__c: 'candidate',
          LastModifiedDate: '2026-09-22',
          Date_of_First_Interview__c: '2026-09-20',
          Status__c: 'Complete',
        },
      ],
    });
    expect(events[0]).toMatchObject({
      eventDate: '2026-09-22T00:00:00.000Z',
      candidateStep: 'first interview - Complete',
    });
    expect(events[1]).toMatchObject({
      sourceRecordId: 'new',
      eventDate: '2026-09-20',
      actionType: 'RBT Follow-Up',
      milestoneDate: null,
      candidateName: null,
      candidateActive: null,
    });
    expect(events[1]?.text).toBe(
      'On 2026-09-20, The linked candidate reached first interview with status complete; the staffing decision and expected start date remain unconfirmed.'
    );
  });
  it('preserves first retention when an existing interview timestamp is invalid', () => {
    const events = adaptTicketMatches({
      ...context,
      records: [linked],
      firstInterviews: [
        { Id: 'first', Candidate__c: 'candidate', CreatedDate: 'invalid' },
        { Id: 'later', Candidate__c: 'candidate', CreatedDate: '2026-09-22' },
      ],
    });
    expect(events[1]?.sourceRecordId).toBe('first');
    expect(events[1]?.candidateStep).toBe('first interview');
    expect(adaptTicketMatches({ ...context, records: [linked] })[0]?.text).toBe(
      'As of 2026-09-17, The linked candidate is at candidate linked; the next candidate milestone is not recorded.'
    );
  });
});
