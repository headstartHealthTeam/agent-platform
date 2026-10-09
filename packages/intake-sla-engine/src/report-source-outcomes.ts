import { coreEvidenceEvents, dedupeEvidenceEvents } from './evidence-assembly.js';
import { isSubstantiveHumanSlaNote } from './freshness-notes.js';
import { reportOperationalText, reportText } from './report-display-values.js';
import type { ReportRecommendationSource } from './report-recommendation.js';
import type {
  ReportSourceOutcomes,
  ReportSourceOutcomesInput,
} from './report-source-outcome-types.js';
import { reportStructuredOutcomes } from './report-structured-outcomes.js';
import { reportSupplementaryOutcomes } from './report-supplementary-outcomes.js';
import type { SourceOutcome } from './source-outcome.js';
import {
  applyStageSourceRequirements,
  enforceConversationInterpretationRequirement,
} from './source-requirements.js';

function applyHealth(
  outcome: SourceOutcome,
  input: ReportSourceOutcomesInput
): ReportRecommendationSource {
  if (outcome.source === 'Portal' && input.health.portal.status === 'Blocked')
    return { ...outcome, status: 'Blocked', detail: input.health.portal.reason };
  if (outcome.source !== 'Fireflies') return outcome;
  if (input.health.fireflies.status === 'Blocked')
    return { ...outcome, status: 'Blocked', detail: input.health.fireflies.reason };
  const search = input.interpretation.searchResult;
  if (
    search &&
    (search.status === 'Blocked' ||
      search.status === 'Timed Out' ||
      search.status === 'Unsupported')
  )
    return {
      ...outcome,
      status: search.status,
      detail: reportText(search.failures.join(' '), `${search.source} retrieval was incomplete.`),
    };
  return outcome;
}
function noteState(
  input: ReportSourceOutcomesInput
): Pick<ReportSourceOutcomes, 'admittedSlaNoteEventCount' | 'unparsedAdmittedSlaNote'> {
  const { context } = input;
  const admitted = reportOperationalText(context.slaNoteClassification.admittedText).toLowerCase();
  const admittedSlaNoteEventCount = input.events.filter((event) => {
    if (event.source !== 'SLA / Intake / On-Hold Notes') return false;
    if (event.sourceRecordId.startsWith(`${String(context.opp.Current_SLA__c)}:`)) return true;
    const raw = reportOperationalText(event.rawText).toLowerCase();
    return Boolean(admitted && raw && (raw.includes(admitted) || admitted.includes(raw)));
  }).length;
  const unparsedAdmittedSlaNote =
    ['Human', 'Generated - Human Addition'].includes(context.slaNoteClassification.provenance) &&
    isSubstantiveHumanSlaNote(context.slaNoteClassification.admittedText, input.runAt) &&
    admittedSlaNoteEventCount === 0 &&
    !input.noteAdjudicator.administrativeNote(context.opp.Id, input.reviewedSlaId);
  return { admittedSlaNoteEventCount, unparsedAdmittedSlaNote };
}
export function evaluateReportSourceOutcomes(
  input: ReportSourceOutcomesInput
): ReportSourceOutcomes {
  const { context, comparison } = input;
  const notes = noteState(input);
  const combinedEvidence = dedupeEvidenceEvents([
    ...coreEvidenceEvents(comparison.effectiveFreshness.evidence),
    ...input.events,
  ]);
  const rawOutcomes = [
    ...reportStructuredOutcomes(input, combinedEvidence),
    ...reportSupplementaryOutcomes(input, combinedEvidence),
  ].map((outcome) => applyHealth(outcome, input));
  const auth = context.authorizationGate;
  const requirementContext = {
    stage: context.opp.StageName,
    processPosition: comparison.processPosition,
    unresolvedGate: comparison.expanded.blocker,
    blocker: comparison.expanded.blocker,
    summary: comparison.expanded.summary,
    authorizationStatus: [
      auth.status,
      'determination' in auth ? auth.determination : undefined,
      'authStatus' in auth ? auth.authStatus : undefined,
    ]
      .filter(Boolean)
      .join(' '),
  };
  const required = applyStageSourceRequirements(rawOutcomes, requirementContext);
  const outcomes = enforceConversationInterpretationRequirement({
    results: required,
    context: requirementContext,
    firefliesCandidateSegments: input.interpretation.searchResult?.segmentsScanned ?? 0,
    aiInterpretationAvailable: ['api', 'precomputed'].includes(input.interpretation.mode),
    aiInterpretationFailures: input.interpretation.unrecoveredFailures.length,
  });
  return { combinedEvidence, outcomes, ...notes };
}
