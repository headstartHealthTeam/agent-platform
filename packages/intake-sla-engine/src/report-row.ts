import { reviewExplanation } from './delay-history.js';
import { firefliesIdentityConfidence } from './fireflies-report-coverage.js';
import { createGenerationLedgerRow } from './generation-ledger.js';
import { formatLifecycleTimeline } from './publication-timeline.js';
import type { ReportMainRow } from './report-assembly.js';
import {
  reportNonNegativeDaysOnHold,
  reportPreferred,
  reportText,
  reportTruncate,
} from './report-display-values.js';
import { reportCurrentActionItem, reportCurrentSlaSummary } from './report-row-labels.js';
import type { ReportRowInput, ReportRowProjection } from './report-row-types.js';

function rowGaps(input: ReportRowInput): { finalGap: string; gaps: string } {
  const finalGap = reviewExplanation(
    input.finalReadyToCopy,
    [
      input.gap,
      input.identityMatchReview
        ? `Identity verification required: ${input.identityMatchReview}`
        : '',
      input.aiInterpretationGap,
      input.qualityReview.issues.length
        ? `Publication QA: ${input.qualityReview.issues.join(' ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
  const gaps = [
    input.portal.gap,
    !input.firefliesWasSearched && input.freshness.needsFireflies
      ? `Fireflies check required: ${reportText(input.freshness.firefliesReason, 'source not searched')}`
      : '',
    finalGap,
    input.unavailableEnrichmentSources.length
      ? `Non-blocking enrichment unavailable: ${input.unavailableEnrichmentSources.map((outcome) => outcome.source).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join('; ');
  return { finalGap, gaps };
}
function mainRow(input: ReportRowInput, finalGap: string): ReportMainRow {
  const { opp, sla, expanded, freshness, actionModel, reviewerState, outstandingTasks } = input;
  return [
    opp.Name,
    `${input.sfBaseUrl}/${opp.Id}/view`,
    reportText(opp.Headstart_Practice__r?.Name),
    input.provider,
    reportText(opp.CSM__c),
    reportText(opp.StageName),
    Math.abs(Number(opp.SL_Due__c ?? sla.Due__c ?? 0)),
    expanded.blocker,
    freshness.updateFreshness,
    freshness.latestUpdateAt ? freshness.latestUpdateAt.slice(0, 10) : '',
    freshness.latestUpdateSource,
    reportTruncate(
      reportText(freshness.latestUpdateFact, 'No dated substantive update found.'),
      260
    ),
    input.identityMatchReview,
    expanded.summary,
    input.inDepthSummary,
    outstandingTasks.count,
    outstandingTasks.subjects,
    outstandingTasks.owners,
    outstandingTasks.statuses,
    outstandingTasks.dueDates,
    expanded.action,
    actionModel.actionType,
    actionModel.actionOwner,
    actionModel.followUpDate,
    input.finalReadyToCopy,
    finalGap,
    reportPreferred(reviewerState.reviewerNotes, ''),
    Object.hasOwn(reviewerState, 'copiedToSalesforce') ? reviewerState.copiedToSalesforce : '',
    Object.hasOwn(reviewerState, 'needsCsmReview') ? reviewerState.needsCsmReview : '',
    reportCurrentSlaSummary(sla),
    reportCurrentActionItem(sla),
    input.milestone,
    actionModel.followUpDateBasis,
    input.finalEvidenceStatus,
    expanded.bestSource,
    reportPreferred(reviewerState.reviewedBy, ''),
    reportPreferred(reviewerState.reviewedAt, ''),
  ];
}
function evidenceRow(input: ReportRowInput, gaps: string): readonly unknown[] {
  const { opp, sla, story, expanded, summaries, authorizationGate } = input;
  const hasConflict = Boolean(expanded.evidenceConflict);
  return [
    opp.Name,
    opp.Id,
    reportText(opp.Current_SLA__c),
    reportText(sla.Reason_for_Delay__c),
    reportText(sla.Reason_for_Delay_Notes__c),
    input.slaNoteClassification.provenance,
    input.slaNoteClassification.admittedText,
    story.storyStartDate.slice(0, 10),
    story.storyWindowBasis,
    story.activeIssues
      .map(
        (issue) =>
          `${issue.issueKey}: ${issue.state}${issue.lastUpdatedDate ? ` (${issue.lastUpdatedDate})` : ''}`
      )
      .join('; '),
    story.resolvedIssues
      .map(
        (issue) =>
          `${issue.issueKey}: resolved${issue.resolvedDate ? ` ${issue.resolvedDate}` : ''}`
      )
      .join('; '),
    formatLifecycleTimeline(story.timeline),
    authorizationGate.required
      ? [
          authorizationGate.phase,
          authorizationGate.status,
          authorizationGate.determination,
          authorizationGate.authStatus,
          authorizationGate.payer,
          authorizationGate.recordId,
        ]
          .filter(Boolean)
          .join('; ')
      : 'No authorization prerequisite applies to the current gate.',
    expanded.confidence,
    firefliesIdentityConfidence(input.firefliesCoverage, input.identityMatchReview),
    input.blockingSources.length
      ? 'Blocked'
      : input.unavailableEnrichmentSources.length
        ? 'Partial'
        : 'Complete',
    hasConflict ? 'Yes' : 'No',
    input.aiInterpretationStatus,
    input.conversationMatchAudit,
    expanded.sourceQuality,
    input.provider,
    reportText(opp.IA_Rendering_Provider__r?.Name),
    reportText(opp.TA_Rendering_Provider__r?.Name),
    reportText(opp.Rendering_Provider__r?.Name),
    summaries.auth,
    summaries.authReview,
    summaries.vob,
    summaries.cq,
    summaries.rbt,
    summaries.candidates,
    summaries.comms,
    input.portal.result,
    input.firefliesResult,
    input.alohaClaimsResult,
    input.sourceOutcomes.map((outcome) => `${outcome.source}: ${outcome.status}`).join('; '),
    reportTruncate(input.freshness.latestUpdateSummary, 500),
    gaps,
    input.qualityReview.issues.join(' '),
  ];
}
/** Project an already evaluated row. No evidence admission, provider call or publication occurs here. */
export function projectReportRow<Evidence>(
  input: ReportRowInput<Evidence>
): ReportRowProjection<Evidence> {
  const { opp } = input;
  const { finalGap, gaps } = rowGaps(input);
  return {
    finalGap,
    gaps,
    generationLedgerRow: createGenerationLedgerRow({
      runId: input.runId,
      slaId: opp.Current_SLA__c,
      opportunityId: opp.Id,
      engineVersion: input.engineVersion,
      sourceCutoff: input.runAt.toISOString(),
      generatedAt: input.runAt.toISOString(),
      generatedSummary: input.expanded.summary,
      operationalSummary: input.inDepthSummary,
      publicationStatus: 'Built - Pending Publish',
    }),
    entry: {
      main: mainRow(input, finalGap),
      evidence: evidenceRow(input, gaps),
      normalizedEvidence: input.combinedEvidence,
      onHold: Boolean(opp.On_Hold__c),
      holdFields: [
        reportText(opp.On_Hold_Reason__c, opp.Last_On_Hold_Reason__c),
        opp.On_Hold_Start_Date__c ? opp.On_Hold_Start_Date__c.slice(0, 10) : '',
        reportNonNegativeDaysOnHold(opp, input.runAt),
        reportText(opp.On_Hold_Notes__c, opp.Off_Hold_Reason__c),
      ],
    },
  };
}
