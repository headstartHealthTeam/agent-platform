import type { ConversationSearchResult, SearchMatch } from './conversation-search-result.js';
import type { DelayHistoryReceipt } from './delay-history-types.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import type { EvidenceEvent } from './evidence.js';
import type {
  FirefliesPrecomputed,
  FirefliesSuppliedInterpretation,
} from './fireflies-evidence-types.js';
import type { GeneratedNoteLedgerEntry } from './generation-ledger.js';
import type { NoteAdjudicator } from './note-adjudication-types.js';
import type { ReviewerSnapshotRow } from './publication-state.js';
import {
  assembleReportAuthoritativeEvidence,
  reportAdapterGate,
} from './report-authoritative-evidence.js';
import type { ReportBillingRow } from './report-billing.js';
import { prepareReportCommunicationEvidence } from './report-communication-evidence.js';
import { prepareReportComparison } from './report-comparison-context.js';
import { reportConversationDisplay } from './report-conversation-display.js';
import { projectReportFinalContext } from './report-final-context.js';
import type {
  ReportCollectedSourceOutcome,
  ReportInterpretationRecord,
} from './report-finalization.js';
import type { ReportIdentityProfile } from './report-identity-types.js';
import {
  evaluateReportInterpretation,
  type ReportInterpretation,
  type ReportInterpreterExecution,
} from './report-interpretation.js';
import {
  prepareReportOpportunity,
  type ReportStructuredIndex,
} from './report-opportunity-context.js';
import { buildReportRecommendation } from './report-recommendation.js';
import { evaluateReportRowQuality } from './report-row-quality.js';
import { reportNextMilestone } from './report-row-review.js';
import type { ReportRowProjection } from './report-row-types.js';
import { projectReportRow } from './report-row.js';
import { prepareReportSavedEvidence } from './report-saved-evidence.js';
import type { ReportSourceOutcomesInput } from './report-source-outcome-types.js';
import { evaluateReportSourceOutcomes } from './report-source-outcomes.js';
import { reportOutstandingTaskFields } from './report-task-display.js';
import type { SavedReportSources } from './saved-source-context.js';
import type { StructuredCollection } from './structured-collection.js';

export interface ReportEvaluationContext<T extends FirefliesSuppliedInterpretation> {
  readonly index: ReportStructuredIndex;
  readonly identities: ReadonlyMap<string, ReportIdentityProfile>;
  readonly billing: ReadonlyMap<string, ReportBillingRow>;
  readonly saved: SavedReportSources;
  readonly ledgerRows: readonly GeneratedNoteLedgerEntry[];
  readonly reviewerState: ReadonlyMap<unknown, ReviewerSnapshotRow>;
  readonly noteAdjudicator: NoteAdjudicator;
  readonly interpretation: {
    readonly requested: boolean;
    readonly execution: ReportInterpreterExecution;
    readonly precomputed: ReadonlyMap<string, FirefliesPrecomputed<T>>;
  };
  readonly runId: string;
  readonly runAt: Date;
  readonly sfBaseUrl: string;
}
export interface EvaluatedReportRow<
  T extends FirefliesSuppliedInterpretation,
> extends ReportRowProjection<EvidenceEvent> {
  readonly sources: readonly ReportCollectedSourceOutcome[];
  readonly delayHistory: DelayHistoryReceipt;
  readonly searches: readonly ConversationSearchResult<SearchMatch>[];
  readonly interpretation: ReportInterpretationRecord<ReportInterpretation<T>>;
  readonly interpretationUsage: { readonly inputTokens: number; readonly outputTokens: number };
}
/** One frozen report row; injected interpretation is the only possible provider operation here. */
export async function evaluateReportOpportunity<T extends FirefliesSuppliedInterpretation>(
  opportunity: StructuredCollection['opportunities'][number],
  input: ReportEvaluationContext<T>
): Promise<EvaluatedReportRow<T>> {
  const { runAt, runId, index } = input;
  const identity = input.identities.get(opportunity.Id);
  if (!identity) throw new Error('Report identity missing for collected Opportunity');
  const context = prepareReportOpportunity({
    opportunity,
    identity,
    index,
    ledgerRows: input.ledgerRows,
    runAt,
  });
  const saved = prepareReportSavedEvidence(
    context,
    input.saved,
    input.billing,
    index.data.opportunities.length
  );
  const interpretation = await evaluateReportInterpretation({
    context,
    runAt,
    identities: input.identities,
    cohortNames: index.data.opportunities.map((opp) => opp.Name),
    noteAdjudicator: input.noteAdjudicator,
    requested: input.interpretation.requested,
    execution: input.interpretation.execution,
    precomputed: input.interpretation.precomputed.get(opportunity.Id),
    firefliesRow: saved.fireflies,
    slackRow: saved.slack?.evidence,
    portalInput: saved.portal.input,
    billingEvents: saved.billing?.events ?? [],
    gmailEvents: saved.gmail.events,
    fileEvents: saved.files.events,
  });
  const display = reportConversationDisplay(
    saved.fireflies,
    interpretation.freshness,
    saved.billing
  );
  const comparison = prepareReportComparison(
    {
      ...context,
      sla: context.evidenceSla,
      interviews: context.firstInterviews,
      commsText: `${context.summaries.comms.text} ${saved.portalSummary.promotableText}`,
      freshness: interpretation.freshness,
      runAt,
    },
    context.tasks,
    context.aircalls
  );
  const communications = prepareReportCommunicationEvidence(
    context,
    index.data.aircalls.length,
    index.data.tasks.length,
    runAt
  );
  const events = assembleReportAuthoritativeEvidence({
    context,
    runAt,
    gate: reportAdapterGate(context, interpretation.freshness.stageFamily, comparison.expanded),
    reviewedNoteIds: interpretation.reviewedNoteIds,
    interpretedNoteEvents: interpretation.interpretedNoteEvents,
    portalRequests: saved.portalRequests,
    billing: saved.billing,
    portal: saved.authoritativePortal,
    firefliesEvents: interpretation.ai.events,
    slackEvents: interpretation.interpretedSlackEvents,
  });
  const sourceInput: ReportSourceOutcomesInput = {
    context,
    comparison,
    freshness: interpretation.freshness,
    communications,
    events,
    billing: saved.billing,
    runAt,
    portal: { row: saved.portal.row, count: saved.portal.items.length },
    fireflies: {
      row: saved.fireflies,
      count: saved.fireflies?.meetings.length ?? 0,
      coverage: saved.firefliesCoverage,
    },
    slack: {
      row: saved.slack?.row,
      count: saved.slack?.records.length ?? 0,
      eventCount: saved.slack?.events.length ?? 0,
      interpretedCount: interpretation.interpretedSlackEvents.length,
      coverage: saved.slackCoverage,
    },
    gmail: { row: saved.gmail.row, count: saved.gmail.events.length },
    files: { row: saved.files.row, count: saved.files.events.length },
    portalRequests: { inventory: saved.portalRequestInventory, count: saved.portalRequests.length },
    health: input.saved.health,
    interpretation: {
      mode: interpretation.mode,
      unrecoveredFailures: interpretation.unrecoveredFailures,
      searchResult: interpretation.ai.conversationSearchResult,
    },
    noteAdjudicator: input.noteAdjudicator,
    reviewedSlaId: interpretation.reviewedSlaId,
  };
  const sources = evaluateReportSourceOutcomes(sourceInput);
  const evaluated = buildReportRecommendation({
    context,
    comparison,
    stageFamily: interpretation.freshness.stageFamily,
    billing: saved.billing,
    events,
    outcomes: sources.outcomes,
    runAt,
  });
  const final = projectReportFinalContext(comparison, evaluated, events, runAt);
  const quality = evaluateReportRowQuality({
    context,
    final,
    evaluated,
    saved,
    display,
    sources,
    interpretation,
    communications,
    denialComplete: input.saved.denialByOpportunity.get(opportunity.Id)?.complete,
    runAt,
  });
  const projected = projectReportRow({
    runAt,
    runId,
    engineVersion: EVIDENCE_ENGINE_VERSION,
    sfBaseUrl: input.sfBaseUrl,
    opp: opportunity,
    sla: context.sla,
    expanded: final.expanded,
    freshness: final.freshness,
    story: evaluated.packet.story,
    actionModel: final.actionModel,
    inDepthSummary: evaluated.recommendation.operationalSummary,
    outstandingTasks: reportOutstandingTaskFields(context.tasks, opportunity.Id, runAt),
    provider: comparison.provider,
    milestone: reportNextMilestone(final.expanded.blocker, context.ticketMatches),
    ...quality,
    reviewerState:
      input.reviewerState.get(opportunity.Id) ?? input.reviewerState.get(opportunity.Name) ?? {},
    slaNoteClassification: context.slaNoteClassification,
    authorizationGate: context.authorizationGate,
    firefliesCoverage: saved.firefliesCoverage,
    sourceOutcomes: sources.outcomes,
    summaries: {
      auth: context.summaries.auth.text,
      authReview: context.summaries.authReview.text,
      vob: context.summaries.vob.text,
      cq: context.summaries.cq.text,
      rbt: context.summaries.rbt.text,
      candidates: context.summaries.candidates.text,
      comms: context.summaries.comms.text,
    },
    portal: saved.portalSummary,
    firefliesWasSearched: display.firefliesWasSearched,
    firefliesResult: display.firefliesResult,
    alohaClaimsResult: display.alohaClaimsResult,
    combinedEvidence: sources.combinedEvidence,
  });
  return {
    ...projected,
    sources: sources.outcomes.map((outcome) => ({
      runId,
      collectedAt: runAt.toISOString(),
      opportunityId: opportunity.Id,
      opportunityName: opportunity.Name,
      ...outcome,
    })),
    delayHistory: { opportunityId: opportunity.Id, history: evaluated.recommendation.delayHistory },
    searches: [
      ...(interpretation.ai.conversationSearchResult
        ? [interpretation.ai.conversationSearchResult]
        : []),
      communications.searchResult,
    ],
    interpretation: interpretation.record,
    interpretationUsage: interpretation.usage,
  };
}
