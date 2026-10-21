import { isSupportingOnlySource } from './contracts.js';
import { isoDate } from './dates.js';
import { evidenceSpecificity } from './evidence.js';
import type { StoryEvent, StoryFact } from './story-types.js';
import { normalizedStoryText, storyTime, STORY_STRUCTURED_SOURCES } from './story-values.js';

export function storySourcePriority(event: StoryFact): number {
  if (event.source === 'Authorization') return 4;
  if (STORY_STRUCTURED_SOURCES.has(event.source ?? '')) return 3;
  if (event.supportingOnly || isSupportingOnlySource(event.source)) return 1;
  return 2;
}

export function latestStoryEvent<T extends StoryEvent>(events: readonly T[]): T | null {
  return (
    [...events].sort(
      (left, right) =>
        storyTime(isoDate(right.eventDate)) - storyTime(isoDate(left.eventDate)) ||
        (right.processRelevance ?? 0) - (left.processRelevance ?? 0) ||
        evidenceSpecificity(right) - evidenceSpecificity(left) ||
        storySourcePriority(right) - storySourcePriority(left) ||
        storyTime(right.eventDate) - storyTime(left.eventDate)
    )[0] ?? null
  );
}

export function isGenericOperationalPlaceholder(event: StoryFact): boolean {
  const value = normalizedStoryText(event);
  return (
    value.includes('stage-relevant operational update was recorded') ||
    value.includes('unresolved gate is described in the sla summary') ||
    value.includes('latest note discusses the treatment plan but does not state') ||
    value.includes('latest staffing note does not identify') ||
    value.includes('latest note discusses intake documentation but does not identify')
  );
}
