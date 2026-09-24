import { isSupportingOnlySource } from './contracts.js';
import { approvedEvidence } from './evidence.js';
import { inferIssueKey } from './story-issues.js';
import { isGenericOperationalPlaceholder, storySourcePriority } from './story-ranking.js';
import type {
  StoryEvent,
  StoryGate,
  StoryInput,
  StoryIssue,
  StoryOpportunity,
  StoryState,
} from './story-types.js';
import { STORY_STRUCTURED_SOURCES, storyTime } from './story-values.js';
import { storyWindowStart } from './story-window.js';

export function contractedStoryGate(opportunity: StoryOpportunity, gate: StoryGate): string {
  const key = inferIssueKey(
    {
      text: gate.unresolvedGate ?? gate.processPosition ?? '',
      category: gate.gateCategory ?? undefined,
    },
    gate
  );
  if (!['insurance', 'other'].includes(key)) return key;
  if (/^IA Requested$/i.test(opportunity.stage)) return 'initial-authorization';
  if (/^TA Requested$/i.test(opportunity.stage)) return 'treatment-authorization';
  return key;
}

export function createStoryState<T extends StoryEvent>({
  opportunity,
  gate,
  events = [],
  asOf = new Date().toISOString(),
}: StoryInput<T>): StoryState<T> {
  const window = storyWindowStart({
    slaCreatedDate: opportunity.slaCreatedDate,
    stageEntryDate: opportunity.stageEntryDate,
    asOf,
  });
  const startTime = storyTime(window.startDate);
  const asOfTime = storyTime(asOf);
  const key = contractedStoryGate(opportunity, gate);
  const admitted = approvedEvidence(events)
    .filter((event) => {
      const eventTime = storyTime(event.eventDate);
      const carry =
        gate.authorization?.satisfied === false &&
        STORY_STRUCTURED_SOURCES.has(event.source) &&
        inferIssueKey(event, gate) === key;
      return (
        (eventTime >= startTime || carry) &&
        eventTime <= asOfTime &&
        !event.supportingOnly &&
        !isSupportingOnlySource(event.source) &&
        !isGenericOperationalPlaceholder(event)
      );
    })
    .sort(
      (left, right) =>
        storyTime(left.eventDate) - storyTime(right.eventDate) ||
        storySourcePriority(left) - storySourcePriority(right)
    );
  return {
    opportunity,
    gate,
    window,
    asOfTime,
    admitted,
    issues: new Map(),
    annotated: [],
    conflicts: new Map(),
    currentGateIssueKey: key,
    currentGateOverride: null,
    gateTransitionEventId: null,
  };
}

export function requiredStoryIssue<T extends StoryEvent>(
  state: StoryState<T>,
  key = state.currentGateIssueKey
): StoryIssue<T> {
  const issue = state.issues.get(key);
  if (!issue) throw new Error('Story lifecycle invariant: current issue was not initialized');
  return issue;
}
