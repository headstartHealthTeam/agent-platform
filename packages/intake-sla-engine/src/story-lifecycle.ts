import {
  annotateStoryEvent,
  createStoryEventContext,
  type StoryEventContext,
} from './story-event-context.js';
import { impliedResolvedIssues } from './story-implied-resolution.js';
import { storyLifecycleState } from './story-lifecycle-state.js';
import { rbtStoryProgress, type RbtStoryProgress } from './story-rbt-progress.js';
import { supersededStoryRestatement } from './story-restatements.js';
import { explicitProgression } from './story-status.js';
import type {
  AnnotatedStoryEvent,
  StoryEvent,
  StoryIssue,
  StoryLifecycle,
  StoryState,
} from './story-types.js';
import { storyEventId } from './story-values.js';

function resolveImpliedIssues<T extends StoryEvent>(
  state: StoryState<T>,
  event: AnnotatedStoryEvent<T>
): void {
  for (const key of impliedResolvedIssues(event)) {
    if (key === event.issueKey && event.lifecycleState !== 'Resolved') continue;
    const issue = state.issues.get(key);
    if (!issue || issue.state === 'Resolved') continue;
    issue.state = 'Resolved';
    issue.resolvedDate = event.eventDate;
    issue.resolvedByEventId = storyEventId(event);
  }
}

function reconcilePriorConflict<T extends StoryEvent>(
  context: StoryEventContext<T>,
  rbt: RbtStoryProgress,
  lifecycle: StoryLifecycle
): void {
  const {
    state,
    original,
    previousStatus,
    laterStructuredConflictResolution,
    issueKey,
    previous,
    sameRecord,
  } = context;
  const reconciles =
    lifecycle !== 'Conflicting' &&
    (lifecycle === 'Resolved' ||
      explicitProgression(original, previousStatus) ||
      rbt.replacement ||
      laterStructuredConflictResolution);
  if (reconciles) {
    state.conflicts.delete(issueKey);
    for (const prior of state.annotated) {
      if (prior.issueKey !== issueKey || prior.lifecycleState !== 'Conflicting') continue;
      prior.lifecycleState = 'Superseded';
      prior.narrativeContribution = 'Audit Only';
    }
  }
  if ((rbt.replacement || sameRecord) && previous?.latestEvent) {
    previous.latestEvent.lifecycleState = 'Superseded';
    previous.latestEvent.narrativeContribution = 'Audit Only';
  }
}

function updateStoryIssue<T extends StoryEvent>(
  context: StoryEventContext<T>,
  event: AnnotatedStoryEvent<T>
): void {
  const { state, previous, priorLatestEvent, issueKey } = context;
  const issue: StoryIssue<T> = previous ?? {
    issueKey,
    state: event.lifecycleState,
    openedDate: event.eventDate,
    openedByEventId: storyEventId(event),
    resolvedDate: null,
    resolvedByEventId: null,
    currentGate: false,
    lastUpdatedDate: event.eventDate,
    latestEventId: storyEventId(event),
    latestEvent: event,
    latestFact: event.text,
  };
  issue.state = event.lifecycleState;
  issue.lastUpdatedDate = event.eventDate;
  issue.latestEventId = storyEventId(event);
  issue.latestEvent = event;
  issue.latestFact = event.text;
  issue.latestSource = event.source;
  issue.latestSourceRecordId = event.sourceRecordId;
  if (event.lifecycleState === 'Resolved') {
    issue.resolvedDate = event.eventDate;
    issue.resolvedByEventId = storyEventId(event);
  } else if (event.lifecycleState === 'Conflicting') {
    state.conflicts.set(
      issueKey,
      priorLatestEvent
        ? `${issueKey}: ${String(priorLatestEvent.text)} A later source reports ${String(event.text)}`
        : `${issueKey}: ${String(event.text)}`
    );
  } else {
    issue.resolvedDate = null;
    issue.resolvedByEventId = null;
  }
  state.issues.set(issueKey, issue);
}

function applyStoryEvent<T extends StoryEvent>(state: StoryState<T>, original: T): void {
  const context = createStoryEventContext(state, original);
  if (supersededStoryRestatement(context)) {
    state.annotated.push(annotateStoryEvent(context, true));
    return;
  }
  const rbt = rbtStoryProgress(context);
  if (rbt.supersededInactive) {
    state.annotated.push(annotateStoryEvent(context, true, false));
    return;
  }
  const lifecycle = storyLifecycleState(context, rbt);
  reconcilePriorConflict(context, rbt, lifecycle);
  const event = annotateStoryEvent(context, false, false);
  event.lifecycleState = lifecycle;
  state.annotated.push(event);
  resolveImpliedIssues(state, event);
  updateStoryIssue(context, event);
}

export function reconcileStoryEvents<T extends StoryEvent>(state: StoryState<T>): void {
  for (const original of state.admitted) applyStoryEvent(state, original);
}
