import { describe, expect, it } from 'vitest';

import type { ReportCommunication, ReportTaskFeed } from './report-display-types.js';
import {
  normalizeReportAircall,
  reportCommunicationsSummary,
  reportOutstandingTaskFields,
  reportTaskFeedEvents,
  resolveReportTaskRelativeDates,
} from './report-task-display.js';

describe('task and communication report projections', () => {
  it('uses SMS description fallback only for SMS and preserves arbitrary record metadata', () => {
    const input = {
      Id: 'call',
      aircall__Type__c: 'SMS',
      aircall__Message_Content__c: null,
      aircall__Description__c: 'Message',
      extra: { kept: true },
    };
    const result = normalizeReportAircall(input);
    const content: string = result.aircall__Message_Content__c;
    expect(content).toBe('Message');
    expect(result.extra).toBe(input.extra);
    expect(input.aircall__Message_Content__c).toBeNull();
    expect(
      normalizeReportAircall({ aircall__Description__c: 'Not a message' })
        .aircall__Message_Content__c
    ).toBe('');
    expect(
      normalizeReportAircall({
        aircall__SMS_Direction__c: 'Outbound',
        aircall__Message_Content__c: 'Preferred',
        aircall__Description__c: 'Fallback',
      }).aircall__Message_Content__c
    ).toBe('Preferred');
  });
  it('resolves only scheduled today/tomorrow at the source UTC date', () => {
    expect(
      resolveReportTaskRelativeDates(
        'Scheduled tomorrow; scheduled today; call tomorrow.',
        '2026-12-31T23:00:00Z'
      )
    ).toBe('scheduled for 1/1; scheduled for 12/31; call tomorrow.');
    expect(resolveReportTaskRelativeDates('<p>Scheduled tomorrow</p>', 'bad')).toBe(
      'Scheduled tomorrow'
    );
    expect(resolveReportTaskRelativeDates('Scheduled tomorrow', null)).toBe('Scheduled tomorrow');
  });
  it('retains meaningful tracked changes, body and comments with their own dates/authors', () => {
    const tasks: ReportCommunication[] = [
      {
        Id: 'task',
        WhatId: 'opp',
        Subject: 'Schedule',
        Description: 'scheduled tomorrow',
        Status: 'Open',
        ActivityDate: '2026-09-04',
      },
    ];
    const feeds: ReportTaskFeed[] = [
      {
        Id: 'feed',
        ParentId: 'task',
        CreatedDate: '2026-09-02',
        LastModifiedDate: '2026-09-04',
        CreatedBy: { Name: 'Staff' },
        Body: '<p>Scheduled today</p>',
        FeedTrackedChanges: {
          records: [
            { FieldName: 'Task.Status', OldValue: 'Open', NewValue: 'Closed' },
            { FieldName: 'Ignored', OldValue: 'a', NewValue: 'b' },
            { FieldName: 'Task.Subject', OldValue: 'same', NewValue: 'same' },
            { FieldName: 'Task.Category__c', OldValue: null, NewValue: 'Follow-up' },
          ],
        },
        FeedComments: {
          records: [
            {
              Id: 'comment',
              CreatedDate: '2026-09-03',
              CreatedBy: { Name: 'Reply' },
              CommentBody: 'scheduled tomorrow',
            },
            { CommentBody: ' ' },
          ],
        },
      },
      { ParentId: 'missing', Body: 'Ignore' },
    ];
    const before = structuredClone({ tasks, feeds });
    const result = reportTaskFeedEvents(tasks, feeds);
    expect(result).toHaveLength(3);
    expect(result.map((entry) => [entry.Source, entry.Summary, entry.CreatedDate])).toEqual([
      ['Task Chatter', 'Reply: scheduled for 9/4', '2026-09-03'],
      [
        'Task update',
        'Status changed from Open to Closed; Category__c changed from blank to Follow-up; Task detail: scheduled for 9/3',
        '2026-09-02',
      ],
      ['Task Chatter', 'Staff: scheduled for 9/2', '2026-09-02'],
    ]);
    expect(result[0]).toMatchObject({
      WhatId: 'opp',
      TaskId: 'task',
      FeedItemId: 'feed',
      FeedCommentId: 'comment',
      Author: 'Reply',
      TaskStatus: 'Open',
      TaskActivityDate: '2026-09-04',
    });
    expect({ tasks, feeds }).toEqual(before);
  });
  it('ignores CreateRecordEvent changes but keeps its real body/comment', () => {
    const result = reportTaskFeedEvents(
      [{ Id: 'task', WhatId: 'opp' }],
      [
        {
          ParentId: 'task',
          Type: 'CreateRecordEvent',
          CreatedDate: '2026-09-01',
          Body: 'Body',
          FeedTrackedChanges: { records: [{ FieldName: 'Status', NewValue: 'Open' }] },
          FeedComments: { records: [{ CommentBody: 'Reply' }] },
        },
      ]
    );
    expect(result.map((entry) => entry.Summary)).toEqual(['Body', 'Reply']);
    expect(result[0]).toMatchObject({
      TaskSubject: 'Task',
      TaskStatus: '',
      TaskDescription: '',
      TaskActivityDate: '',
      Author: '',
    });
    expect(reportTaskFeedEvents([{ Id: 'task' }], [{ ParentId: 'task', Body: 'Body' }])).toEqual(
      []
    );
  });
  it('shows latest eight communications with SMS/full-transcript/summary precedence', () => {
    const calls: ReportCommunication[] = [
      {
        CreatedDate: '2026-09-02',
        aircall__Type__c: 'Call',
        Headstart_Full_Transcript__c: 'Transcript',
        aircall__Call_summary__c: 'Ignore',
      },
      {
        CreatedDate: '2026-09-03',
        aircall__Message_Content__c: 'SMS',
        Headstart_Full_Transcript__c: 'Ignore',
        aircall__Number_name__c: 'Intake',
      },
      { CreatedDate: '2026-09-01', aircall__Call_summary__c: 'Fallback' },
    ];
    expect(
      reportCommunicationsSummary(
        [
          {
            CreatedDate: '2026-09-04',
            Subject: 'Task',
            TaskSubtype: 'Task',
            Description: 'Detail',
          },
        ],
        calls
      )
    ).toEqual({
      text: '2026-09-04; Task; Task; Detail | 2026-09-03; Intake; sms: SMS | 2026-09-02; Call; transcript: Transcript | 2026-09-01; summary fallback: Fallback',
      quality: 'Direct',
    });
    expect(reportCommunicationsSummary([], [])).toEqual({
      text: 'No recent Aircall/SMS/Task/Chatter rows found',
      quality: 'Not found',
    });
    const many = Array.from({ length: 10 }, (_, index) => ({
      CreatedDate: `2026-09-${String(index + 1).padStart(2, '0')}`,
      Subject: `Task ${String(index + 1)}`,
    }));
    const text = reportCommunicationsSummary(many, []).text;
    expect(text).toContain('Task 10');
    expect(text).not.toContain('Task 2');
  });
  it('selects only direct outstanding tasks, orders due date then modification, counts beyond five', () => {
    const common = { WhatId: 'opp', TaskSubtype: 'Task', Status: 'In_Progress' };
    const tasks: ReportCommunication[] = [
      { ...common, Subject: 'Later', ActivityDate: '2026-09-05' },
      {
        ...common,
        Subject: 'Other',
        Description: 'Awaiting Ins Approval',
        ActivityDate: '2026-09-01',
        Owner: { Name: 'Staff' },
      },
      {
        ...common,
        Subject: 'Task',
        Category__c: 'Review category',
        ActivityDate: '2026-09-02',
        Owner__r: { Name: 'Fallback owner' },
      },
      { ...common, Subject: 'No due' },
      { ...common, Subject: 'Fourth', ActivityDate: '2026-09-04' },
      { ...common, Subject: 'Third', ActivityDate: '2026-09-03' },
      { ...common, Subject: 'Closed', IsClosed: true },
      { ...common, Subject: 'Closed status', Status: 'Task Completed' },
      { ...common, Subject: 'Other' },
      { ...common, Subject: 'Wrong parent', WhatId: 'other' },
      { ...common, Subject: 'Call', TaskSubtype: 'Call' },
    ];
    const before = structuredClone(tasks);
    expect(reportOutstandingTaskFields(tasks, 'opp', new Date('2026-09-04'))).toEqual({
      count: 6,
      subjects: 'Awaiting insurance approval. | Review category. | Third | Fourth | Later',
      owners: 'Staff | Fallback owner | Unassigned | Unassigned | Unassigned',
      statuses: 'In Progress | In Progress | In Progress | In Progress | In Progress',
      dueDates:
        '2026-09-01 (overdue) | 2026-09-02 (overdue) | 2026-09-03 (overdue) | 2026-09-04 | 2026-09-05',
    });
    expect(tasks).toEqual(before);
    expect(reportOutstandingTaskFields([], 'opp', new Date('2026-09-04'))).toEqual({
      count: 0,
      subjects: '',
      owners: '',
      statuses: '',
      dueDates: '',
    });
    expect(
      reportOutstandingTaskFields(
        [
          { ...common, Subject: 'Older', LastModifiedDate: '2026-09-01' },
          { ...common, Subject: 'Newer', LastModifiedDate: '2026-09-02' },
        ],
        'opp',
        new Date('2026-09-04')
      ).subjects
    ).toBe('Newer | Older');
  });
});
