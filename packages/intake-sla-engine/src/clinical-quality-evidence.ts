import { isoDate } from './dates.js';
import { categoryForGate } from './gate-context.js';
import { extractRequestedInformation } from './requested-information.js';
import {
  evidenceOwner,
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import { structuredEvidenceEvent, type StructuredEvidenceEvent } from './structured-evidence.js';

const CLINICAL_QUALITY = 'Clinical Quality';

type ClinicalQualityField =
  | 'Id'
  | 'Treatment_Plan_Status__c'
  | 'Parent_Signature_Date__c'
  | 'Provider_Signature_Date__c'
  | 'TS_Edits_Sent_for_Review__c'
  | 'TS_In_Review__c'
  | 'LastModifiedDate'
  | 'Treatment_Barriers_Notes__c'
  | 'Signatures_Notes__c';
export type ClinicalQualityEvidenceRecord = Readonly<
  Partial<Record<ClinicalQualityField, string | null | undefined>>
>;
export interface ClinicalQualityEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly ClinicalQualityEvidenceRecord[] | null;
}
interface QualityState {
  readonly record: ClinicalQualityEvidenceRecord;
  readonly status: string;
  readonly eventDate: string;
  readonly profile: SourceEvidenceContext['profile'];
  readonly notes: string;
  readonly correction: string | null;
}
interface QualityDecision {
  readonly text: string;
  readonly gateImpact: string;
  readonly actionOwner: string;
  readonly actionType: string;
  readonly recommendedAction: string;
  readonly processRelevance: number;
}

function signedPlan(state: QualityState): QualityDecision {
  const { status } = state;
  if (/ready to submit|approved|complete/i.test(status)) {
    return {
      text: `Clinical Quality records both parent and provider signatures and marks the treatment plan ${status.toLowerCase()}; payer submission is not yet confirmed.`,
      gateImpact: 'Signed treatment plan is ready for payer submission',
      actionOwner: 'Insurance Ops',
      actionType: 'Insurance Follow-Up',
      recommendedAction:
        'Insurance Ops to submit the treatment plan to the payer and record the submission date.',
      processRelevance: 10,
    };
  }
  return {
    text: `Clinical Quality records both parent and provider signatures; the treatment plan remains in ${status.toLowerCase()} and the review outcome is not confirmed.`,
    gateImpact: 'Signed treatment plan awaits Clinical Quality completion',
    actionOwner: CLINICAL_QUALITY,
    actionType: 'Clinical Review',
    recommendedAction:
      'Clinical Quality to complete the review and document whether the plan is ready for payer submission.',
    processRelevance: 10,
  };
}
function qualityDecision(state: QualityState): QualityDecision {
  const { record, status, profile, notes, correction, eventDate } = state;
  if (/denied|changes|edit|revision|correction/i.test(`${status} ${notes}`)) {
    const owner = evidenceOwner(profile);
    const reviewDate = isoDate(record.TS_In_Review__c);
    const editsDate = isoDate(firstEvidenceText(record.TS_Edits_Sent_for_Review__c, eventDate));
    return {
      text: `Clinical Quality${reviewDate ? ` began review on ${reviewDate} and` : ''} sent treatment-plan edits back on ${String(editsDate)}; ${correction ? `${correction} remain unresolved` : 'provider resubmission is not recorded'}.`,
      gateImpact: 'Clinical Quality corrections must be completed and resubmitted',
      actionOwner: owner,
      actionType: 'Provider Outreach',
      recommendedAction: `${owner} to have the provider complete the Clinical Quality edits and document the resubmission date.`,
      processRelevance: 12,
    };
  }
  if (record.Parent_Signature_Date__c && record.Provider_Signature_Date__c)
    return signedPlan(state);
  const inReview = /in review|reviewing|submitted for review|clinical review/i.test(status);
  const signatureStage = /signature|ready to submit|approved|complete/i.test(status);
  if (inReview && !signatureStage) {
    return {
      text: `Clinical Quality began treatment-plan review${record.TS_In_Review__c ? ` on ${String(isoDate(record.TS_In_Review__c))}` : ''}; no review disposition or requested edits are recorded.`,
      gateImpact: 'Clinical Quality review remains pending',
      actionOwner: CLINICAL_QUALITY,
      actionType: 'Clinical Review',
      recommendedAction:
        'Clinical Quality to complete the review and document approval or the exact edits required from the provider.',
      processRelevance: 11,
    };
  }
  const missing = [
    !record.Parent_Signature_Date__c ? 'parent' : null,
    !record.Provider_Signature_Date__c ? 'provider' : null,
  ]
    .filter(Boolean)
    .join(' and ');
  const owner = evidenceOwner(profile);
  return {
    text: `Clinical Quality shows ${status.toLowerCase()}; the ${missing} signature is not recorded.`,
    gateImpact: `Required ${missing} treatment-plan signature is missing`,
    actionOwner: owner,
    actionType: 'Provider Outreach',
    recommendedAction: `${owner} to obtain the missing ${missing} signature and document when submission can proceed.`,
    processRelevance: 10,
  };
}
function qualityFactType(gateImpact: string): string {
  if (/correction|edit/i.test(gateImpact)) return 'tp-revisions';
  if (/sign(?:ature|ed)/i.test(gateImpact)) return 'tp-signature';
  if (/payer submission/i.test(gateImpact)) return 'tp-ready';
  return 'tp-clinical-review';
}
function qualityEvent(
  record: ClinicalQualityEvidenceRecord,
  input: ClinicalQualityEvidenceInput
): StructuredEvidenceEvent {
  const notes = sourceHtmlText(
    [record.Treatment_Barriers_Notes__c, record.Signatures_Notes__c].filter(Boolean).join(' ')
  );
  const correction = extractRequestedInformation(notes);
  const eventDate =
    latestEvidenceDate(
      record.Parent_Signature_Date__c,
      record.Provider_Signature_Date__c,
      record.TS_Edits_Sent_for_Review__c,
      record.TS_In_Review__c,
      record.LastModifiedDate
    ) ?? input.asOf;
  const decision = qualityDecision({
    record,
    notes,
    correction,
    eventDate,
    profile: input.profile,
    status: firstEvidenceText(record.Treatment_Plan_Status__c) ?? 'status not recorded',
  });
  return structuredEvidenceEvent({
    opportunityId: input.profile.opportunityId,
    source: CLINICAL_QUALITY,
    sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
    eventDate,
    category: 'treatmentPlan',
    ...decision,
    rawText: notes || null,
    factType: qualityFactType(decision.gateImpact),
    requestedInformation: correction,
  });
}
export function adaptClinicalQuality(
  input: ClinicalQualityEvidenceInput
): StructuredEvidenceEvent[] {
  const treatmentPlanStage = /97151 started|treatment plan in-review/i.test(
    input.profile.stage ?? ''
  );
  if (categoryForGate(input.gate) !== 'treatmentPlan' && !treatmentPlanStage) return [];
  return (input.records ?? []).map((record) => qualityEvent(record, input));
}
