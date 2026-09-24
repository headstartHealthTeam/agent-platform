import { toDate, isoDate } from './dates.js';
import { categoryForGate, isVobRelevantGate, type GateContext } from './gate-context.js';
import type { SourceAuthorizationRecord } from './source-authorization-types.js';
import {
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import { structuredEvidenceEvent, type StructuredEvidenceEvent } from './structured-evidence.js';

const STATUS_NOT_RECORDED = 'status not recorded';
function reviewRelevance(insurance: boolean, denied: boolean, pending: boolean): number {
  if (insurance) return denied ? 9 : pending ? 8 : 6;
  return denied ? 7 : pending ? 6 : 5;
}

export function evidenceAuthorizationPhase(
  gate?: GateContext | null
): 'Initial' | 'Treatment' | null {
  const value = `${gate?.processPosition ?? ''} ${gate?.unresolvedGate ?? ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (/treatment authorization|payer ta|treatment auth/.test(value)) return 'Treatment';
  if (/initial authorization|payer ia|initial auth/.test(value)) return 'Initial';
  if (/ta approved|97153|first direct-care|first day/.test(value)) return 'Treatment';
  if (/ia approved|ia scheduled|ic scheduled|ic completed|97151|treatment plan/.test(value))
    return 'Initial';
  return null;
}
export type AuthorizationReviewEvidenceRecord = SourceAuthorizationRecord & {
  readonly Review_Status__c?: string | null;
};
export interface AuthorizationReviewEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly AuthorizationReviewEvidenceRecord[] | null;
}
function reviewEvent(
  record: AuthorizationReviewEvidenceRecord,
  input: AuthorizationReviewEvidenceInput,
  phase: string | null
): StructuredEvidenceEvent {
  const insurance = categoryForGate(input.gate) === 'insurance';
  const status =
    [record.Review_Status__c, record.Insurance_Determination__c, record.Auth_Status__c]
      .filter(Boolean)
      .join(' / ') || STATUS_NOT_RECORDED;
  const notes = sourceHtmlText(record.Notes__c ?? '');
  const pending = /pending|submitted|in review|additional|await/i.test(`${status} ${notes}`);
  const denied = /denied|denial|appeal|peer review|partial/i.test(`${status} ${notes}`);
  const date = firstEvidenceText(
    record.Treatment_Auth_Approval_Date__c,
    record.Initial_Auth_Submission_Date__c,
    notes ? record.LastModifiedDate : null,
    record.CreatedDate,
    input.asOf
  );
  const type = firstEvidenceText(record.Authorization_Type__c, phase) ?? 'Authorization';
  return structuredEvidenceEvent({
    opportunityId: input.profile.opportunityId,
    source: 'Authorization Review',
    sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
    eventDate: requiredEvidenceValue(date, 'eventDate'),
    category: 'insurance',
    text: `${type} review is ${status.toLowerCase()}${notes ? '; review notes document an unresolved payer or submission detail' : ''}.`,
    gateImpact: denied
      ? `${type} review requires denial, appeal, or correction resolution`
      : pending
        ? `${type} review remains pending`
        : null,
    actionOwner: 'Insurance Ops',
    actionType: 'Insurance Follow-Up',
    recommendedAction:
      'Insurance Ops to confirm the review disposition and record the payer response and next follow-up date.',
    processRelevance: reviewRelevance(insurance, denied, pending),
    rawText: notes || null,
  });
}
export function adaptAuthorizationReviews(
  input: AuthorizationReviewEvidenceInput
): StructuredEvidenceEvent[] {
  const phase = evidenceAuthorizationPhase(input.gate);
  return (input.records ?? [])
    .filter((record) => {
      const type = record.Authorization_Type__c ?? '';
      return !/initial consultation/i.test(type) && (phase === null || type === phase);
    })
    .map((record) => reviewEvent(record, input, phase));
}
type VobField =
  | 'Id'
  | 'Verification_Status__c'
  | 'Eligibility_Status__c'
  | 'Notes__c'
  | 'Verification_Date__c'
  | 'Verification_Date_Entered_At__c'
  | 'LastModifiedDate'
  | 'CreatedDate';
export type VobEvidenceRecord = Readonly<Partial<Record<VobField, string | null | undefined>>>;
export interface VobEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly VobEvidenceRecord[] | null;
}
function vobEvent(record: VobEvidenceRecord, input: VobEvidenceInput): StructuredEvidenceEvent {
  const verification = firstEvidenceText(record.Verification_Status__c) ?? STATUS_NOT_RECORDED;
  const eligibility = firstEvidenceText(record.Eligibility_Status__c) ?? STATUS_NOT_RECORDED;
  const notes = sourceHtmlText(record.Notes__c ?? '');
  const complete =
    /complete|verified/i.test(verification) && /active|eligible|verified/i.test(eligibility);
  const explicitDate =
    toDate(record.Verification_Date__c) ?? toDate(record.Verification_Date_Entered_At__c);
  const eventDate =
    explicitDate?.toISOString() ??
    latestEvidenceDate(record.LastModifiedDate, record.CreatedDate) ??
    input.asOf;
  return structuredEvidenceEvent({
    opportunityId: input.profile.opportunityId,
    source: 'VOB',
    sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
    eventDate,
    category: 'insurance',
    text: complete
      ? `VOB was verified on ${String(isoDate(eventDate))}, and eligibility is ${eligibility.toLowerCase()}; this does not satisfy a separate authorization prerequisite.`
      : `VOB is ${verification.toLowerCase()} and eligibility is ${eligibility.toLowerCase()}; insurance verification remains unresolved.`,
    gateImpact: complete ? null : 'Insurance verification or eligibility remains unresolved',
    actionOwner: 'Insurance Ops',
    actionType: 'Insurance Follow-Up',
    recommendedAction:
      'Insurance Ops to complete verification, confirm eligibility, and document readiness for the next authorization step.',
    processRelevance: complete ? 7 : 9,
    rawText: notes || null,
  });
}
export function adaptVob(input: VobEvidenceInput): StructuredEvidenceEvent[] {
  if (!isVobRelevantGate(input.gate)) return [];
  return (input.records ?? []).map((record) => vobEvent(record, input));
}
