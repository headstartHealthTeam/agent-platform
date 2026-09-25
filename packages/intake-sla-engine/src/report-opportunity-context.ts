import { isGeneratedSlaDraft } from './freshness-notes.js';
import type { GeneratedNoteLedgerEntry, SlaNoteClassification } from './generation-ledger.js';
import { classifyCurrentSlaNote } from './generation-ledger.js';
import {
  matchReportCommunication,
  type ReportCommunicationMatch,
} from './report-communication-match.js';
import { reportClean, reportGroupBy } from './report-display-values.js';
import type { ReportIdentityProfile } from './report-identity-types.js';
import { reportCandidateSummary, reportRbtSummary } from './report-staffing-summaries.js';
import {
  reportAuthorizationSummary,
  reportAuthorizationReviewSummary,
  reportVobSummary,
  reportClinicalQualitySummary,
} from './report-structured-summaries.js';
import { reportCommunicationsSummary } from './report-task-display.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';
import { linkStaffingByOpportunity } from './staffing-linkage.js';
import type { StructuredCollection } from './structured-collection.js';

type Row<Key extends keyof StructuredCollection> = StructuredCollection[Key][number];
type SourceIndex<Key extends keyof StructuredCollection> = ReadonlyMap<
  string | null | undefined,
  readonly Row<Key>[]
>;
type Sla = NonNullable<Row<'opportunities'>['Current_SLA__r']>;
type EvidenceSla = Sla & { readonly Reason_for_Delay_Notes__c: string };
export interface ReportStructuredIndex {
  readonly data: StructuredCollection;
  readonly auths: SourceIndex<'authorizations'>;
  readonly authReviews: SourceIndex<'authorizationReviews'>;
  readonly vobs: SourceIndex<'vobs'>;
  readonly clinicalQuality: SourceIndex<'clinicalQuality'>;
  readonly rbts: SourceIndex<'rbtRequests'>;
  readonly staffing: ReadonlyMap<string, readonly Row<'staffing'>[]>;
  readonly tickets: SourceIndex<'ticketMatches'>;
  readonly interviews: SourceIndex<'firstInterviews'>;
  readonly talent: ReadonlyMap<string | null | undefined, Row<'talentAcquisition'>>;
  readonly history: SourceIndex<'opportunityHistory'>;
  readonly cohortNames: readonly string[];
}
export interface ReportOpportunityContext {
  readonly opp: Row<'opportunities'>;
  readonly identity: ReportIdentityProfile;
  readonly sla: Sla;
  readonly evidenceSla: EvidenceSla;
  readonly evidenceOpp: Row<'opportunities'> & { readonly Current_SLA__r: EvidenceSla };
  readonly slaNoteClassification: SlaNoteClassification;
  readonly auths: readonly Row<'authorizations'>[];
  readonly authReviews: readonly Row<'authorizationReviews'>[];
  readonly authorizationGate: ReturnType<
    typeof resolveSourceAuthorizationGate<Row<'authorizations'>>
  >;
  readonly vobs: readonly Row<'vobs'>[];
  readonly clinicalQuality: readonly Row<'clinicalQuality'>[];
  readonly rbts: readonly Row<'rbtRequests'>[];
  readonly staffing: readonly Row<'staffing'>[];
  readonly tasks: readonly (Row<'tasks'> & ReportCommunicationMatch)[];
  readonly taskUpdates: readonly (Row<'taskUpdates'> & ReportCommunicationMatch)[];
  readonly aircalls: readonly (Row<'aircalls'> & ReportCommunicationMatch)[];
  readonly ticketMatches: readonly Row<'ticketMatches'>[];
  readonly firstInterviews: readonly Row<'firstInterviews'>[];
  readonly talent: readonly Row<'talentAcquisition'>[];
  readonly history: readonly Row<'opportunityHistory'>[];
  readonly summaries: {
    readonly auth: ReturnType<typeof reportAuthorizationSummary>;
    readonly authReview: ReturnType<typeof reportAuthorizationReviewSummary>;
    readonly vob: ReturnType<typeof reportVobSummary>;
    readonly cq: ReturnType<typeof reportClinicalQualitySummary>;
    readonly rbt: ReturnType<typeof reportRbtSummary>;
    readonly candidates: ReturnType<typeof reportCandidateSummary>;
    readonly comms: ReturnType<typeof reportCommunicationsSummary>;
  };
}
export function indexReportStructuredSources(data: StructuredCollection): ReportStructuredIndex {
  return {
    data,
    auths: reportGroupBy(data.authorizations, (row) => row.Client_Opportunity_Record__c),
    authReviews: reportGroupBy(
      data.authorizationReviews,
      (row) => row.Client_Opportunity_Record__c
    ),
    vobs: reportGroupBy(data.vobs, (row) => row.Client_Opportunity__c),
    clinicalQuality: reportGroupBy(data.clinicalQuality, (row) => row.Opportunity__c),
    rbts: reportGroupBy(data.rbtRequests, (row) => row.Client_Opportunity__c),
    staffing: linkStaffingByOpportunity({
      staffingRecords: data.staffing,
      rbtRequests: data.rbtRequests,
    }),
    tickets: reportGroupBy(data.ticketMatches, (row) => row.RBT_Request__c),
    interviews: reportGroupBy(data.firstInterviews, (row) => row.Candidate__c),
    talent: new Map<
      StructuredCollection['ticketMatches'][number]['Candidate__c'],
      StructuredCollection['talentAcquisition'][number]
    >(data.talentAcquisition.map((row) => [row.Id, row])),
    history: reportGroupBy(data.opportunityHistory, (row) => row.OpportunityId),
    cohortNames: data.opportunities.map((opp) => reportClean(opp.Name).toLowerCase()),
  };
}
export function prepareReportOpportunity({
  opportunity: opp,
  identity,
  index,
  ledgerRows,
  runAt,
}: {
  readonly opportunity: StructuredCollection['opportunities'][number];
  readonly identity: ReportIdentityProfile;
  readonly index: ReportStructuredIndex;
  readonly ledgerRows: readonly GeneratedNoteLedgerEntry[];
  readonly runAt: Date;
}): ReportOpportunityContext {
  const sla = opp.Current_SLA__r ?? {};
  const slaNoteClassification = classifyCurrentSlaNote({
    note: sla.Reason_for_Delay_Notes__c,
    opportunityId: opp.Id,
    slaId: opp.Current_SLA__c,
    ledgerRows,
    generatedPatternMatch: isGeneratedSlaDraft(sla.Reason_for_Delay_Notes__c),
  });
  const evidenceSla = { ...sla, Reason_for_Delay_Notes__c: slaNoteClassification.admittedText };
  const evidenceOpp = { ...opp, Current_SLA__r: evidenceSla };
  const auths = index.auths.get(opp.Id) ?? [];
  const authReviews = index.authReviews.get(opp.Id) ?? [];
  const authorizationGate = resolveSourceAuthorizationGate({
    opp,
    auths,
    authReviews,
    asOf: runAt,
  });
  const vobs = index.vobs.get(opp.Id) ?? [];
  const clinicalQuality = index.clinicalQuality.get(opp.Id) ?? [];
  const rbts = index.rbts.get(opp.Id) ?? [];
  const staffing = index.staffing.get(opp.Id) ?? [];
  const tasks = index.data.tasks.flatMap((row) => {
    const match = matchReportCommunication(opp, row, identity, index.cohortNames);
    return match ? [match] : [];
  });
  const taskUpdates = index.data.taskUpdates.flatMap((row) => {
    const match = matchReportCommunication(opp, row, identity, index.cohortNames);
    return match ? [match] : [];
  });
  const aircalls = index.data.aircalls.flatMap((row) => {
    const match = matchReportCommunication(opp, row, identity, index.cohortNames);
    return match ? [match] : [];
  });
  const ticketMatches = rbts.flatMap((request) => index.tickets.get(request.Id) ?? []);
  const firstInterviews = [
    ...new Map(
      ticketMatches
        .flatMap((match) => index.interviews.get(match.Candidate__c) ?? [])
        .map((row) => [row.Id, row])
    ).values(),
  ];
  const talent = ticketMatches.flatMap((match) => {
    const record = index.talent.get(match.Candidate__c);
    return record ? [record] : [];
  });
  return {
    opp,
    identity,
    sla,
    evidenceSla,
    evidenceOpp,
    slaNoteClassification,
    auths,
    authReviews,
    authorizationGate,
    vobs,
    clinicalQuality,
    rbts,
    staffing,
    tasks,
    taskUpdates,
    aircalls,
    ticketMatches,
    firstInterviews,
    talent,
    history: index.history.get(opp.Id) ?? [],
    summaries: {
      auth: reportAuthorizationSummary(auths),
      authReview: reportAuthorizationReviewSummary(authReviews),
      vob: reportVobSummary(vobs),
      cq: reportClinicalQualitySummary(clinicalQuality),
      rbt: reportRbtSummary(rbts, staffing),
      candidates: reportCandidateSummary(ticketMatches, firstInterviews),
      comms: reportCommunicationsSummary(tasks, aircalls, taskUpdates),
    },
  };
}
