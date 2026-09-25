import { resolveAuthorizationGate } from './authorization-gate.js';
import type { AuthorizationGate, AuthorizationRecord } from './authorization-types.js';
import {
  sourceApprovalMilestones,
  sourceReviewSuperseded,
} from './source-authorization-milestones.js';
import {
  authorizationSourceText as text,
  latestAuthorizationNoteDate,
  normalizeSourceAuthorization,
  normalizeSourceAuthorizationReview,
} from './source-authorization-normalize.js';
import type {
  SourceAuthorizationGate,
  SourceAuthorizationInput,
  SourceAuthorizationNotRequired,
  SourceAuthorizationOpportunity,
  SourceAuthorizationRecord,
} from './source-authorization-types.js';

type Phase = 'Initial' | 'Treatment';
const BLOCKERS = new Map<string, string>([
  ['Missing', 'not found'],
  ['Conflict', 'records conflict'],
  ['Additional Details Required', 'requires additional details'],
  ['Appeal', 'appeal pending'],
  ['Peer Review', 'in peer review'],
  ['Pending Review', 'in clinical review'],
  ['Partial Approval', 'partially approved'],
  ['Denied', 'denied'],
  ['Withdrawn', 'withdrawn'],
]);
function gateFromResolution<T extends SourceAuthorizationRecord>(
  phase: Phase,
  required: boolean,
  resolution: AuthorizationGate,
  records: readonly T[],
  asOf: Date
): SourceAuthorizationGate<T> {
  const recordId = [resolution.blockingRecordId, resolution.authorizationId].find(Boolean) ?? '';
  const record = records.find((candidate) => candidate.Id === recordId) ?? null;
  const satisfied = resolution.satisfied;
  return {
    phase: phase.toLowerCase(),
    required,
    satisfied,
    status: satisfied ? 'Satisfied' : 'Unresolved',
    state: resolution.state,
    blocker: satisfied
      ? ''
      : `${phase} authorization ${BLOCKERS.get(resolution.state) ?? 'pending'}`,
    reason: resolution.reason,
    recordId,
    authorizationId: resolution.authorizationId ?? '',
    blockingRecordId: resolution.blockingRecordId ?? '',
    recordName: record?.Name ?? '',
    authorizationNumber: record?.Authorization_Number__c ?? '',
    payer:
      [resolution.payer, record?.Payor_Name__r?.Name, record?.Payor_Name__c].find(Boolean) ?? '',
    submissionDate: resolution.submissionDate ?? '',
    approvalDate: resolution.determinationDate ?? '',
    determination: [record?.Insurance_Determination__c].find(Boolean) ?? resolution.state,
    authStatus: record?.Auth_Status__c ?? '',
    denialOccurred: resolution.denialOccurred === true,
    denialReason: resolution.denialReason ?? '',
    denialExplanation: resolution.denialExplanation ?? '',
    appealKind: resolution.appealKind ?? '',
    eventDate:
      [
        resolution.determinationDate,
        latestAuthorizationNoteDate(record ?? {}, asOf),
        resolution.submissionDate,
        record?.LastModifiedDate,
        record?.CreatedDate,
      ].find(Boolean) ?? '',
    conflict: resolution.conflict,
    conflictReason: resolution.conflict ? resolution.reason : '',
    coverages: resolution.coverages ?? [],
    record,
  };
}
function normalizedRecords(
  stage: string,
  opp: SourceAuthorizationOpportunity,
  auths: readonly SourceAuthorizationRecord[],
  reviews: readonly SourceAuthorizationRecord[],
  asOf: Date
): AuthorizationRecord[] {
  const phase = /^IA Requested$/i.test(stage)
    ? 'Initial'
    : /^TA Requested$/i.test(stage)
      ? 'Treatment'
      : '';
  const normalized = auths.map((record) =>
    normalizeSourceAuthorization(
      {
        ...record,
        Authorization_Type__c:
          [record.Authorization_Type__c].find(Boolean) ??
          (text([record.Denial_Reason__c].find(Boolean) ?? record.Denial_Reason_Explanation__c)
            ? phase
            : ''),
      },
      asOf
    )
  );
  normalized.push(
    ...reviews
      .filter(
        (review) =>
          Boolean(text(review.Authorization_Type__c)) &&
          !sourceReviewSuperseded(review, opp) &&
          (!review.Authorization__c ||
            !auths.some((record) => record.Id === review.Authorization__c))
      )
      .map((review) => normalizeSourceAuthorizationReview(review, opp, asOf)),
    ...sourceApprovalMilestones(opp, asOf)
  );
  return normalized;
}
function needsTreatment(
  stage: string,
  opp: SourceAuthorizationOpportunity,
  normalized: readonly AuthorizationRecord[],
  resolution: AuthorizationGate
): boolean {
  const planStage = /Treatment Plan|97151/i.test(stage);
  const entryDate =
    [
      opp.LastStageChangeDate,
      text(opp.Current_SLA__r?.Stage__c) === stage ? opp.Current_SLA__r?.CreatedDate : null,
    ].find(Boolean) ?? null;
  const entry = entryDate ? new Date(entryDate).valueOf() : null;
  const submitted = normalized.some(
    (record) =>
      record.authorizationType === 'Treatment' &&
      Boolean(record.treatmentSubmissionDate) &&
      (!planStage ||
        entry === null ||
        !Number.isFinite(entry) ||
        new Date(record.treatmentSubmissionDate ?? '').valueOf() >= entry)
  );
  return (
    /TA Requested|TA Approved|First Day of 97153|97153 Scheduled|Pending Treatment Start/i.test(
      stage
    ) ||
    (planStage && submitted && !resolution.satisfied)
  );
}
/** Preserves the approved live field interpretation; no Salesforce mutation or new business rule. */
export function resolveSourceAuthorizationGate<
  T extends SourceAuthorizationRecord = SourceAuthorizationRecord,
>({
  opp,
  auths = [],
  authReviews = [],
  asOf = new Date(),
}: SourceAuthorizationInput<T>): SourceAuthorizationGate<T> | SourceAuthorizationNotRequired {
  const date = asOf instanceof Date ? asOf : new Date(asOf);
  const stage = text([opp.StageName].find(Boolean) ?? opp.Current_SLA__r?.Stage__c);
  const normalized = normalizedRecords(stage, opp, auths, authReviews, date);
  const initial = resolveAuthorizationGate({
    phase: 'Initial',
    authorizations: normalized,
    asOf: date.toISOString(),
  });
  const treatment = resolveAuthorizationGate({
    phase: 'Treatment',
    authorizations: normalized,
    asOf: date.toISOString(),
  });
  const initialRequired =
    /Insurance Verification|IA Requested|IA Approved|IA Scheduled|IC Scheduled|IC Completed/i.test(
      stage
    ) &&
    (stage !== 'Insurance Verification' || initial.state !== 'Missing');
  const treatmentRequired = needsTreatment(stage, opp, normalized, treatment);
  const initialGate = gateFromResolution('Initial', initialRequired, initial, auths, date);
  const treatmentGate = gateFromResolution('Treatment', treatmentRequired, treatment, auths, date);
  if (initialRequired && !initialGate.satisfied) return initialGate;
  if (treatmentRequired) return treatmentGate;
  if (initialRequired) return initialGate;
  return {
    phase: '',
    required: false,
    satisfied: true,
    status: 'Not Required',
    state: 'Not Required',
    blocker: '',
    reason: 'No unresolved authorization prerequisite applies to the current process gate.',
    recordId: '',
    conflict: false,
    coverages: [],
  };
}
