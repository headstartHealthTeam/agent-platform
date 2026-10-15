import {
  authorizationEvidenceIdentity,
  authorizationNoteLines,
} from './authorization-evidence-common.js';
import type {
  AuthorizationEvidenceContext,
  AuthorizationEvidenceEvent,
  AuthorizationEvidenceRecord,
} from './authorization-evidence-types.js';
import { interpretConversation } from './conversation-interpretation.js';
import { isoDate } from './dates.js';
import { extractDenialReason } from './denial-reason.js';
import { createEvidenceEvent } from './evidence.js';
import { firstEvidenceDate } from './source-evidence-context.js';

export function expiredAuthorizationEvent(
  context: AuthorizationEvidenceContext,
  record: AuthorizationEvidenceRecord
): AuthorizationEvidenceEvent[] | null {
  const { phase, noCurrentAuthorization, input, insuranceGate } = context;
  const expiration = isoDate(record.Auth_expiration_date__c);
  const cutoffDate = isoDate(input.asOf);
  if (
    !noCurrentAuthorization ||
    phase === null ||
    expiration === null ||
    cutoffDate === null ||
    expiration >= cutoffDate
  )
    return null;
  const issueKey = phase === 'Initial' ? 'initial-authorization' : 'treatment-authorization';
  const payer = record.Payor_Name__r?.Name ?? record.Payor_Name__c;
  const denialReason = extractDenialReason(
    [record.Denial_Reason__c, record.Denial_Reason_Explanation__c].filter(Boolean).join(' ')
  );
  const prior = denialReason
    ? `was denied because ${denialReason} and`
    : /denied|denial/i.test(
          `${record.Insurance_Determination__c ?? ''} ${record.Auth_Status__c ?? ''}`
        )
      ? 'was denied and'
      : '';
  return [
    createEvidenceEvent({
      opportunityId: input.profile.opportunityId,
      source: 'Authorization',
      sourceRecordId: `${record.Id}:expiration`,
      lifecycleRecordId: record.Id,
      eventDate: expiration,
      category: issueKey,
      issueKey,
      text: `The prior ${phase.toLowerCase()} authorization${payer ? ` with ${payer}` : ''} ${prior} expired on ${expiration}; no current authorization is on file.`.replace(
        /\s+/g,
        ' '
      ),
      rawText: null,
      matchedIdentities: authorizationEvidenceIdentity(record, input),
      matchQuality: 'Direct',
      substantive: true,
      relationship: 'Supports',
      processRelevance: insuranceGate ? 11 : 7,
      factType: 'auth-expired',
      denialReason,
      gateImpact: `No current ${phase.toLowerCase()} authorization is on file`,
      actionOwner: 'Insurance Ops',
      actionType: 'Insurance Follow-Up',
      recommendedAction: `Insurance Ops to confirm the outcome of the prior authorization path and establish the current ${phase.toLowerCase()} authorization requirement.`,
    }),
  ];
}
function authorizationNotes(record: AuthorizationEvidenceRecord): string {
  const denial =
    /denied|denial|withdrawn|appeal|peer review|reconsideration|partial approval/i.test(
      `${record.Insurance_Determination__c ?? ''} ${record.Auth_Status__c ?? ''}`
    );
  return [
    record.Notes__c,
    record.Denial_Reason__c
      ? `${denial ? 'Denial reason' : 'Payer request category'}: ${record.Denial_Reason__c}`
      : null,
    record.Denial_Reason_Explanation__c
      ? `${denial ? 'Denial reason explanation' : 'Payer request detail'}: ${record.Denial_Reason_Explanation__c}`
      : null,
    `Current determination: ${record.Insurance_Determination__c ?? 'not recorded'}. Current status: ${record.Auth_Status__c ?? 'not recorded'}.`,
  ]
    .filter(Boolean)
    .join('\n');
}
export function unresolvedAuthorizationEvents(
  context: AuthorizationEvidenceContext,
  record: AuthorizationEvidenceRecord
): AuthorizationEvidenceEvent[] {
  const { input, phase, insuranceGate, interpretationGate } = context;
  const notes = authorizationNotes(record);
  const dated = authorizationNoteLines(record, input.asOf);
  const eventDate =
    firstEvidenceDate(
      dated.at(-1)?.eventDate,
      record.Master_Submission_Date__c,
      record.Initial_Auth_Submission_Date__c,
      record.Treatment_Auth_Submission_Date__c,
      record.LastModifiedDate,
      record.CreatedDate
    ) ?? input.asOf;
  const payer = record.Payor_Name__r?.Name ?? record.Payor_Name__c;
  const label = phase ? `${phase.toLowerCase()} authorization` : 'authorization';
  return interpretConversation({
    opportunityId: input.profile.opportunityId,
    source: 'Authorization',
    sourceRecordId: record.Id,
    eventDate,
    text: notes,
    rawText: notes,
    matchQuality: 'Direct',
    gate: interpretationGate,
    asOf: input.asOf,
    matchedIdentities: authorizationEvidenceIdentity(record, input),
  }).map((event) => ({
    ...event,
    text:
      event.factType === 'auth-pending' && payer
        ? `The current ${label} with ${payer} remains pending; no final determination is recorded.`
        : event.text,
    processRelevance: insuranceGate ? event.processRelevance : Math.min(event.processRelevance, 7),
  }));
}
