import { isExcludedOpportunity, type OpportunityDisposition } from './contracts.js';
import type { RbtRequestEvidenceRecord } from './rbt-request-evidence.js';
import { reportPreferred, reportText, reportTimestamp } from './report-display-values.js';
import type { SourceAuthorizationRecord } from './source-authorization-types.js';
import type { StaffingEvidenceRecord } from './staffing-evidence.js';

interface CollectionPractice {
  readonly Name?: string | null | undefined;
  readonly Business_Email__c?: string | null | undefined;
  readonly Business_Phone__c?: string | null | undefined;
}
interface CollectionProvider {
  readonly Practice_Name__c?: string | null | undefined;
  readonly Practice_Name__r?: CollectionPractice | null | undefined;
}
export interface CollectionOpportunity extends OpportunityDisposition {
  readonly Name?: string | null | undefined;
  readonly Rendering_Provider__r?: CollectionProvider | null | undefined;
  readonly IA_Rendering_Provider__r?: CollectionProvider | null | undefined;
  readonly TA_Rendering_Provider__r?: CollectionProvider | null | undefined;
  readonly Headstart_Practice__c?: string | null | undefined;
  readonly Headstart_Practice__r?: CollectionPractice | null | undefined;
  readonly Practice_Name__c?: string | null | undefined;
  readonly Intake_Notes__c?: string | null | undefined;
  readonly Notes__c?: string | null | undefined;
}
interface OpportunityProjection {
  readonly Headstart_Practice__c: string | null | undefined;
  readonly Headstart_Practice__r: CollectionPractice;
  readonly Intake_Notes__c: string;
}
export function normalizeCollectedOpportunities<T extends CollectionOpportunity>(
  records: readonly T[]
): (Omit<T, keyof OpportunityProjection> & OpportunityProjection)[] {
  return records
    .map((opp) => {
      const providerPractice = reportPreferred(
        opp.Rendering_Provider__r?.Practice_Name__r,
        opp.IA_Rendering_Provider__r?.Practice_Name__r,
        opp.TA_Rendering_Provider__r?.Practice_Name__r,
        null
      );
      const providerPracticeId = reportPreferred(
        opp.Rendering_Provider__r?.Practice_Name__c,
        opp.IA_Rendering_Provider__r?.Practice_Name__c,
        opp.TA_Rendering_Provider__r?.Practice_Name__c,
        null
      );
      return {
        ...opp,
        Headstart_Practice__c: reportPreferred(opp.Headstart_Practice__c, providerPracticeId),
        Headstart_Practice__r: opp.Headstart_Practice__r ??
          providerPractice ?? { Name: reportText(opp.Practice_Name__c) },
        Intake_Notes__c: reportText(opp.Intake_Notes__c, opp.Notes__c),
      };
    })
    .filter((opp) => !/\btest\b/i.test(reportText(opp.Name)) && !isExcludedOpportunity(opp));
}
interface AuthorizationProjection {
  readonly Authorization_Type__c: string;
  readonly Authorization_Number__c: string;
  readonly Insurance_Determination__c: string;
  readonly Notes__c: string;
  readonly Initial_Auth_Submission_Date__c: string | null | undefined;
  readonly Treatment_Auth_Submission_Date__c: string | null | undefined;
  readonly Initial_Auth_Approval_Date__c: string | null | undefined;
  readonly Treatment_Auth_Approval_Date__c: string | null | undefined;
}
/** Collection enrichment, distinct from gate/evidence normalization and phase decisions. */
export function normalizeCollectedAuthorizations<T extends SourceAuthorizationRecord>(
  authorizations: readonly T[],
  reviews: readonly SourceAuthorizationRecord[]
): (Omit<T, keyof AuthorizationProjection> & AuthorizationProjection)[] {
  const byAuthorization = new Map<string, SourceAuthorizationRecord>();
  for (const review of [...reviews].sort(
    (left, right) =>
      reportTimestamp(reportPreferred(right.LastModifiedDate, right.CreatedDate)) -
      reportTimestamp(reportPreferred(left.LastModifiedDate, left.CreatedDate))
  )) {
    if (review.Authorization__c && !byAuthorization.has(review.Authorization__c))
      byAuthorization.set(review.Authorization__c, review);
  }
  return authorizations.map((authorization) => {
    const review = byAuthorization.get(authorization.Id ?? '') ?? {};
    const type = reportText(authorization.Authorization_Type__c, review.Authorization_Type__c);
    return {
      ...authorization,
      Authorization_Type__c: type,
      Authorization_Number__c: reportText(
        authorization.Authorization_Number__c,
        review.Authorization_Number__c
      ),
      Insurance_Determination__c: reportText(
        authorization.Insurance_Determination__c,
        review.Insurance_Determination__c
      ),
      Notes__c: reportText(authorization.Notes__c, review.Notes__c),
      Initial_Auth_Submission_Date__c: reportPreferred(
        authorization.Initial_Auth_Submission_Date__c,
        review.Initial_Auth_Submission_Date__c,
        /initial/i.test(type) ? authorization.Master_Submission_Date__c : null
      ),
      Treatment_Auth_Submission_Date__c: reportPreferred(
        authorization.Treatment_Auth_Submission_Date__c,
        /treatment/i.test(type) ? authorization.Master_Submission_Date__c : null
      ),
      Initial_Auth_Approval_Date__c: reportPreferred(
        authorization.Initial_Auth_Approval_Date__c,
        /initial/i.test(type) ? authorization.Master_Approval_Date__c : null
      ),
      Treatment_Auth_Approval_Date__c: reportPreferred(
        authorization.Treatment_Auth_Approval_Date__c,
        review.Treatment_Auth_Approval_Date__c,
        /treatment/i.test(type) ? authorization.Master_Approval_Date__c : null
      ),
    };
  });
}
export type CollectionRbtRequest = RbtRequestEvidenceRecord & {
  readonly Inactive__c?: boolean | null | undefined;
  readonly RBT_Inactive_Date__c?: string | null | undefined;
};
export function normalizeCollectedRbtRequests<T extends CollectionRbtRequest>(
  records: readonly T[]
): (Omit<T, 'Date_Closed__c'> & { readonly Date_Closed__c: string | null | undefined })[] {
  return records.map((row) => ({
    ...row,
    Date_Closed__c: reportPreferred(
      row.Date_Closed__c,
      row.Inactive__c ? reportPreferred(row.RBT_Inactive_Date__c, row.LastModifiedDate) : null
    ),
  }));
}
export function normalizeCollectedStaffing<T extends StaffingEvidenceRecord>(
  records: readonly T[],
  assignedLookup = false
): (Omit<T, 'Billable_Start_Date__c'> & {
  readonly Billable_Start_Date__c: string | null | undefined;
})[] {
  return records.map((row) => ({
    ...row,
    Billable_Start_Date__c: assignedLookup
      ? row.First_Billable_Date__c
      : reportPreferred(row.Billable_Start_Date__c, row.First_Billable_Date__c),
  }));
}
export function mergeCollectedStaffing<T extends StaffingEvidenceRecord>(
  direct: readonly T[],
  assigned: readonly T[]
): T[] {
  return [...new Map([...direct, ...assigned].map((row) => [row.Id, row])).values()];
}
