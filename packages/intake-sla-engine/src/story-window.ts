import type { DateValue } from './dates.js';
import type { StoryWindow, StoryWindowInput } from './story-types.js';
import { STORY_DAY_MS, storyTime } from './story-values.js';

function earliestDate(values: readonly DateValue[]): DateValue {
  return (
    values
      .filter(Boolean)
      .map((value) => ({ value, time: storyTime(value) }))
      .filter((candidate) => candidate.time > 0)
      .sort((left, right) => left.time - right.time)[0]?.value ?? null
  );
}

export function storyWindowStart({
  slaCreatedDate,
  stageEntryDate,
  asOf = new Date().toISOString(),
  bufferDays = 3,
  fallbackDays = 120,
}: StoryWindowInput = {}): StoryWindow {
  const anchor = earliestDate([slaCreatedDate, stageEntryDate]);
  const parsedAsOf = storyTime(asOf);
  const asOfTime = parsedAsOf === 0 ? Date.now() : parsedAsOf;
  const hasAnchor = Boolean(anchor);
  const startTime = hasAnchor
    ? storyTime(anchor) - bufferDays * STORY_DAY_MS
    : asOfTime - fallbackDays * STORY_DAY_MS;
  return {
    startDate: new Date(startTime).toISOString(),
    anchorDate: hasAnchor ? new Date(storyTime(anchor)).toISOString() : null,
    basis: hasAnchor
      ? 'Earlier of current SLA creation or stage entry, minus 3 days'
      : '120-day fallback',
  };
}
