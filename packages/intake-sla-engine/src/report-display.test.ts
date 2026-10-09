import { describe, expect, it } from 'vitest';

import type { ReportCandidateMatch } from './report-display-types.js';
import {
  reportClean,
  reportFitCompleteThought,
  reportGroupBy,
  reportLatestDate,
  reportNonNegativeDaysOnHold,
  reportOperationalText,
  reportPlainText,
  reportPreferred,
  reportShortDate,
  reportTimestamp,
  reportTruncate,
} from './report-display-values.js';
import { reportCandidateSummary, reportRbtSummary } from './report-staffing-summaries.js';
import {
  reportAuthorizationReviewSummary,
  reportAuthorizationSummary,
  reportClinicalQualitySummary,
  reportVobSummary,
} from './report-structured-summaries.js';

describe('approved report display values', () => {
  it('keeps display coercion and HTML decoding distinct from evidence normalization', () => {
    expect([null, undefined, {}, [], 0, false, Symbol('s')].map(reportClean)).toEqual([
      '',
      '',
      '',
      '',
      '0',
      'false',
      'Symbol(s)',
    ]);
    expect(reportPlainText('<p>A&nbsp;&amp; B</p> &lt;C&gt;')).toBe('A & B &lt;C&gt;');
    expect(reportTruncate('  a\n🛑🛑🛑 end ', 6)).toBe('a 🛑...');
    expect(reportPreferred('', null)).toBeNull();
    expect(reportPreferred(false, 0)).toBe(0);
    expect(reportPreferred(undefined, '')).toBe('');
  });
  it('uses valid latest dates and preserves source fallback and UTC display', () => {
    expect(reportLatestDate(null, '', 'bad', '2026-09-04', '2026-09-03')).toBe(
      '2026-09-04T00:00:00.000Z'
    );
    expect(reportLatestDate()).toBe('');
    expect(reportLatestDate(new Date('2026-09-04'))).toBe('2026-09-04T00:00:00.000Z');
    expect(reportShortDate('2026-09-04T23:30:00-04:00')).toBe('9/5');
    expect(reportShortDate('bad')).toBe('');
    expect(reportShortDate(0)).toBe('');
    expect(reportTimestamp('')).toBe(0);
  });
  it('retains zero stored holds, rejects negative counts and bounds elapsed days', () => {
    const asOf = new Date('2026-09-10T12:00:00Z');
    expect(
      reportNonNegativeDaysOnHold({ Current_Days_on_Hold__c: 0, Total_Days_on_Hold__c: 8 }, asOf)
    ).toBe(0);
    expect(
      reportNonNegativeDaysOnHold(
        { Current_Days_on_Hold__c: -1, On_Hold_Start_Date__c: '2026-09-08' },
        asOf
      )
    ).toBe(2);
    expect(reportNonNegativeDaysOnHold({ On_Hold_Start_Date__c: '2026-09-20' }, asOf)).toBe(0);
    expect(reportNonNegativeDaysOnHold({ On_Hold_Start_Date__c: 'bad' }, asOf)).toBe('');
    expect(reportNonNegativeDaysOnHold({}, asOf)).toBe('');
    expect(
      reportNonNegativeDaysOnHold(
        { Current_Days_on_Hold__c: null, Total_Days_on_Hold__c: null },
        asOf
      )
    ).toBe(0);
  });
  it('groups nonempty identity values without altering records or order', () => {
    const rows = [
      { id: 'a', value: 1 },
      { id: '', value: 2 },
      { id: 'a', value: 3 },
    ];
    const before = structuredClone(rows);
    expect([...reportGroupBy(rows, (row) => row.id)]).toEqual([['a', [rows[0], rows[2]]]]);
    expect(rows).toEqual(before);
  });
  it('keeps the report wording normalization separate from lowercase match text', () => {
    expect(reportOperationalText(' (LF) Awaiting Ins Approval | doesnt want this...')).toBe(
      "Awaiting insurance approval; doesn't want this..."
    );
    expect(reportFitCompleteThought('Ready for review', 120)).toBe('Ready for review.');
    expect(reportFitCompleteThought('Ready. More details here.', 10)).toBe('Ready.');
    expect(reportFitCompleteThought('Waiting for', 100)).toBe(
      'Waiting for status remains unresolved.'
    );
    expect(reportFitCompleteThought('🛑'.repeat(30), 10)).toBe('🛑🛑🛑🛑\ud83d.');
  });
});

describe('structured source display summaries', () => {
  it('preserves each source-specific empty result', () => {
    expect(
      [
        reportAuthorizationSummary([]),
        reportAuthorizationReviewSummary([]),
        reportVobSummary([]),
        reportClinicalQualitySummary([]),
        reportRbtSummary([], []),
        reportCandidateSummary([], []),
      ].map((result) => [result.text, result.quality, result.best])
    ).toEqual([
      ['No Authorization rows found', 'Not found', ''],
      ['No Authorization Review rows found', 'Not found', ''],
      ['No VOB rows found', 'Not found', ''],
      ['No Clinical Quality rows found', 'Not found', ''],
      ['No RBT Request/Staffing rows found', 'Not found', ''],
      ['No linked candidate/interview rows found', 'Not found', ''],
    ]);
  });
  it('selects the authorization latest across its date fields and retains raw notes display', () => {
    const records = [
      { Id: 'old', Name: 'Old', LastModifiedDate: '2026-09-01' },
      {
        Id: 'new',
        Name: '',
        Authorization_Type__c: 'Treatment',
        Auth_Status__c: 'Pending',
        Insurance_Determination__c: 'Review',
        Client_Insurance__c: 'Coverage',
        Authorization_Number__c: 'A-1',
        Treatment_Auth_Submission_Date__c: '2026-09-03',
        Treatment_Auth_Approval_Date__c: '2026-09-04',
        Denial_Reason__c: 'Documents',
        Denial_Reason_Explanation__c: 'Missing details',
        Notes__c: '<p>Keep raw markup here</p>',
      },
    ];
    const before = structuredClone(records);
    expect(reportAuthorizationSummary(records)).toEqual({
      quality: 'Direct',
      best: 'new',
      text: 'Treatment; Pending; Review; Coverage; auth A-1; TA submitted 2026-09-03; TA approved 2026-09-04; denial Documents; denial note Missing details; notes <p>Keep raw markup here</p>',
    });
    expect(records).toEqual(before);
    expect(reportAuthorizationSummary([{}]).best).toBeUndefined();
  });
  it('uses VOB entered-date priority rather than the largest date on a row', () => {
    const records = [
      {
        Name: 'Later modified',
        Verification_Date_Entered_At__c: '2026-09-01',
        LastModifiedDate: '2026-09-10',
      },
      {
        Id: 'vob',
        Name: 'Current',
        Verification_Date_Entered_At__c: '2026-09-03',
        Verification_Date__c: '2026-09-02',
        Provider_Contacted_Date__c: '2026-09-04',
        Payor__r: { Name: 'Payer' },
        Verification_Status__c: 'Completed',
        Eligibility_Status__c: 'Active',
        Notes__c: '<p>Verified&nbsp;&amp; recorded</p>',
      },
    ];
    expect(reportVobSummary(records)).toEqual({
      text: 'Current; Payer; Completed; Active; verified 2026-09-02; provider contacted 2026-09-04; notes Verified & recorded',
      quality: 'Direct',
      best: 'Current',
    });
  });
  it('displays only two authorization reviews and preserves submission-date priority', () => {
    const records = [
      {
        Id: 'old',
        Initial_Auth_Submission_Date__c: '2026-09-01',
        Treatment_Auth_Approval_Date__c: '2026-10-01',
      },
      {
        Id: 'first',
        Name: 'Review',
        Initial_Auth_Submission_Date__c: '2026-09-04',
        Authorization_Type__c: 'Initial',
        Review_Status__c: 'Checked',
        Auth_Status__c: 'Pending',
        Insurance_Determination__c: 'Review',
        Authorization_Number__c: 'I-1',
        Notes__c: '<p>Details</p>',
      },
      { Id: 'second', CreatedDate: '2026-09-03' },
    ];
    expect(reportAuthorizationReviewSummary(records)).toEqual({
      text: 'Review; Initial; Checked; Pending; Review; submitted 2026-09-04; auth I-1; notes Details |',
      quality: 'Direct',
      best: 'Review',
    });
  });
  it('uses latest clinical milestone and retains all selected status details', () => {
    expect(
      reportClinicalQualitySummary([
        { Name: 'Old', CreatedDate: '2026-09-01' },
        {
          Id: 'cq',
          Treatment_Plan_Status__c: 'Review',
          TS_In_Review__c: '2026-09-02T12:00:00Z',
          TS_Edits_Sent_for_Review__c: '2026-09-03',
          Provider_Signature_Date__c: '2026-09-04',
          Parent_Signature_Date__c: '2026-09-05',
          Treatment_Barriers_Notes__c: '<p>Barrier</p>',
          Signatures_Notes__c: 'Signature &amp; note',
        },
      ])
    ).toEqual({
      text: 'Review; in review 2026-09-02; edits sent 2026-09-03; provider signed 2026-09-04; parent signed 2026-09-05; barriers Barrier; signature notes Signature & note',
      quality: 'Direct',
      best: 'cq',
    });
  });
  it('keeps newest two requests/staff rows while best remains the original first name', () => {
    const requests = [
      { Name: 'First', CreatedDate: '2026-09-01' },
      {
        Name: 'Newest',
        CreatedDate: '2026-09-04',
        Recruiting_Launched_Status__c: 'Open',
        RBT_Recruitment_Funnel__c: 'Matched',
        RBT_Assigned__r: { Name: 'RBT' },
        RBT_Start_Date__c: '2026-09-08',
        Est_Care_Start_Date__c: '2026-09-09',
        Date_Closed__c: '2026-09-05',
        Request_Cancellation_Reason__c: 'Replaced',
      },
      { Name: 'Middle', CreatedDate: '2026-09-02' },
    ];
    const result = reportRbtSummary(requests, [
      {
        Name: 'Staff',
        Status__c: 'Active',
        Billable_Start_Date__c: '2026-09-10',
        Supervising_Provider__r: { Name: 'BCBA' },
        Notes__c: 'Note',
      },
    ]);
    expect(result.best).toBe('First');
    expect(result.text).toBe(
      'Newest; Open; Matched; assigned RBT; start 2026-09-08; est 2026-09-09; closed 2026-09-05; cancel Replaced | Middle | Staff; Active; billable 2026-09-10; supervisor BCBA; notes Note'
    );
  });
  it('ranks active matches first and selects embedded or newest linked interview without mutation', () => {
    const matches: ReportCandidateMatch[] = [
      {
        Ticket_Match_Status__c: 'Rejected',
        LastModifiedDate: '2026-10-01',
        Candidate__r: { Name: 'Rejected' },
      },
      {
        Candidate__c: 'c',
        Ticket_Match_Status__c: 'Hired',
        Candidate__r: {
          Name: 'Leading',
          Applicant_Status__c: 'Active',
          Earliest_Start_Date__c: '2026-09-10',
          Notes__c: '<p>Candidate detail</p>',
        },
        Provider_Notes__c: '<p>Provider detail</p>',
        Interview_Notes__c: 'Match detail',
      },
    ];
    const interviews = [
      { Candidate__c: 'c', Date_of_First_Interview__c: '2026-09-01', Status__c: 'Old' },
      {
        Candidate__c: 'c',
        Date_of_First_Interview__c: '2026-09-04',
        Status__c: 'Passed',
        Important_Notes__c: '<p>Interview detail</p>',
      },
    ];
    const before = structuredClone({ matches, interviews });
    const result = reportCandidateSummary(matches, interviews);
    expect(result.best).toBe('Leading');
    expect(result.text).toBe(
      'Leading; match Hired; candidate Active; earliest start 2026-09-10; interview 2026-09-04; interview Passed; provider notes Provider detail; match interview notes Match detail; interview notes Interview detail; candidate notes Candidate detail | Rejected; match Rejected'
    );
    expect({ matches, interviews }).toEqual(before);
    expect(reportCandidateSummary([{ Candidate__c: 'c', Interview__r: {} }], interviews).text).toBe(
      'match unknown'
    );
    expect(reportCandidateSummary([], [{ Name: 'Only interview' }])).toEqual({
      text: '',
      quality: 'Direct',
      best: 'Only interview',
    });
  });
});
