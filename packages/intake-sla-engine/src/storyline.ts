import { reconcileStoryGate } from './story-current-gate.js';
import { reconcileStoryEvents } from './story-lifecycle.js';
import { createStoryState } from './story-state.js';
import { storyResult } from './story-timeline.js';
import type { SlaStory, StoryEvent, StoryInput } from './story-types.js';

/** Approved lifecycle assembly over collected evidence; no source access or agent-policy changes. */
export function buildSlaStory<T extends StoryEvent>(input: StoryInput<T>): SlaStory<T> {
  const state = createStoryState(input);
  reconcileStoryEvents(state);
  reconcileStoryGate(state);
  return storyResult(state, input.sourceResults ?? []);
}
