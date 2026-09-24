import type {
  FreshnessAuthorization,
  FreshnessClinicalQuality,
  FreshnessVob,
} from './freshness-source-types.js';
import type { ReportSourceSummary } from './report-display-types.js';
import {
  reportLatestDate,
  reportPlainText,
  reportPreferred,
  reportTimestamp,
  reportTruncate,
} from './report-display-values.js';

function authDate(record: FreshnessAuthorization): string {
  return reportLatestDate(
    record.Treatment_Auth_Approval_Date__c,
    record.Treatment_Auth_Submission_Date__c,
    record.Master_Approval_Date__c,
    record.Master_Submission_Date__c,
    record.LastModifiedDate
  );
}
export function reportAuthorizationSummary(
  records: readonly FreshnessAuthorization[]
): ReportSourceSummary {
  const top = [...records].sort(
    (a, b) => reportTimestamp(authDate(b)) - reportTimestamp(authDate(a))
  )[0];
  if (!top) return { text: 'No Authorization rows found', quality: 'Not found', best: '' };
  const parts = [
    top.Name,
    top.Authorization_Type__c,
    top.Auth_Status__c,
    top.Insurance_Determination__c,
    top.Client_Insurance__c,
    top.Authorization_Number__c ? `auth ${top.Authorization_Number__c}` : '',
    top.Treatment_Auth_Submission_Date__c
      ? `TA submitted ${top.Treatment_Auth_Submission_Date__c}`
      : '',
    top.Treatment_Auth_Approval_Date__c ? `TA approved ${top.Treatment_Auth_Approval_Date__c}` : '',
    top.Denial_Reason__c ? `denial ${top.Denial_Reason__c}` : '',
    top.Denial_Reason_Explanation__c
      ? `denial note ${reportTruncate(top.Denial_Reason_Explanation__c, 120)}`
      : '',
    top.Notes__c ? `notes ${reportTruncate(top.Notes__c, 120)}` : '',
  ];
  return {
    text: reportTruncate(parts.filter(Boolean).join('; '), 700),
    quality: 'Direct',
    best: reportPreferred(top.Name, top.Id),
  };
}
export function reportVobSummary(records: readonly FreshnessVob[]): ReportSourceSummary {
  const top = [...records].sort(
    (a, b) =>
      reportTimestamp(
        reportPreferred(
          b.Verification_Date_Entered_At__c,
          b.Verification_Date__c,
          b.LastModifiedDate
        )
      ) -
      reportTimestamp(
        reportPreferred(
          a.Verification_Date_Entered_At__c,
          a.Verification_Date__c,
          a.LastModifiedDate
        )
      )
  )[0];
  if (!top) return { text: 'No VOB rows found', quality: 'Not found', best: '' };
  const parts = [
    top.Name,
    top.Payor__r?.Name,
    top.Verification_Status__c,
    top.Eligibility_Status__c,
    top.Verification_Date__c ? `verified ${top.Verification_Date__c}` : '',
    top.Provider_Contacted_Date__c ? `provider contacted ${top.Provider_Contacted_Date__c}` : '',
    top.Notes__c ? `notes ${reportPlainText(top.Notes__c)}` : '',
  ];
  return {
    text: reportTruncate(parts.filter(Boolean).join('; '), 700),
    quality: 'Direct',
    best: reportPreferred(top.Name, top.Id),
  };
}
function reviewParts(row: FreshnessAuthorization): string {
  return [
    row.Name,
    row.Authorization_Type__c,
    row.Review_Status__c,
    row.Auth_Status__c,
    row.Insurance_Determination__c,
    row.Initial_Auth_Submission_Date__c ? `submitted ${row.Initial_Auth_Submission_Date__c}` : '',
    row.Treatment_Auth_Approval_Date__c ? `TA approved ${row.Treatment_Auth_Approval_Date__c}` : '',
    row.Authorization_Number__c ? `auth ${row.Authorization_Number__c}` : '',
    row.Notes__c ? `notes ${reportPlainText(row.Notes__c)}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}
export function reportAuthorizationReviewSummary(
  records: readonly FreshnessAuthorization[]
): ReportSourceSummary {
  const sorted = [...records].sort(
    (a, b) =>
      reportTimestamp(
        reportPreferred(
          b.Initial_Auth_Submission_Date__c,
          b.Treatment_Auth_Approval_Date__c,
          b.CreatedDate
        )
      ) -
      reportTimestamp(
        reportPreferred(
          a.Initial_Auth_Submission_Date__c,
          a.Treatment_Auth_Approval_Date__c,
          a.CreatedDate
        )
      )
  );
  const top = sorted[0];
  if (!top) return { text: 'No Authorization Review rows found', quality: 'Not found', best: '' };
  return {
    text: reportTruncate(sorted.slice(0, 2).map(reviewParts).join(' | '), 800),
    quality: 'Direct',
    best: reportPreferred(top.Name, top.Id),
  };
}
function clinicalDate(record: FreshnessClinicalQuality): string {
  return reportLatestDate(
    record.Parent_Signature_Date__c,
    record.Provider_Signature_Date__c,
    record.TS_Edits_Sent_for_Review__c,
    record.TS_In_Review__c,
    record.CreatedDate
  );
}
export function reportClinicalQualitySummary(
  records: readonly FreshnessClinicalQuality[]
): ReportSourceSummary {
  const top = [...records].sort(
    (a, b) => reportTimestamp(clinicalDate(b)) - reportTimestamp(clinicalDate(a))
  )[0];
  if (!top) return { text: 'No Clinical Quality rows found', quality: 'Not found', best: '' };
  const parts = [
    top.Name,
    top.Treatment_Plan_Status__c,
    top.TS_In_Review__c ? `in review ${top.TS_In_Review__c.slice(0, 10)}` : '',
    top.TS_Edits_Sent_for_Review__c
      ? `edits sent ${top.TS_Edits_Sent_for_Review__c.slice(0, 10)}`
      : '',
    top.Provider_Signature_Date__c
      ? `provider signed ${top.Provider_Signature_Date__c.slice(0, 10)}`
      : '',
    top.Parent_Signature_Date__c
      ? `parent signed ${top.Parent_Signature_Date__c.slice(0, 10)}`
      : '',
    top.Treatment_Barriers_Notes__c
      ? `barriers ${reportPlainText(top.Treatment_Barriers_Notes__c)}`
      : '',
    top.Signatures_Notes__c ? `signature notes ${reportPlainText(top.Signatures_Notes__c)}` : '',
  ];
  return {
    text: reportTruncate(parts.filter(Boolean).join('; '), 800),
    quality: 'Direct',
    best: reportPreferred(top.Name, top.Id),
  };
}
