import { interpretConversation } from './conversation-interpretation.js';
import type { ConversationEvidenceEvent } from './conversation-interpretation.js';
import type { EvidenceDate } from './evidence.js';
import { firstEvidenceText } from './source-evidence-context.js';
import { datedTaskLines, explicitTaskOccurrenceDate } from './source-task-dates.js';
import type { DatedTaskLine } from './source-task-dates.js';
import { taskActivityRows } from './task-activity.js';
import { isAdministrativeEmail, isAdministrativeTaskReminder } from './task-administrative.js';
import type {
  MatchedTaskActivity,
  TaskEvidenceIdentity,
  TasksEvidenceInput,
} from './task-evidence-types.js';
import { taskIdentityAssessment } from './task-identity.js';
import { taskSmsEvidence } from './task-sms-evidence.js';

function excludedTask(record: MatchedTaskActivity, asOf: EvidenceDate): boolean {
  const text = `${record.Subject ?? record.TaskSubject ?? ''} ${record.Description ?? record.TaskDescription ?? ''}`;
  if (
    /email/i.test(`${record.TaskSubtype ?? ''} ${record.Subject ?? ''}`) &&
    isAdministrativeEmail(text)
  )
    return true;
  if (isAdministrativeTaskReminder(text) && !/new client onboarding packet/i.test(text))
    return true;
  const embeddedDate = /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\s*[-:]/.test(
    record.Description ?? record.TaskDescription ?? ''
  );
  const modified = record.LastModifiedDate;
  return (
    Boolean(modified) &&
    new Date(modified ?? '').valueOf() > new Date(asOf).valueOf() &&
    !embeddedDate
  );
}
function taskLineEvidence(
  record: MatchedTaskActivity,
  line: DatedTaskLine,
  index: number,
  input: TasksEvidenceInput
): ConversationEvidenceEvent<TaskEvidenceIdentity>[] {
  const { profile, gate, asOf } = input;
  const reportedOccurrenceDate = /chatter/i.test(record.activityType)
    ? explicitTaskOccurrenceDate(line.text, line.eventDate)
    : null;
  return interpretConversation({
    opportunityId: profile.opportunityId,
    source: 'Tasks / Task Chatter',
    sourceRecordId: `${record.activityId}:${String(index + 1)}`,
    eventDate: reportedOccurrenceDate ?? line.eventDate,
    text: line.text,
    rawText: line.text,
    matchQuality: record.identityAssessment.quality,
    gate,
    asOf,
    matchedIdentities: [
      {
        opportunityId: profile.opportunityId,
        opportunityName: profile.opportunityName,
        taskSubject: firstEvidenceText(record.Subject) ?? record.TaskSubject,
        activityType: record.activityType,
      },
    ],
    assumedIdentityMatch: Boolean(record.identityAssessment.assumedIdentityMatch),
    assumedIdentityNote: firstEvidenceText(record.identityAssessment.assumedIdentityNote) ?? '',
    matchedAs: firstEvidenceText(record.identityAssessment.matchedAs) ?? '',
    context: {
      taskSubject: firstEvidenceText(record.Subject, record.TaskSubject) ?? '',
      occurrenceDateAnchored: Boolean(reportedOccurrenceDate),
      reportedOccurrenceDate,
      direction:
        firstEvidenceText(
          record.aircall__SMS_Direction__c,
          record.HS_SMS_Direction__c,
          record.CallType
        ) ?? '',
      line:
        firstEvidenceText(
          record.aircall__Number_Name__c,
          record.aircall__Number_name__c,
          record.HS_SMS_Line__c
        ) ?? '',
      sourceType: record.activityType,
    },
  });
}
export function adaptTasks(
  input: TasksEvidenceInput
): ConversationEvidenceEvent<TaskEvidenceIdentity>[] {
  const rows = taskActivityRows(input.records)
    .map((record) => ({
      ...record,
      identityAssessment: taskIdentityAssessment(record, input.profile, input.gate),
    }))
    .filter((record) => !record.identityAssessment.rejected);
  return [
    ...taskSmsEvidence(rows, input),
    ...rows.flatMap((record) =>
      excludedTask(record, input.asOf)
        ? []
        : datedTaskLines(record, input.asOf).flatMap((line, index) =>
            taskLineEvidence(record, line, index, input)
          )
    ),
  ];
}
