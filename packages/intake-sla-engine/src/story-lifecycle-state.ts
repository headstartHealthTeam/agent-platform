import type { StoryEventContext } from './story-event-context.js';
import type { RbtStoryProgress } from './story-rbt-progress.js';
import { explicitlyResolved } from './story-resolution.js';
import { compatibleAuthorizationStatus } from './story-restatements.js';
import { explicitProgression, explicitlyUnresolved } from './story-status.js';
import type { StoryEvent, StoryLifecycle } from './story-types.js';

function incompatibleStates<T extends StoryEvent>(
  context: StoryEventContext<T>,
  compatible: boolean
): boolean {
  const {
    previous,
    equivalentFact,
    sameRecord,
    laterStructuredConflictResolution,
    previousStatus,
    currentStatus,
    original,
    issueKey,
  } = context;
  return (
    previous !== undefined &&
    !equivalentFact &&
    !compatible &&
    !sameRecord &&
    !laterStructuredConflictResolution &&
    previousStatus !== null &&
    currentStatus !== null &&
    previousStatus !== currentStatus &&
    !explicitlyResolved(original, issueKey) &&
    !explicitProgression(original, previousStatus)
  );
}

export function storyLifecycleState<T extends StoryEvent>(
  context: StoryEventContext<T>,
  rbt: RbtStoryProgress
): StoryLifecycle {
  const { original, previous, equivalentFact, sameRecord, issueKey } = context;
  const authorization = compatibleAuthorizationStatus(context);
  const compatible = rbt.compatibleCandidate || authorization;
  const contradiction =
    previous?.state === 'Resolved' &&
    !equivalentFact &&
    !compatible &&
    !sameRecord &&
    explicitlyUnresolved(original);
  const conflictLabel =
    original.relationship === 'Conflicts' &&
    !authorization &&
    !rbt.compatibleConflictLabel &&
    !rbt.compatiblePacket &&
    !rbt.differentCandidates;
  if (
    conflictLabel ||
    rbt.simultaneousConflict ||
    contradiction ||
    incompatibleStates(context, compatible)
  )
    return 'Conflicting';
  if (explicitlyResolved(original, issueKey)) return 'Resolved';
  return previous ? 'Progressed' : 'Opened';
}
