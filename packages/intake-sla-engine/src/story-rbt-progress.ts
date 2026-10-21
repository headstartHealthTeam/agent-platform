import type { StoryEventContext } from './story-event-context.js';
import { compatibleRbtHireAndPrerequisite } from './story-rbt-compatibility.js';
import type { StoryEvent } from './story-types.js';
import { storyTime } from './story-values.js';

export interface RbtStoryProgress {
  readonly differentCandidates: boolean;
  readonly replacement: boolean;
  readonly compatibleCandidate: boolean;
  readonly compatiblePacket: boolean;
  readonly compatibleConflictLabel: boolean;
  readonly supersededInactive: boolean;
  readonly simultaneousConflict: boolean;
}
const ACTIVE_TYPES = new Set(['rbt-assigned', 'rbt-candidate']);

function compatiblePacket<T extends StoryEvent>(context: StoryEventContext<T>): boolean {
  const { original, state } = context;
  return (
    ACTIVE_TYPES.has(original.factType ?? '') &&
    original.candidateActive !== false &&
    state.admitted.some(
      (event) =>
        event !== original &&
        event.source === original.source &&
        event.sourceRecordId === original.sourceRecordId &&
        storyTime(event.eventDate) === storyTime(original.eventDate) &&
        ACTIVE_TYPES.has(event.factType ?? '') &&
        event.candidateActive !== false &&
        event.relationship === 'Supports' &&
        compatibleRbtHireAndPrerequisite(original, event)
    )
  );
}

export function rbtStoryProgress<T extends StoryEvent>(
  context: StoryEventContext<T>
): RbtStoryProgress {
  const { issueKey, original, priorLatestEvent: prior, priorConflictEvent } = context;
  const staffing = issueKey === 'rbt-staffing';
  const differentCandidates =
    staffing &&
    Boolean(
      original.candidateName &&
      prior?.candidateName &&
      original.candidateName.toLowerCase() !== prior.candidateName.toLowerCase()
    );
  const active =
    ACTIVE_TYPES.has((original.factType ?? '').toLowerCase()) && original.candidateActive !== false;
  const priorActive =
    ACTIVE_TYPES.has((prior?.factType ?? '').toLowerCase()) && prior?.candidateActive !== false;
  const replacement =
    differentCandidates &&
    active &&
    ['rbt-assigned', 'rbt-candidate', 'rbt-lost'].includes((prior?.factType ?? '').toLowerCase()) &&
    prior?.candidateActive === false;
  return {
    differentCandidates,
    replacement,
    compatibleCandidate: staffing && active && prior !== null && (priorActive || replacement),
    compatiblePacket: staffing && compatiblePacket(context),
    compatibleConflictLabel: staffing && compatibleRbtHireAndPrerequisite(prior, original),
    supersededInactive:
      differentCandidates && original.candidateActive === false && prior?.candidateActive === true,
    simultaneousConflict:
      staffing &&
      priorConflictEvent !== undefined &&
      storyTime(original.eventDate) === storyTime(priorConflictEvent.eventDate) &&
      !replacement &&
      !compatibleRbtHireAndPrerequisite(priorConflictEvent, original),
  };
}
