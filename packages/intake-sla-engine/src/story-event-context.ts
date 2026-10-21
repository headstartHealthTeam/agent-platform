import { evidenceSpecificity } from './evidence.js';
import { inferIssueKey } from './story-issues.js';
import { issueStatus } from './story-status.js';
import type {
  AnnotatedStoryEvent,
  StoryEvent,
  StoryIssue,
  StoryIssueStatus,
  StoryState,
} from './story-types.js';
import {
  canonicalStoryFactText,
  normalizedStoryText,
  STORY_STRUCTURED_SOURCES,
  storyTime,
} from './story-values.js';

export interface StoryEventContext<T extends StoryEvent> {
  readonly state: StoryState<T>;
  readonly original: T;
  readonly issueKey: string;
  readonly previous: StoryIssue<T> | undefined;
  readonly priorLatestEvent: AnnotatedStoryEvent<T> | null;
  readonly priorConflictEvent: AnnotatedStoryEvent<T> | undefined;
  readonly laterStructuredConflictResolution: boolean;
  readonly sameRecord: boolean;
  readonly equivalentFact: boolean;
  readonly previousRank: number;
  readonly currentRank: number;
  readonly previousStatus: StoryIssueStatus | null;
  readonly currentStatus: StoryIssueStatus | null;
}

export function createStoryEventContext<T extends StoryEvent>(
  state: StoryState<T>,
  original: T
): StoryEventContext<T> {
  const issueKey = original.issueKey ?? inferIssueKey(original, state.gate);
  const previous = state.issues.get(issueKey);
  const priorLatestEvent = previous?.latestEvent ?? null;
  const priorConflictEvent = [...state.annotated]
    .reverse()
    .find(
      (candidate) => candidate.issueKey === issueKey && candidate.lifecycleState === 'Conflicting'
    );
  const laterStructuredConflictResolution =
    state.conflicts.has(issueKey) &&
    priorConflictEvent !== undefined &&
    STORY_STRUCTURED_SOURCES.has(original.source) &&
    storyTime(original.eventDate) > storyTime(priorConflictEvent.eventDate);
  if (laterStructuredConflictResolution) {
    state.conflicts.delete(issueKey);
    priorConflictEvent.lifecycleState = 'Superseded';
    priorConflictEvent.narrativeContribution = 'Audit Only';
  }
  return {
    state,
    original,
    issueKey,
    previous,
    priorLatestEvent,
    priorConflictEvent,
    laterStructuredConflictResolution,
    sameRecord:
      previous?.latestSource === original.source &&
      (priorLatestEvent?.lifecycleRecordId ?? previous.latestSourceRecordId) ===
        (original.lifecycleRecordId ?? original.sourceRecordId),
    equivalentFact:
      priorLatestEvent !== null &&
      (normalizedStoryText(priorLatestEvent) === normalizedStoryText(original) ||
        canonicalStoryFactText(priorLatestEvent) === canonicalStoryFactText(original)),
    previousRank:
      (priorLatestEvent?.processRelevance ?? 0) * 100 + evidenceSpecificity(priorLatestEvent ?? {}),
    currentRank: (original.processRelevance ?? 0) * 100 + evidenceSpecificity(original),
    previousStatus: priorLatestEvent ? issueStatus(priorLatestEvent) : null,
    currentStatus: issueStatus(original),
  };
}

export function annotateStoryEvent<T extends StoryEvent>(
  context: StoryEventContext<T>,
  superseded = false,
  retainResolution = true
): AnnotatedStoryEvent<T> {
  const { original, issueKey, state, previous } = context;
  return {
    ...original,
    issueKey,
    lifecycleState: superseded ? 'Superseded' : 'Opened',
    resolvedByEventId: retainResolution ? (previous?.resolvedByEventId ?? null) : null,
    resolutionDate: retainResolution ? (previous?.resolvedDate ?? null) : null,
    narrativeContribution: 'Audit Only',
    preWindowContext:
      Boolean(state.window.anchorDate) &&
      storyTime(original.eventDate) < storyTime(state.window.anchorDate),
  };
}
