import { isAutomatedCommunication } from './conversation-interpretation.js';
import { isAdministrativeOnly } from './freshness-administrative.js';
import { addFreshnessCandidate, type FreshnessContext } from './freshness-candidates.js';
import { freshnessText } from './freshness-values.js';
import { firstEvidenceDate, firstEvidenceText } from './source-evidence-context.js';

function taskFreshness(context: FreshnessContext): void {
  for (const task of context.input.tasks ?? []) {
    const body = freshnessText(
      [task.Subject, task.Description, task.Type, task.TaskSubtype].filter(Boolean).join('; ')
    );
    if (
      !context.relevant.test(body) ||
      isAdministrativeOnly(firstEvidenceText(task.Description, task.Subject)) ||
      isAutomatedCommunication(body)
    )
      continue;
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceDate(task.CreatedDate, task.ActivityDate) ?? '',
      source: /sms/i.test(`${task.Type ?? ''} ${task.TaskSubtype ?? ''} ${task.Subject ?? ''}`)
        ? 'Salesforce SMS'
        : 'Salesforce task',
      sourceRecordId: task.Id,
      summary: body,
      kind: 'discussion',
      matchQuality: firstEvidenceText(task._matchQuality) ?? 'Direct',
      sourceQuality: firstEvidenceText(task._matchQuality) ?? 'Direct',
      matchScore: task._matchScore ?? null,
      matchReasons: task._matchReasons ?? [],
      direction:
        firstEvidenceText(
          task.aircall__SMS_Direction__c,
          task.HS_SMS_Direction__c,
          task.CallType
        ) ?? '',
      line: firstEvidenceText(task.aircall__Number_Name__c, task.HS_SMS_Line__c) ?? '',
    });
  }
}
function taskUpdateFreshness(context: FreshnessContext): void {
  for (const update of context.input.taskUpdates ?? []) {
    const body = freshnessText([update.TaskSubject, update.Summary].filter(Boolean).join('; '));
    if (
      !context.relevant.test(body) ||
      isAdministrativeOnly(firstEvidenceText(update.Summary, update.TaskSubject)) ||
      isAutomatedCommunication(body)
    )
      continue;
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceDate(update.CreatedDate, update.LastModifiedDate),
      source: firstEvidenceText(update.Source) ?? 'Task update',
      sourceRecordId: firstEvidenceText(update.FeedCommentId, update.FeedItemId) ?? update.TaskId,
      summary: body,
      kind: 'task-detail',
      matchQuality: firstEvidenceText(update._matchQuality) ?? 'Direct',
      sourceQuality: firstEvidenceText(update._matchQuality) ?? 'Direct',
      matchScore: update._matchScore ?? null,
      matchReasons: update._matchReasons ?? [],
    });
  }
}
function callFreshness(context: FreshnessContext): void {
  for (const call of context.input.aircalls ?? []) {
    const sms = Boolean(call.aircall__Message_Content__c);
    const transcript = freshnessText(call.Headstart_Full_Transcript__c);
    const body = sms
      ? freshnessText(call.aircall__Message_Content__c)
      : (firstEvidenceText(transcript) ??
        freshnessText(
          [call.aircall__Call_summary__c, call.aircall__AI_Key_Topics__c].filter(Boolean).join('; ')
        ));
    if (!context.relevant.test(body) || isAutomatedCommunication(body)) continue;
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceText(call.aircall__Call_Start_Date_Time__c, call.CreatedDate),
      source: sms ? 'Aircall SMS' : transcript ? 'Aircall transcript' : 'Aircall call summary',
      sourceRecordId: call.Id,
      summary: body,
      kind: 'discussion',
      matchQuality: firstEvidenceText(call._matchQuality) ?? 'Direct',
      sourceQuality: firstEvidenceText(call._matchQuality) ?? 'Direct',
      matchScore: call._matchScore ?? null,
      matchReasons: call._matchReasons ?? [],
      direction:
        firstEvidenceText(call.aircall__SMS_Direction__c, call.aircall__Call_Type__c) ?? '',
      line: firstEvidenceText(call.aircall__Number_Name__c, call.aircall__Number_name__c) ?? '',
    });
  }
}
export function collectCommunicationFreshness(context: FreshnessContext): void {
  taskFreshness(context);
  taskUpdateFreshness(context);
  callFreshness(context);
}
