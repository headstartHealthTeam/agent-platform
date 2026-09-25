import type { DateValue } from './dates.js';
import type {
  ReportCommunication,
  ReportOutstandingTasks,
  ReportSourceSummary,
  ReportTaskFeed,
  ReportTaskUpdate,
} from './report-display-types.js';
import {
  reportClean,
  reportFitCompleteThought,
  reportPlainText,
  reportPreferred,
  reportShortDate,
  reportText,
  reportTimestamp,
  reportTruncate,
} from './report-display-values.js';

export function normalizeReportAircall<T extends ReportCommunication>(
  record: T
): Omit<T, 'aircall__Message_Content__c'> & { readonly aircall__Message_Content__c: string } {
  const communicationType = [
    record.aircall__Type__c,
    record.aircall__Call_Type__c,
    record.aircall__Subtype__c,
  ]
    .filter(Boolean)
    .join(' ');
  const isSms = Boolean(record.aircall__SMS_Direction__c) || /\bsms\b/i.test(communicationType);
  return {
    ...record,
    aircall__Message_Content__c: reportText(
      record.aircall__Message_Content__c,
      isSms ? reportText(record.aircall__Description__c) : ''
    ),
  };
}
export function resolveReportTaskRelativeDates(value: unknown, anchor: DateValue): string {
  const text = reportPlainText(value);
  const hasAnchor = Boolean(anchor);
  if (!text || !hasAnchor) return text;
  const date = new Date(reportTimestamp(anchor));
  if (Number.isNaN(date.getTime())) return text;
  const tomorrow = new Date(date);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return text
    .replace(/scheduled\s+tomorrow\b/gi, `scheduled for ${reportShortDate(tomorrow)}`)
    .replace(/scheduled\s+today\b/gi, `scheduled for ${reportShortDate(date)}`);
}
function feedBase(
  task: ReportCommunication,
  feed: ReportTaskFeed,
  whatId: string
): Omit<ReportTaskUpdate, 'Source' | 'Summary'> {
  return {
    WhatId: whatId,
    TaskId: task.Id,
    FeedItemId: feed.Id,
    TaskSubject: reportText(task.Subject, 'Task'),
    TaskDescription: resolveReportTaskRelativeDates(task.Description, feed.CreatedDate),
    TaskStatus: reportText(task.Status),
    TaskActivityDate: reportText(task.ActivityDate),
    CreatedDate: feed.CreatedDate,
    LastModifiedDate: feed.LastModifiedDate,
    Author: reportText(feed.CreatedBy?.Name),
  };
}
function feedChanges(feed: ReportTaskFeed): string[] {
  return (feed.FeedTrackedChanges?.records ?? [])
    .filter(
      (change) =>
        /(?:Status|ActivityDate|Subject|Description|Type|Category__c|Subcategory__c)$/.test(
          change.FieldName ?? ''
        ) && change.OldValue !== change.NewValue
    )
    .map(
      (change) =>
        `${reportClean(change.FieldName).replace(/^Task\./, '')} changed from ${reportClean(change.OldValue) || 'blank'} to ${reportClean(change.NewValue) || 'blank'}`
    );
}
function feedEvents(
  task: ReportCommunication,
  feed: ReportTaskFeed,
  whatId: string
): ReportTaskUpdate[] {
  const base = feedBase(task, feed, whatId);
  const events: ReportTaskUpdate[] = [];
  const changes = feedChanges(feed);
  if (changes.length && feed.Type !== 'CreateRecordEvent')
    events.push({
      ...base,
      Source: 'Task update',
      Summary: [
        changes.join('; '),
        base.TaskDescription ? `Task detail: ${base.TaskDescription}` : '',
      ]
        .filter(Boolean)
        .join('; '),
    });
  if (reportPlainText(feed.Body))
    events.push({
      ...base,
      Source: 'Task Chatter',
      Summary: `${base.Author ? `${base.Author}: ` : ''}${resolveReportTaskRelativeDates(feed.Body, feed.CreatedDate)}`,
    });
  for (const comment of feed.FeedComments?.records ?? []) {
    const body = resolveReportTaskRelativeDates(
      comment.CommentBody,
      reportPreferred(comment.CreatedDate, feed.CreatedDate)
    );
    if (!body) continue;
    events.push({
      ...base,
      FeedCommentId: comment.Id,
      CreatedDate: reportPreferred(comment.CreatedDate, feed.CreatedDate),
      Author: reportText(comment.CreatedBy?.Name),
      Source: 'Task Chatter',
      Summary: `${comment.CreatedBy?.Name ? `${comment.CreatedBy.Name}: ` : ''}${body}`,
    });
  }
  return events;
}
export function reportTaskFeedEvents(
  tasks: readonly ReportCommunication[],
  feeds: readonly ReportTaskFeed[]
): ReportTaskUpdate[] {
  const byId = new Map(tasks.map((task) => [task.Id, task]));
  const events: ReportTaskUpdate[] = [];
  for (const feed of feeds) {
    const task = byId.get(feed.ParentId);
    if (task?.WhatId) events.push(...feedEvents(task, feed, task.WhatId));
  }
  return events.sort((a, b) => reportTimestamp(b.CreatedDate) - reportTimestamp(a.CreatedDate));
}
interface CommunicationEntry {
  readonly at: DateValue;
  readonly text: string;
}
function callEntry(call: ReportCommunication): CommunicationEntry {
  const isSms = Boolean(call.aircall__Message_Content__c);
  const transcript = reportClean(call.Headstart_Full_Transcript__c);
  const evidence = isSms
    ? reportClean(call.aircall__Message_Content__c)
    : transcript || reportClean(call.aircall__Call_summary__c);
  const at = reportPreferred(call.aircall__Call_Start_Date_Time__c, call.CreatedDate);
  return {
    at,
    text: [
      at,
      call.aircall__Number_name__c,
      reportPreferred(call.aircall__Call_Type__c, call.aircall__Type__c, call.aircall__Subtype__c),
      evidence
        ? `${isSms ? 'sms' : transcript ? 'transcript' : 'summary fallback'}: ${reportTruncate(evidence, 180)}`
        : '',
    ]
      .filter(Boolean)
      .join('; '),
  };
}
export function reportCommunicationsSummary(
  tasks: readonly ReportCommunication[],
  calls: readonly ReportCommunication[],
  updates: readonly ReportTaskUpdate[] = []
): Omit<ReportSourceSummary, 'best'> {
  const entries: CommunicationEntry[] = [
    ...calls.map(callEntry),
    ...tasks.map((task) => ({
      at: reportPreferred(task.CreatedDate, task.ActivityDate),
      text: [
        reportPreferred(task.CreatedDate, task.ActivityDate),
        task.Subject,
        reportPreferred(task.Type, task.TaskSubtype),
        task.Description ? reportTruncate(task.Description, 140) : '',
      ]
        .filter(Boolean)
        .join('; '),
    })),
    ...updates.map((update) => ({
      at: update.CreatedDate,
      text: [
        update.CreatedDate,
        update.Source,
        update.TaskSubject,
        reportTruncate(update.Summary, 220),
      ]
        .filter(Boolean)
        .join('; '),
    })),
  ];
  entries.sort((a, b) => reportTimestamp(b.at) - reportTimestamp(a.at));
  const pieces = entries.slice(0, 8).map((entry) => entry.text);
  return {
    text: pieces.length
      ? reportTruncate(pieces.join(' | '), 1200)
      : 'No recent Aircall/SMS/Task/Chatter rows found',
    quality: pieces.length ? 'Direct' : 'Not found',
  };
}
function outstanding(task: ReportCommunication, opportunityId: string): boolean {
  return (
    task.WhatId === opportunityId &&
    task.TaskSubtype === 'Task' &&
    task.IsClosed !== true &&
    !/^(?:completed|task completed|closed)$/i.test(reportClean(task.Status)) &&
    (!/^(?:other|task)$/i.test(reportClean(task.Subject)) ||
      Boolean(reportClean(task.Description)) ||
      Boolean(reportClean(task.Category__c)))
  );
}
export function reportOutstandingTaskFields(
  tasks: readonly ReportCommunication[],
  opportunityId: string,
  asOf: Date
): ReportOutstandingTasks {
  const date = asOf.toISOString().slice(0, 10);
  const candidates = tasks
    .filter((task) => outstanding(task, opportunityId))
    .sort((a, b) => {
      const aDue = reportText(a.ActivityDate, '9999-12-31');
      const bDue = reportText(b.ActivityDate, '9999-12-31');
      return aDue !== bDue
        ? aDue.localeCompare(bDue)
        : reportTimestamp(b.LastModifiedDate) - reportTimestamp(a.LastModifiedDate);
    });
  const selected = candidates.slice(0, 5).map((task) => ({
    subject: !/^(?:other|task)$/i.test(reportClean(task.Subject))
      ? reportClean(task.Subject)
      : reportFitCompleteThought(
          reportClean(task.Description) || reportClean(task.Category__c) || 'Follow-up task',
          120
        ),
    owner: reportText(task.Owner?.Name, task.Owner__r?.Name, 'Unassigned'),
    status: reportClean(task.Status).replace(/_/g, ' '),
    dueDate: task.ActivityDate
      ? `${task.ActivityDate}${task.ActivityDate < date ? ' (overdue)' : ''}`
      : '',
  }));
  return {
    count: candidates.length,
    subjects: selected.map((task) => task.subject).join(' | '),
    owners: selected.map((task) => task.owner).join(' | '),
    statuses: selected.map((task) => task.status).join(' | '),
    dueDates: selected.map((task) => task.dueDate).join(' | '),
  };
}
