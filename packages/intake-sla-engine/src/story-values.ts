import type { DateValue } from './dates.js';
import type { StoryEvent, StoryFact } from './story-types.js';

export const STORY_DAY_MS = 24 * 60 * 60 * 1000;
export const STORY_STRUCTURED_SOURCES = new Set([
  'Salesforce Opportunity / SLA',
  'Salesforce Stage History',
  'Authorization',
  'Authorization Review',
  'VOB',
  'Clinical Quality',
  'RBT Request',
  'Ticket Match',
  'Talent Acquisition',
  'RBT First Interview',
  'Staffing',
  'Linked Billing / Claims',
]);

export function storyTime(value: DateValue): number {
  const parsed = new Date(value instanceof Date ? value.valueOf() : (value ?? 0)).valueOf();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function storyEventId(event: Pick<StoryEvent, 'source' | 'sourceRecordId'>): string {
  return `${event.source}:${event.sourceRecordId}`;
}

export function normalizedStoryText(event: StoryFact): string {
  return `${event.factType ?? ''} ${event.category ?? ''} ${event.gateImpact ?? ''} ${event.text ?? ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalStoryFactText(event: StoryFact): string {
  return (event.text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
