import type { EvidenceEvent } from './evidence.js';
import type { FirefliesSuppliedInterpretation } from './fireflies-evidence-types.js';
import type { PublicationQualityResult } from './publication-quality-types.js';
import { readyToCopyForEvidenceStatus, validatePublicationRow } from './publication-quality.js';
import type { ReportCommunicationEvidence } from './report-communication-evidence.js';
import type { ReportConversationDisplay } from './report-conversation-display.js';
import { reportText } from './report-display-values.js';
import type { ReportFinalContext } from './report-final-context.js';
import { reportInterpretationDisplay } from './report-interpretation-display.js';
import type { EvaluatedReportInterpretation } from './report-interpretation.js';
import type { ReportOpportunityContext } from './report-opportunity-context.js';
import type { ReportRecommendation } from './report-recommendation.js';
import {
  reportEvidenceReviewStatus,
  reportMaterialGap,
  type ReportEvidenceStatus,
} from './report-row-review.js';
import type { ReportSavedEvidence } from './report-saved-evidence.js';
import type {
  ReportRowSourceOutcome,
  ReportSourceOutcomes,
} from './report-source-outcome-types.js';
import { savedFields } from './saved-report-fields.js';
import { blockingRequiredSources } from './source-requirements.js';

export interface ReportRowQualityInput {
  readonly context: ReportOpportunityContext;
  readonly final: ReportFinalContext<EvidenceEvent>;
  readonly evaluated: ReportRecommendation<EvidenceEvent>;
  readonly saved: ReportSavedEvidence;
  readonly display: ReportConversationDisplay;
  readonly sources: ReportSourceOutcomes;
  readonly interpretation: EvaluatedReportInterpretation<FirefliesSuppliedInterpretation>;
  readonly communications: ReportCommunicationEvidence;
  readonly denialComplete: boolean | undefined;
  readonly runAt: Date;
}
export interface ReportRowQuality {
  readonly blockingSources: readonly ReportRowSourceOutcome[];
  readonly unavailableEnrichmentSources: readonly ReportRowSourceOutcome[];
  readonly gap: string;
  readonly evidenceStatus: ReportEvidenceStatus;
  readonly preliminaryReadyToCopy: 'Yes' | 'Review' | 'Blocked';
  readonly identityMatchReview: string;
  readonly qualityReview: PublicationQualityResult;
  readonly finalEvidenceStatus: ReportEvidenceStatus;
  readonly finalReadyToCopy: 'Yes' | 'Review' | 'Blocked';
  readonly aiInterpretationStatus: string;
  readonly aiInterpretationGap: string;
  readonly conversationMatchAudit: string;
}
function rawEvidence(input: ReportRowQualityInput): unknown[] {
  const { context, saved } = input;
  return [
    ...context.tasks.flatMap((task) => [task.Subject, task.Description]),
    ...context.aircalls.flatMap((call) => [
      call.Headstart_Full_Transcript__c,
      call.aircall__Message_Content__c,
      call.aircall__Call_summary__c,
    ]),
    ...saved.portal.items.flatMap((item) => {
      if (item === null || item === undefined) throw new TypeError('Portal evidence item is null');
      const fields = savedFields(item);
      return [fields['text'], fields['message'], fields['body'], fields['content']];
    }),
    ...(saved.fireflies?.meetings ?? []).flatMap((meeting) => [
      meeting.fullTranscript,
      meeting.transcript,
      meeting.transcriptSnippet,
      ...(Array.isArray(meeting.matchedSentences)
        ? meeting.matchedSentences
        : [meeting.matchedSentences]),
    ]),
  ].filter(Boolean);
}
function preliminaryReady(
  packet: string,
  evidence: ReportEvidenceStatus
): 'Yes' | 'Review' | 'Blocked' {
  const ready = readyToCopyForEvidenceStatus(evidence);
  if (packet === 'Blocked' || ready === 'Blocked') return 'Blocked';
  return packet === 'Yes' && ready === 'Yes' ? 'Yes' : 'Review';
}
export function evaluateReportRowQuality(input: ReportRowQualityInput): ReportRowQuality {
  const { context, final, evaluated, display, sources, interpretation, runAt } = input;
  const blockingSources = blockingRequiredSources(sources.outcomes);
  const unavailableEnrichmentSources = sources.outcomes.filter(
    (outcome) =>
      !outcome.required && ['Blocked', 'Timed Out', 'Unsupported'].includes(outcome.status)
  );
  const gap = [
    reportMaterialGap({
      opp: context.opp,
      expanded: final.expanded,
      freshness: final.freshness,
      firefliesResult: display.firefliesResult,
      hasValidMilestone: final.hasValidMilestone,
      authorizationGate: context.authorizationGate,
      packet: evaluated.packet,
    }),
    blockingSources.length
      ? `Required source coverage incomplete: ${blockingSources.map((outcome) => outcome.source).join(', ')}.`
      : '',
    input.denialComplete === false
      ? 'Required Slack denial-context search/message/thread coverage is incomplete.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const evidenceStatus = reportEvidenceReviewStatus({
    expanded: final.expanded,
    freshness: final.freshness,
    gap,
    sourceBlocked: blockingSources.length > 0,
  });
  const preliminaryReadyToCopy = preliminaryReady(evaluated.packet.readyToCopy, evidenceStatus);
  const identityMatchReview = reportText(final.freshness.latestIdentityAssumption);
  const qualityReview = validatePublicationRow({
    summary: final.expanded.summary,
    operationalSummary: evaluated.recommendation.operationalSummary,
    delayHistory: evaluated.recommendation.delayHistory,
    action: final.expanded.action,
    actionType: final.actionModel.actionType,
    actionOwner: final.actionModel.actionOwner,
    followUpDate: final.actionModel.followUpDate,
    readyToCopy: preliminaryReadyToCopy,
    evidenceStatus,
    conflicts: final.expanded.evidenceConflict ? [final.expanded.evidenceConflict] : [],
    rawEvidence: rawEvidence(input),
    // The linked Billing event producer does not emit status/serviceDate/appointmentDate.
    futureMilestoneDates: [
      context.opp.IA_Scheduled_For__c,
      context.opp.X97153_Scheduled_For__c,
    ].filter(Boolean),
    latestUpdateDate: final.freshness.latestUpdateAt,
    identityConflict: identityMatchReview,
    unparsedAdmittedNote: sources.unparsedAdmittedSlaNote,
    asOf: runAt,
  });
  const passes = qualityReview.valid && !identityMatchReview;
  const finalEvidenceStatus = passes
    ? evidenceStatus
    : evidenceStatus === 'Blocked'
      ? 'Blocked'
      : 'Partial';
  return {
    blockingSources,
    unavailableEnrichmentSources,
    gap,
    evidenceStatus,
    preliminaryReadyToCopy,
    identityMatchReview,
    qualityReview,
    finalEvidenceStatus,
    finalReadyToCopy: passes
      ? preliminaryReadyToCopy
      : finalEvidenceStatus === 'Blocked'
        ? 'Blocked'
        : 'Review',
    ...reportInterpretationDisplay({
      opportunityName: context.opp.Name,
      candidateCount: input.saved.fireflies?.meetings.length ?? 0,
      mode: interpretation.mode,
      unrecoveredFailures: interpretation.unrecoveredFailures,
      failures: interpretation.ai.failures,
      events: interpretation.ai.events,
      search: interpretation.ai.conversationSearchResult,
      calls: input.communications.searchResult,
    }),
  };
}
