import { assessBillingClaims } from './billing-claims.js';
import { groupBillingClaims } from './billing-collection.js';
import { adaptBillingClaims, type BillingEvidenceEvent } from './billing-evidence.js';
import type { BillingState } from './billing-types.js';
import type { StructuredCollectionArtifacts } from './collection-decoding.js';
import type { ReportIdentityProfile } from './report-identity-types.js';
import {
  buildReportIdentityProfiles,
  reportConversationSearchPathways,
} from './report-identity.js';
import type { StructuredCollection } from './structured-collection.js';

export interface ReportBillingRow {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly searched: true;
  readonly searchedAt: string;
  readonly sourceObject: 'Billing_and_Claims__c';
  readonly sourceSystem: 'Salesforce Billing and Claims records';
  readonly records: StructuredCollection['billingClaims'];
  readonly reconciliation: BillingState;
  readonly events: readonly (BillingEvidenceEvent & {
    readonly id: BillingEvidenceEvent['sourceRecordId'];
    readonly summary: BillingEvidenceEvent['text'];
    readonly evidenceDate: BillingEvidenceEvent['eventDate'];
  })[];
}
export function buildReportBillingRows(
  data: StructuredCollection,
  identities: readonly ReportIdentityProfile[],
  asOf: Date | string
): ReportBillingRow[] {
  const cutoff = new Date(asOf).toISOString();
  const recordsByOpp = groupBillingClaims(
    data.billingClaims,
    data.opportunities.map((opp) => opp.Id)
  );
  const identityByOpp = new Map(identities.map((identity) => [identity.opportunityId, identity]));
  return data.opportunities.map((opp) => {
    const records = recordsByOpp.get(opp.Id) ?? [];
    const profile = identityByOpp.get(opp.Id);
    if (!profile) throw new Error('Report identity missing for collected Opportunity');
    return {
      opportunityId: opp.Id,
      opportunityName: opp.Name,
      searched: true,
      searchedAt: cutoff,
      sourceObject: 'Billing_and_Claims__c',
      sourceSystem: 'Salesforce Billing and Claims records',
      records,
      reconciliation: assessBillingClaims({
        records,
        opportunity: opp,
        asOf: cutoff,
        coverageComplete: true,
      }),
      events: adaptBillingClaims({
        records,
        opportunity: opp,
        profile,
        asOf: cutoff,
        coverageComplete: true,
      }).map((event) => ({
        ...event,
        id: event.sourceRecordId,
        summary: event.text,
        evidenceDate: event.eventDate,
      })),
    };
  });
}
export interface BillingReconciliationReport {
  readonly cutoff: string;
  readonly expectedRows: number;
  readonly processedRows: number;
  readonly completedSessionRows: number;
  readonly outstandingAssessmentRows: number;
  readonly confirmedGapRows: number;
  readonly reviewExceptionRows: number;
  readonly rows: readonly {
    readonly opportunityId: string;
    readonly gaps: readonly string[];
    readonly reviewReasons: readonly string[];
    readonly outstandingSessionIds: readonly (string | null | undefined)[];
  }[];
}
export function reportBillingReconciliation(
  rows: readonly ReportBillingRow[],
  expectedRows: number,
  asOf: Date | string
): BillingReconciliationReport {
  return {
    cutoff: new Date(asOf).toISOString(),
    expectedRows,
    processedRows: rows.length,
    completedSessionRows: rows.filter(
      (row) =>
        Boolean(row.reconciliation.firstAssessment) || Boolean(row.reconciliation.firstTreatment)
    ).length,
    outstandingAssessmentRows: rows.filter((row) => row.reconciliation.outstanding.length > 0)
      .length,
    confirmedGapRows: rows.filter((row) => row.reconciliation.gaps.length > 0).length,
    reviewExceptionRows: rows.filter(
      (row) => row.reconciliation.reviewReasons.length > 0 || row.reconciliation.gaps.length > 0
    ).length,
    rows: rows.map((row) => ({
      opportunityId: row.opportunityId,
      gaps: row.reconciliation.gaps,
      reviewReasons: row.reconciliation.reviewReasons,
      outstandingSessionIds: row.reconciliation.outstanding.map((item) => item.billingClaimId),
    })),
  };
}
export async function prepareCollectedReportContext(
  data: StructuredCollection,
  artifacts: StructuredCollectionArtifacts,
  asOf: Date | string
): Promise<{
  readonly identities: readonly ReportIdentityProfile[];
  readonly billingRows: readonly ReportBillingRow[];
}> {
  const identities = buildReportIdentityProfiles(data, asOf);
  await artifacts.write('identity_profile_rows.json', identities);
  await artifacts.write(
    'conversation_search_pathways.json',
    reportConversationSearchPathways(identities)
  );
  const billingRows = buildReportBillingRows(data, identities, asOf);
  await artifacts.write('billing_claim_rows.json', billingRows);
  await artifacts.write(
    'billing_reconciliation_report.json',
    reportBillingReconciliation(billingRows, data.opportunities.length, asOf)
  );
  return { identities, billingRows };
}
