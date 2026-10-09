import { isoDate } from './dates.js';
import { categoryForGate } from './gate-context.js';
import {
  evidenceOwner,
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import {
  RBT_TEAM,
  RBT_FOLLOW_UP,
  staffingDisplayName,
  staffingRecordMatches,
  type StaffingEvidenceLink,
} from './staffing-evidence-common.js';
import { structuredEvidenceEvent, type StructuredEvidenceEvent } from './structured-evidence.js';

type StaffingField =
  | 'Name__c'
  | 'Aloha_Staff_Name__c'
  | 'Name'
  | 'Status__c'
  | 'First_Billable_Date__c'
  | 'Billable_Start_Date__c'
  | 'In_active_Date__c'
  | 'Notes__c'
  | 'In_active_Reason__c'
  | 'Resigned_Terminated_Reason__c'
  | 'Hire_Date__c'
  | 'LastModifiedDate'
  | 'CreatedDate';
export type StaffingEvidenceRecord = StaffingEvidenceLink &
  Readonly<Partial<Record<StaffingField, string | null | undefined>>>;
export interface StaffingEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly StaffingEvidenceRecord[] | null;
}
function staffingEvent(
  record: StaffingEvidenceRecord,
  input: StaffingEvidenceInput
): StructuredEvidenceEvent {
  const rbt = staffingDisplayName(
    firstEvidenceText(record.Name__c, record.Aloha_Staff_Name__c, record.Name) ?? 'Assigned RBT'
  );
  const status = firstEvidenceText(record.Status__c) ?? 'status not recorded';
  const start = firstEvidenceText(record.First_Billable_Date__c, record.Billable_Start_Date__c);
  const inactive =
    Boolean(record.In_active_Date__c) ||
    /inactive|terminated|resigned|cancelled|canceled/i.test(status);
  const notes = sourceHtmlText(
    [record.Notes__c, record.In_active_Reason__c, record.Resigned_Terminated_Reason__c]
      .filter(Boolean)
      .join(' ')
  );
  const common = {
    opportunityId: input.profile.opportunityId,
    source: 'Staffing',
    sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
    eventDate:
      latestEvidenceDate(
        record.In_active_Date__c,
        record.Hire_Date__c,
        record.LastModifiedDate,
        record.CreatedDate
      ) ?? input.asOf,
    category: 'rbt',
    rawText: notes || null,
  };
  if (inactive)
    return structuredEvidenceEvent({
      ...common,
      text: `${rbt} is no longer an active staffing path; replacement coverage and a new start date are not confirmed.`,
      gateImpact: 'Assigned RBT became inactive; replacement staffing is required',
      actionOwner: RBT_TEAM,
      actionType: RBT_FOLLOW_UP,
      recommendedAction:
        'RBT Team to confirm the replacement staffing path, leading candidate, and expected start date.',
      processRelevance: 10,
    });
  const owner = evidenceOwner(input.profile);
  if (start) {
    const date = isoDate(start);
    return structuredEvidenceEvent({
      ...common,
      text: `${rbt} has an active staffing record with a planned billable start of ${String(date)}, but no first 97153 appointment is recorded in Salesforce; it has not yet been entered in Aloha.`,
      gateImpact: `RBT staffing is active with a planned start of ${String(date)}`,
      actionOwner: owner,
      actionType: 'Monitor',
      recommendedAction: `${owner} to ensure the ${String(date)} first 97153 appointment is entered in Aloha, confirm it syncs to Salesforce, and verify completion after the service date.`,
      processRelevance: 10,
      milestoneDate: date,
      followUpDate: date,
      factType: 'treatment-start-planned',
    });
  }
  return structuredEvidenceEvent({
    ...common,
    text: `${rbt} has a ${status.toLowerCase()} staffing record, but no billable start or first 97153 date is recorded.`,
    gateImpact: 'RBT staffing exists; treatment start remains unconfirmed',
    actionOwner: owner,
    actionType: 'Provider Outreach',
    recommendedAction: `${owner} to confirm the agreed first 97153 date and verify it appears in Salesforce or linked billing.`,
    processRelevance: 9,
    factType: 'rbt-assigned',
  });
}
export function adaptStaffing(input: StaffingEvidenceInput): StructuredEvidenceEvent[] {
  if (categoryForGate(input.gate) !== 'rbt') return [];
  return (input.records ?? [])
    .filter((record) => staffingRecordMatches(record, input.profile.opportunityId))
    .map((record) => staffingEvent(record, input));
}
