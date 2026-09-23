import type { AuthorizationRecord } from './authorization-types.js';
import { authorizationSourceText as text } from './source-authorization-normalize.js';
import type {
  SourceAuthorizationOpportunity,
  SourceAuthorizationRecord,
} from './source-authorization-types.js';

export function sourceReviewSuperseded(
  review: SourceAuthorizationRecord,
  opp: SourceAuthorizationOpportunity
): boolean {
  const phase = text(review.Authorization_Type__c);
  const reviewTime = new Date(
    [review.LastModifiedDate, review.CreatedDate].find(Boolean) ?? 0
  ).valueOf();
  let signal: string | null | undefined = null;
  if (phase === 'Initial' && opp.Has_IA_Approved__c === true) {
    signal =
      [opp.IA_Approval_Checked_Timestamp__c, opp.LastStageChangeDate].find(Boolean) ??
      opp.SLA_Entry_Date__c;
  } else if (phase === 'Treatment' && opp.Treatment_Auth_Approval_Date__c) {
    signal =
      [opp.TA_Approval_Checked_Timestamp__c].find(Boolean) ?? opp.Treatment_Auth_Approval_Date__c;
  }
  if (!signal || !reviewTime) return false;
  const approvalTime = new Date(signal).valueOf();
  if (!Number.isFinite(approvalTime) || approvalTime <= reviewTime) return false;
  return /pending|review|additional details/i.test(
    `${review.Insurance_Determination__c ?? ''} ${review.Auth_Status__c ?? ''}`
  );
}
export function sourceApprovalMilestones(
  opp: SourceAuthorizationOpportunity,
  asOf: Date
): AuthorizationRecord[] {
  const milestones: AuthorizationRecord[] = [];
  if (opp.Treatment_Auth_Approval_Date__c) {
    const date = opp.Treatment_Auth_Approval_Date__c;
    milestones.push({
      id: `${[opp.Id].find(Boolean) ?? 'opportunity'}:treatment-approval`,
      authorizationType: 'Treatment',
      determination: 'Approved',
      status: 'Active',
      treatmentApprovalDate: date,
      createdDate: date,
      lastSubstantiveDate: date,
      active: true,
    });
  }
  if (opp.Has_IA_Approved__c === true) {
    const date =
      [
        opp.Initial_Auth_Approval_Date__c,
        opp.IA_Approval_Checked_Timestamp__c,
        opp.LastStageChangeDate,
        opp.SLA_Entry_Date__c,
      ].find(Boolean) ?? asOf.toISOString();
    milestones.push({
      id: `${[opp.Id].find(Boolean) ?? 'opportunity'}:initial-approval`,
      authorizationType: 'Initial',
      determination: 'Approved',
      status: 'Active',
      initialApprovalDate: date,
      createdDate: date,
      lastSubstantiveDate: date,
      active: true,
    });
  }
  return milestones;
}
