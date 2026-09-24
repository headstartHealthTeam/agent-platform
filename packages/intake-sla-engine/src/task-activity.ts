import { firstEvidenceDate, firstEvidenceText } from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import type { TaskActivity, TaskEvidenceRecord } from './task-evidence-types.js';

const CHATTER_POST = 'Chatter Post';

function embeddedTaskActivity(record: TaskEvidenceRecord, baseId: string): TaskActivity[] {
  const embedded = [
    ...(record.FeedItems ?? []),
    ...(record.TaskFeed ?? []),
    ...(record.ChatterPosts ?? []),
    ...(record.FeedComments ?? []),
    ...(record.ChatterComments ?? []),
  ];
  return embedded.map((item, index) => ({
    ...item,
    TaskId: firstEvidenceText(record.Id) ?? record.TaskId,
    WhatId: firstEvidenceText(item.WhatId) ?? record.WhatId,
    Subject: firstEvidenceText(item.Subject, record.Subject) ?? record.TaskSubject,
    Description: firstEvidenceText(item.Body, item.CommentBody, item.Description, item.Text) ?? '',
    CreatedDate: firstEvidenceDate(item.CreatedDate) ?? record.CreatedDate,
    LastModifiedDate: firstEvidenceDate(item.LastModifiedDate) ?? item.CreatedDate,
    activityId: firstEvidenceText(item.Id) ?? `${baseId}:chatter:${String(index + 1)}`,
    activityType: item.CommentBody ? 'Chatter Comment' : CHATTER_POST,
  }));
}
export function taskActivityRows(records?: readonly TaskEvidenceRecord[] | null): TaskActivity[] {
  return (records ?? []).flatMap((record) => {
    const rows: TaskActivity[] = [];
    const baseId = firstEvidenceText(record.Id, record.TaskId, record.ParentTaskId) ?? 'task';
    const flattenedFeedText = sourceHtmlText(record.Summary ?? '');
    const flattened =
      Boolean(flattenedFeedText) && /task chatter|task update/i.test(record.Source ?? '');
    if (
      !flattened &&
      (record.Description || record.TaskDescription || record.Subject || record.TaskSubject)
    )
      rows.push({ ...record, activityId: baseId, activityType: 'Task' });
    if (flattened)
      rows.push({
        ...record,
        Subject: firstEvidenceText(record.Subject) ?? record.TaskSubject,
        Description: flattenedFeedText,
        activityId: firstEvidenceText(record.FeedItemId) ?? `${baseId}:feed`,
        activityType: /task chatter/i.test(record.Source ?? '') ? CHATTER_POST : 'Task Update',
      });
    rows.push(...embeddedTaskActivity(record, baseId));
    if ((record.Body || record.CommentBody) && !record.Description && !record.TaskDescription)
      rows.push({
        ...record,
        Description: firstEvidenceText(record.Body) ?? record.CommentBody,
        activityId: firstEvidenceText(record.Id) ?? baseId,
        activityType: record.CommentBody ? 'Chatter Comment' : CHATTER_POST,
      });
    return rows;
  });
}
