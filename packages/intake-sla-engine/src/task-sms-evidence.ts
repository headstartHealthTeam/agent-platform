import { interpretConversation } from './conversation-interpretation.js';
import type { ConversationEvidenceEvent } from './conversation-interpretation.js';
import { extractRequestedInformation } from './requested-information.js';
import { firstEvidenceDate, firstEvidenceText } from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import type {
  MatchedTaskActivity,
  TaskEvidenceIdentity,
  TasksEvidenceInput,
} from './task-evidence-types.js';

function smsDirection(row: MatchedTaskActivity): string {
  return firstEvidenceText(row.aircall__SMS_Direction__c, row.HS_SMS_Direction__c) ?? '';
}
function requestedInformation(row: MatchedTaskActivity, suffix = ''): string | null {
  return extractRequestedInformation(
    `${row.Subject ?? ''} ${row.Description ?? ''}${suffix ? ` ${suffix}` : ''}`
  );
}
function priorCandidates(
  earlier: readonly MatchedTaskActivity[],
  inbound: MatchedTaskActivity,
  inboundText: string
): MatchedTaskActivity[] {
  const inboundDate = new Date(inbound.CreatedDate ?? 0).valueOf();
  return [...earlier].reverse().filter((candidate) => {
    const sameContact = !inbound.WhoId || !candidate.WhoId || inbound.WhoId === candidate.WhoId;
    const age = inboundDate - new Date(candidate.CreatedDate ?? 0).valueOf();
    const requested = requestedInformation(candidate, inboundText);
    return (
      /outbound/i.test(smsDirection(candidate)) &&
      sameContact &&
      age >= 0 &&
      age <= 30 * 24 * 60 * 60 * 1000 &&
      Boolean(requested)
    );
  });
}
function priorSms(
  candidates: readonly MatchedTaskActivity[],
  inboundText: string
): MatchedTaskActivity | undefined {
  const nearest = candidates[0];
  const requested = nearest === undefined ? null : requestedInformation(nearest, inboundText);
  const family = /referral|authorization/i.test(requested ?? '')
    ? /referral|authorization/i
    : /service order/i.test(requested ?? '')
      ? /service order/i
      : null;
  if (family === null) return nearest;
  return candidates
    .filter((candidate) => family.test(requestedInformation(candidate) ?? ''))
    .sort(
      (left, right) =>
        (requestedInformation(right) ?? '').length - (requestedInformation(left) ?? '').length ||
        new Date(right.CreatedDate ?? 0).valueOf() - new Date(left.CreatedDate ?? 0).valueOf()
    )[0];
}
function smsEvent(
  prior: MatchedTaskActivity,
  inbound: MatchedTaskActivity,
  inboundText: string,
  input: TasksEvidenceInput
): ConversationEvidenceEvent<TaskEvidenceIdentity>[] {
  const { profile, gate, asOf } = input;
  const text = [sourceHtmlText(`${prior.Subject ?? ''} ${prior.Description ?? ''}`), inboundText]
    .filter(Boolean)
    .join(' ');
  return interpretConversation({
    opportunityId: profile.opportunityId,
    source: 'Tasks / Task Chatter',
    sourceRecordId: `${prior.activityId}:${inbound.activityId}:thread`,
    eventDate: firstEvidenceDate(inbound.CreatedDate, inbound.ActivityDate) ?? asOf,
    text,
    rawText: text,
    matchQuality:
      inbound.identityAssessment.quality === 'Likely' ||
      prior.identityAssessment.quality === 'Likely'
        ? 'Likely'
        : 'Direct',
    gate,
    asOf,
    matchedIdentities: [
      {
        opportunityId: profile.opportunityId,
        opportunityName: profile.opportunityName,
        activityType: 'SMS Thread',
      },
    ],
    assumedIdentityMatch:
      Boolean(inbound.identityAssessment.assumedIdentityMatch) ||
      Boolean(prior.identityAssessment.assumedIdentityMatch),
    assumedIdentityNote:
      firstEvidenceText(
        inbound.identityAssessment.assumedIdentityNote,
        prior.identityAssessment.assumedIdentityNote
      ) ?? '',
    matchedAs:
      firstEvidenceText(inbound.identityAssessment.matchedAs, prior.identityAssessment.matchedAs) ??
      '',
    context: {
      direction: 'Inbound',
      line:
        firstEvidenceText(
          inbound.aircall__Number_Name__c,
          inbound.aircall__Number_name__c,
          inbound.HS_SMS_Line__c
        ) ?? 'Intake',
      sourceType: 'SMS Thread',
    },
  });
}
export function taskSmsEvidence(
  rows: readonly MatchedTaskActivity[],
  input: TasksEvidenceInput
): ConversationEvidenceEvent<TaskEvidenceIdentity>[] {
  const smsRows = rows
    .filter((row) => /sms/i.test(`${row.Type ?? ''} ${row.TaskSubtype ?? ''} ${row.Subject ?? ''}`))
    .sort(
      (left, right) =>
        new Date(left.CreatedDate ?? 0).valueOf() - new Date(right.CreatedDate ?? 0).valueOf()
    );
  return smsRows.flatMap((inbound, index) => {
    const text = sourceHtmlText(inbound.Description ?? '');
    if (!/inbound/i.test(smsDirection(inbound))) return [];
    const prior = priorSms(priorCandidates(smsRows.slice(0, index), inbound, text), text);
    if (
      prior === undefined ||
      !/\b(?:sent|submitted|uploaded|completed|finished|signed|will send|will complete|working on|waiting for|almost done|in progress)\b/i.test(
        text
      )
    )
      return [];
    return smsEvent(prior, inbound, text, input);
  });
}
