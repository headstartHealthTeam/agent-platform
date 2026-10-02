import type { DateValue } from './dates.js';
import type { EvidenceEvent } from './evidence.js';
import type { RecommendationEvent, RecommendationTimelineFact } from './recommendation-types.js';
import type { PreparedReportComparison } from './report-comparison-context.js';
import type {
  ReportComparisonFreshness,
  ReportComparisonResult,
} from './report-comparison-types.js';
import { reportText } from './report-display-values.js';
import type { ReportRecommendation } from './report-recommendation.js';
import type { ReportRowActionModel } from './report-row-types.js';

export function reportCalendarDaysSince(
  date: string | null | undefined,
  asOf: Date
): number | null {
  const eventDate = (date ?? '').slice(0, 10);
  const asOfDate = asOf.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  return Math.max(
    0,
    Math.floor(
      (Date.parse(`${asOfDate}T00:00:00Z`) - Date.parse(`${eventDate}T00:00:00Z`)) / 86400000
    )
  );
}
export type ReportTimelineEvidence = Pick<
  RecommendationTimelineFact,
  | 'source'
  | 'matchQuality'
  | 'relationship'
  | 'issueKey'
  | 'lifecycleState'
  | 'resolvedByEventId'
  | 'resolutionDate'
  | 'narrativeContribution'
  | 'gateImpact'
  | 'factType'
  | 'requestedInformation'
  | 'specificityMissing'
  | 'candidateName'
  | 'candidateStep'
  | 'candidateActive'
  | 'milestoneDate'
  | 'recommendedAction'
  | 'actionOwner'
  | 'actionType'
> & {
  readonly opportunityId: string;
  readonly sourceRecordId: string;
  readonly eventDate: string | null;
  readonly collectedAt: string;
  readonly category: string;
  readonly text: string;
  readonly fact: string;
  readonly sourceQuality: string;
  readonly substantive: true;
  readonly processGateRelevance: string;
  readonly processGateScore: number;
  readonly supportsCurrentConclusion: boolean;
  readonly milestoneKind: undefined;
  readonly interpretationProvenance: undefined;
  readonly followUpDate: undefined;
};
function timelineEvidence(
  event: RecommendationTimelineFact,
  opportunityId: string,
  runAt: Date
): ReportTimelineEvidence {
  return {
    opportunityId,
    source: event.source,
    sourceRecordId: event.id.split(':').slice(1).join(':'),
    eventDate: event.date,
    collectedAt: runAt.toISOString(),
    category: event.issueKey,
    text: event.fact,
    fact: event.fact,
    matchQuality: event.matchQuality,
    sourceQuality: event.matchQuality,
    substantive: true,
    relationship: event.relationship,
    processGateRelevance: ['Current', 'Conflict'].includes(event.narrativeContribution)
      ? 'Relevant'
      : 'Historical',
    processGateScore: 0,
    issueKey: event.issueKey,
    lifecycleState: event.lifecycleState,
    resolvedByEventId: event.resolvedByEventId,
    resolutionDate: event.resolutionDate,
    narrativeContribution: event.narrativeContribution,
    supportsCurrentConclusion: event.narrativeContribution === 'Current',
    gateImpact: event.gateImpact,
    factType: event.factType,
    requestedInformation: event.requestedInformation,
    specificityMissing: event.specificityMissing,
    candidateName: event.candidateName,
    candidateStep: event.candidateStep,
    candidateActive: event.candidateActive,
    milestoneDate: event.milestoneDate,
    // The approved factView producer omits these three fields; retain the builder's own undefined keys.
    milestoneKind: undefined,
    interpretationProvenance: undefined,
    followUpDate: undefined,
    recommendedAction: event.recommendedAction,
    actionOwner: event.actionOwner,
    actionType: event.actionType,
  };
}
export type ReportFinalExpanded = Omit<
  ReportComparisonResult,
  'blocker' | 'confidence' | 'evidenceConflict'
> & {
  readonly blocker: string | null | undefined;
  readonly confidence: string;
  readonly evidenceConflict: string;
};
export interface ReportFinalContext<T extends EvidenceEvent & RecommendationEvent> {
  readonly expanded: ReportFinalExpanded;
  readonly actionModel: ReportRowActionModel;
  readonly hasValidMilestone: boolean | DateValue;
  readonly freshness: Omit<
    ReportComparisonFreshness,
    'latestUpdateAt' | 'updateFreshness' | 'evidence'
  > & {
    readonly latestUpdateAt: string;
    readonly updateFreshness: string;
    readonly evidence: ReportTimelineEvidence[];
    readonly story: ReportRecommendation<T>['packet']['story'];
  };
}
function validMilestone(action: ReportRowActionModel, runAt: Date): boolean | DateValue {
  if (action.actionType !== 'Monitor') return false;
  const present = Boolean(action.followUpDate);
  if (!present) return action.followUpDate;
  // JS's original comparison against YYYY-MM-DD is false for numeric/Date operands.
  return (
    typeof action.followUpDate === 'string' &&
    action.followUpDate >= runAt.toISOString().slice(0, 10)
  );
}
/** Replace comparison-only fields with the final packet, retaining all other freshness context. */
export function projectReportFinalContext<T extends EvidenceEvent & RecommendationEvent>(
  comparison: PreparedReportComparison,
  evaluated: ReportRecommendation<T>,
  events: readonly T[],
  runAt: Date
): ReportFinalContext<T> {
  const { packet, recommendation } = evaluated;
  const expanded = {
    ...comparison.expanded,
    blocker: packet.unresolvedGate,
    summary: recommendation.suggestedSlaSummary,
    action: recommendation.text,
    bestSource: reportText(packet.newestUpdate?.source, 'Structured Salesforce'),
    sourceQuality: reportText(
      events.find((event) => `${event.source}:${event.sourceRecordId}` === packet.newestUpdate?.id)
        ?.matchQuality,
      comparison.expanded.sourceQuality
    ),
    confidence: reportText(packet.confidence, comparison.expanded.confidence),
    evidenceConflict: packet.conflicts.join('; '),
  };
  const actionModel = {
    actionType: recommendation.type,
    actionOwner: recommendation.owner,
    followUpDate: recommendation.date,
    followUpDateBasis: recommendation.basis,
  };
  return {
    expanded,
    actionModel,
    hasValidMilestone: validMilestone(actionModel, runAt),
    freshness: {
      ...comparison.effectiveFreshness,
      latestUpdateAt: reportText(packet.newestUpdate?.date),
      latestUpdateSource: reportText(packet.newestUpdate?.source),
      latestUpdateSummary: reportText(packet.newestUpdate?.fact),
      latestUpdateFact: reportText(packet.newestUpdate?.fact),
      updateFreshness: packet.freshness,
      daysSinceUpdate: reportCalendarDaysSince(packet.newestUpdate?.date, runAt),
      evidence: packet.story.timeline.map((event) =>
        timelineEvidence(event, packet.opportunityId, runAt)
      ),
      story: packet.story,
    },
  };
}
