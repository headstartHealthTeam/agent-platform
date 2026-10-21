import { isSupportingOnlyEvidence } from './contracts.js';
import { isoDate } from './dates.js';
import { buildDelayHistory } from './delay-history.js';
import { applyOverlapAction, selectFactPacketAction } from './fact-packet-actions.js';
import { reconcileFactPacketConflicts } from './fact-packet-conflicts.js';
import { createFactPacketState } from './fact-packet-context.js';
import { factPacketReadiness } from './fact-packet-readiness.js';
import { factView } from './recommendation-projection.js';
import { cleanTerminalPunctuation } from './recommendation-text.js';
import type {
  FactPacket,
  FactPacketInput,
  FactPacketState,
  RecommendationEvent,
} from './recommendation-types.js';

function approvedFacts<T extends RecommendationEvent>(
  state: FactPacketState<T>
): FactPacket<T>['approvedFacts'] {
  const timelineIds = new Set(
    state.timeline.map((event) => `${event.source}:${event.sourceRecordId}`)
  );
  return state.input.evidenceEvents
    .filter((event) => event.substantive && ['Direct', 'Likely'].includes(event.matchQuality))
    .map(({ rawText: _rawText, ...event }) => ({
      ...event,
      contribution: isSupportingOnlyEvidence(event)
        ? 'Supporting'
        : timelineIds.has(`${event.source}:${event.sourceRecordId}`)
          ? 'Used'
          : 'Audit Only',
    }));
}

function result<T extends RecommendationEvent>(
  state: FactPacketState<T>,
  readyToCopy: string
): FactPacket<T> {
  const { opportunity, asOf } = state.input;
  const { story, gate, newest, authoritative, structuredDetailEvent, requiredDocumentationEvent } =
    state;
  return {
    asOf,
    delayHistory: buildDelayHistory({ opportunity, story, asOf }),
    opportunityId: opportunity.id,
    opportunityName: opportunity.name,
    provider: opportunity.provider ?? null,
    csm: opportunity.csm ?? null,
    stage: opportunity.stage,
    slaCreatedDate: isoDate(opportunity.slaCreatedDate),
    stageEntryDate: isoDate(opportunity.stageEntryDate),
    storyStartDate: isoDate(story.storyStartDate),
    processPosition: gate.processPosition,
    unresolvedGate: gate.unresolvedGate,
    authorization: gate.authorization ?? null,
    authoritativeEvidence: authoritative ? factView(authoritative, 'Used') : null,
    newestUpdate: newest ? factView(newest, 'Used') : null,
    structuredGateDetail: structuredDetailEvent ? factView(structuredDetailEvent, 'Used') : null,
    outstandingRequiredDocument: requiredDocumentationEvent
      ? factView(requiredDocumentationEvent, 'Used')
      : null,
    evidenceTimeline: state.timeline.map((event) => factView(event, 'Used')),
    supportingContext: state.supporting.map((event) => factView(event, 'Supporting')),
    priorContext: state.priorContext.map((event) => factView(event, 'Audit Only')),
    futureMilestones: state.futureMilestones,
    story: {
      ...story,
      latestSubstantiveEvent: story.latestSubstantiveEvent
        ? factView(story.latestSubstantiveEvent, 'Used')
        : null,
      timeline: story.timeline.map((event) => ({
        ...factView(event, event.narrativeContribution),
        issueKey: event.issueKey,
        lifecycleState: event.lifecycleState,
        resolvedByEventId: event.resolvedByEventId,
        resolutionDate: isoDate(event.resolutionDate),
        narrativeContribution: event.narrativeContribution,
        preWindowContext: event.preWindowContext,
      })),
    },
    startEvidenceConflict: state.startEvidenceConflict,
    iaCompletionDocumentationConflict: state.iaCompletionDocumentationConflict,
    freshness: state.freshness,
    action: state.action,
    confidence: gate.confidence,
    readyToCopy,
    conflicts: state.conflicts,
    gaps: state.gaps,
    identityMatchReview: state.identityMatchReview,
    sourceCoverage: state.sourceCoverage,
    approvedFacts: approvedFacts(state),
    latestFact: newest
      ? `${cleanTerminalPunctuation(newest.text)} (${String(isoDate(newest.eventDate))})`
      : 'No dated substantive update was found',
  };
}

export function buildFactPacket<T extends RecommendationEvent>(
  input: FactPacketInput<T>
): FactPacket<T> {
  const state = createFactPacketState(input);
  selectFactPacketAction(state);
  reconcileFactPacketConflicts(state);
  applyOverlapAction(state);
  return result(state, factPacketReadiness(state));
}
