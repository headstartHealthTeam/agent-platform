import { isSupportingOnlyEvidence } from './contracts.js';
import { freshnessFor } from './dates.js';
import { approvedEvidence } from './evidence.js';
import { factPacketCoverage } from './fact-packet-coverage.js';
import { categoryForGate, isVobRelevantGate } from './gate-context.js';
import { actionFor } from './recommendation-action.js';
import { rawComplementaryAuthorizationProgress } from './recommendation-authorization-progress.js';
import { assignedRbtName } from './recommendation-candidate.js';
import { dateValue, nativeRecommendationDate } from './recommendation-date.js';
import { chronological, dedupeEvents, factView } from './recommendation-projection.js';
import { activeRequiredDocumentationEvent } from './recommendation-selection.js';
import { rbtControlEvent } from './recommendation-staffing.js';
import { structuredGateEvent } from './recommendation-structured.js';
import { isGenericOperationalPlaceholder } from './recommendation-text.js';
import type {
  FactPacketInput,
  FactPacketState,
  RecommendationEvent,
  RecommendationGate,
} from './recommendation-types.js';
import type { SlaStory } from './story-types.js';
import { buildSlaStory } from './storyline.js';

function effectiveGate<T extends RecommendationEvent>(
  original: RecommendationGate,
  story: SlaStory<T>,
  events: readonly T[]
): RecommendationGate {
  let gate = story.currentGateOverride ? { ...original, ...story.currentGateOverride } : original;
  if (categoryForGate(gate) === 'rbt' && story.currentGateIssueKey === 'rbt-staffing') {
    const control = rbtControlEvent(approvedEvidence(events));
    if (control?.gateImpact)
      gate = {
        ...gate,
        unresolvedGate: control.gateImpact,
        owner: control.actionOwner ?? gate.owner,
        recommendedAction: control.recommendedAction ?? null,
        recommendedActionType: control.actionType ?? null,
        recommendedFollowUpDate: control.followUpDate ?? control.milestoneDate ?? null,
      };
  }
  return gate;
}

function supportingEvents<T extends RecommendationEvent>(
  input: FactPacketInput<T>,
  story: SlaStory<T>,
  events: readonly T[]
): T[] {
  const start = nativeRecommendationDate(story.storyStartDate).valueOf();
  const cutoff = nativeRecommendationDate(input.asOf).valueOf();
  return chronological(
    approvedEvidence(events).filter((event) => {
      const time = nativeRecommendationDate(event.eventDate).valueOf();
      return (
        isSupportingOnlyEvidence(event) &&
        time >= start &&
        time <= cutoff &&
        !isGenericOperationalPlaceholder(event)
      );
    })
  ).slice(0, 3);
}

export function createFactPacketState<T extends RecommendationEvent>(
  input: FactPacketInput<T>
): FactPacketState<T> {
  const { opportunity, asOf, sourceResults } = input;
  const events = isVobRelevantGate(input.gate)
    ? input.evidenceEvents
    : input.evidenceEvents.filter((event) => event.source !== 'VOB');
  const story = buildSlaStory({ opportunity, gate: input.gate, events, sourceResults, asOf });
  const gate = effectiveGate(input.gate, story, events);
  const narrative = chronological(
    story.narrativeEvents.filter(
      (event) => !isSupportingOnlyEvidence(event) && !isGenericOperationalPlaceholder(event)
    )
  );
  const supporting = supportingEvents(input, story, events);
  const timeline = narrative
    .filter((event) => ['Current', 'Conflict'].includes(event.narrativeContribution))
    .slice(0, 8);
  const priorContext = narrative
    .filter((event) => event.narrativeContribution === 'History')
    .slice(0, 5);
  const contextual = gate.contextualEvidenceId
    ? timeline.find(
        (event) => `${event.source}:${event.sourceRecordId}` === gate.contextualEvidenceId
      )
    : null;
  const latest =
    story.latestSubstantiveEvent && !isSupportingOnlyEvidence(story.latestSubstantiveEvent)
      ? story.latestSubstantiveEvent
      : null;
  const structuredDetailEvent = structuredGateEvent(story, gate, events);
  const assignmentControls =
    categoryForGate(gate) === 'rbt' &&
    Boolean(assignedRbtName(structuredDetailEvent)) &&
    (!latest ||
      ['Ticket Match', 'Talent Acquisition', 'RBT First Interview'].includes(latest.source) ||
      latest.factType === 'rbt-candidate');
  const newest =
    (assignmentControls ? structuredDetailEvent : latest) ??
    timeline[0] ??
    narrative.find((event) => !event.preWindowContext) ??
    structuredDetailEvent ??
    null;
  const authoritative = contextual ?? timeline[0] ?? newest;
  const assignedRbt = assignedRbtName(structuredDetailEvent);
  const newerStaffingPathSupersedesAssignment =
    Boolean(assignedRbt) &&
    !['rbt-assigned', 'treatment-start-planned'].includes(structuredDetailEvent?.factType ?? '');
  return {
    input,
    gate,
    story,
    narrative,
    supporting,
    timeline,
    priorContext,
    structuredDetailEvent,
    newest,
    authoritative,
    sameDayAuthorizationProgress: rawComplementaryAuthorizationProgress(story, newest),
    requiredDocumentationEvent: activeRequiredDocumentationEvent(story, input.evidenceEvents),
    assignedRbt,
    newerStaffingPathSupersedesAssignment,
    freshness: freshnessFor(newest?.eventDate, asOf),
    action: actionFor(gate, asOf, newest ?? authoritative, opportunity),
    ...factPacketCoverage(input, gate, story, newest),
    futureMilestones: dedupeEvents(story.futureMilestones)
      .sort((left, right) => dateValue(left.milestoneDate) - dateValue(right.milestoneDate))
      .map((event) => factView(event, 'Future Milestone')),
    startEvidenceConflict: null,
    iaCompletionDocumentationConflict: null,
  };
}
