import {
  addFreshnessCandidate,
  latestFreshnessRecordDate,
  type FreshnessContext,
} from './freshness-candidates.js';
import { extractLatestSubstantiveNote } from './freshness-notes.js';
import type { FreshnessAuthorization } from './freshness-source-types.js';
import { firstEvidenceText } from './source-evidence-context.js';

function authorizationSummary(auth: FreshnessAuthorization): string {
  const current = `${auth.Auth_Status__c ?? ''} ${auth.Insurance_Determination__c ?? ''}`;
  const denial = /denied|partial|additional details|appeal|peer review|withdrawn/i.test(current);
  const resubmitted =
    /pending/i.test(current) &&
    Boolean(
      firstEvidenceText(auth.Treatment_Auth_Submission_Date__c, auth.Master_Submission_Date__c)
    ) &&
    /denied|denial/i.test(auth.Notes__c ?? '');
  return [
    auth.Name,
    auth.Auth_Status__c,
    auth.Insurance_Determination__c,
    resubmitted ? 'Resubmitted after a prior denial and awaiting a final determination' : null,
    denial && Boolean(firstEvidenceText(auth.Denial_Reason__c, auth.Denial_Reason_Explanation__c))
      ? `Prior denial: ${[auth.Denial_Reason__c, auth.Denial_Reason_Explanation__c].filter(Boolean).join(' - ')}`
      : null,
  ]
    .filter(Boolean)
    .join('; ');
}
function collectAuthorization(context: FreshnessContext, auth: FreshnessAuthorization): void {
  const at = latestFreshnessRecordDate([
    auth.Treatment_Auth_Approval_Date__c,
    auth.Treatment_Auth_Submission_Date__c,
    auth.Initial_Auth_Approval_Date__c,
    auth.Initial_Auth_Submission_Date__c,
    auth.Portal_Submission_Date__c,
    auth.Master_Approval_Date__c,
    auth.Master_Submission_Date__c,
  ]);
  const note = extractLatestSubstantiveNote(auth.Notes__c, auth.LastModifiedDate, context.asOf);
  addFreshnessCandidate(context.candidates, {
    at,
    source: 'Authorization',
    sourceRecordId: auth.Id,
    summary: authorizationSummary(auth),
  });
  if (note)
    addFreshnessCandidate(context.candidates, {
      at: note.at,
      source: 'Authorization',
      sourceRecordId: auth.Id,
      summary: [auth.Name, note.summary].filter(Boolean).join('; '),
      kind: 'operational-note',
      matchReasons: [
        note.explicitDate ? 'Dated authorization note' : 'Substantive authorization note',
      ],
    });
}
export function collectAuthorizationFreshness(context: FreshnessContext): void {
  if (context.family !== 'insurance') return;
  for (const auth of context.input.auths ?? []) collectAuthorization(context, auth);
  for (const review of context.input.authReviews ?? [])
    addFreshnessCandidate(context.candidates, {
      at: latestFreshnessRecordDate([
        review.Treatment_Auth_Approval_Date__c,
        review.Initial_Auth_Submission_Date__c,
        review.CreatedDate,
      ]),
      source: 'Authorization Review',
      sourceRecordId: review.Id,
      summary: [
        review.Name,
        review.Authorization_Type__c,
        review.Review_Status__c,
        review.Auth_Status__c,
        review.Insurance_Determination__c,
        review.Notes__c,
      ]
        .filter(Boolean)
        .join('; '),
    });
  const opp = context.input.opp;
  if (firstEvidenceText(opp.StageName, opp.Current_SLA__r?.Stage__c) !== 'Insurance Verification')
    return;
  for (const vob of context.input.vobs ?? [])
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceText(
        vob.Verification_Date_Entered_At__c,
        vob.Verification_Date__c,
        vob.Provider_Contacted_Date__c
      ),
      source: 'VOB',
      sourceRecordId: vob.Id,
      summary: [
        vob.Name,
        vob.Payor__r?.Name,
        vob.Verification_Status__c,
        vob.Eligibility_Status__c,
        vob.Notes__c,
      ]
        .filter(Boolean)
        .join('; '),
    });
}
export function collectClinicalFreshness(context: FreshnessContext): void {
  if (context.family !== 'treatmentPlan') return;
  const opp = context.input.opp;
  if (opp.Current_TP_Sent_for_Signatures__c)
    addFreshnessCandidate(context.candidates, {
      at: opp.Current_TP_Sent_for_Signatures__c,
      source: 'Treatment plan status',
      summary: `Treatment plan status: ${firstEvidenceText(opp.Current_Treatment_Plan_Status__c) ?? 'sent for signatures'}`,
    });
  for (const record of context.input.clinicalQuality ?? [])
    addFreshnessCandidate(context.candidates, {
      at: latestFreshnessRecordDate([
        record.Parent_Signature_Date__c,
        record.Provider_Signature_Date__c,
        record.TS_Edits_Sent_for_Review__c,
        record.TS_In_Review__c,
        record.LastModifiedDate,
        record.CreatedDate,
      ]),
      source: 'Clinical Quality',
      sourceRecordId: record.Id,
      summary: [
        'Treatment plan',
        record.Name,
        record.Treatment_Plan_Status__c,
        record.Parent_Signature_Date__c ? 'parent signed' : '',
        record.Provider_Signature_Date__c ? 'provider signed' : '',
        record.Treatment_Barriers_Notes__c,
        record.Signatures_Notes__c,
      ]
        .filter(Boolean)
        .join('; '),
    });
}
