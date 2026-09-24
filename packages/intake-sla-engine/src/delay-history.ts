import { isoDate, type DateValue } from './dates.js';
import type {
  DelayHistory,
  DelayHistoryEntry,
  DelayHistoryEvent,
  DelayHistoryInput,
  DelayHistoryOmission,
  DelayHistoryReference,
} from './delay-history-types.js';

function compact(value: unknown): string {
  const text = String(value);
  return (value === null || value === undefined ? '' : text).replace(/\s+/g, ' ').trim();
}
function factKey(value: unknown): string {
  return compact(value)
    .toLowerCase()
    .replace(/[.!?]+$/, '');
}
function timestamp(value: DateValue): number {
  const present = Boolean(value);
  return present ? Date.parse(String(value)) : Number.NaN;
}
function sentence(value: unknown): string {
  return `${compact(value).replace(/[.!?]+$/, '')}.`;
}
export const CURRENT_POSITION_MARKER = 'Current position and next step:';

export function currentNarrative(value = ''): string {
  const index = value.indexOf(CURRENT_POSITION_MARKER);
  const current = index < 0 ? value : value.slice(index + CURRENT_POSITION_MARKER.length);
  return (current.split('Delay history:')[0] ?? '').trim();
}

function admitted(event: DelayHistoryEvent, id: string, cutoff: number): boolean {
  return (
    event.opportunityId === id &&
    event.substantive &&
    ['Direct', 'Likely'].includes(event.matchQuality) &&
    ['Supports', 'Conflicts'].includes(event.relationship) &&
    Number.isFinite(timestamp(event.eventDate)) &&
    !(timestamp(event.eventDate) > cutoff) &&
    Boolean(compact(event.text))
  );
}

function reference(event: DelayHistoryEvent): DelayHistoryReference {
  return {
    source: event.source,
    sourceRecordId: event.sourceRecordId,
    date: isoDate(event.eventDate),
    lifecycleState: event.lifecycleState,
    resolutionDate: isoDate(event.resolutionDate),
    resolvedByEventId: event.resolvedByEventId ?? null,
  };
}

function addEntry(
  event: DelayHistoryEvent,
  start: string | null,
  entries: DelayHistoryEntry[],
  lastByIssue: Map<string | null | undefined, DelayHistoryEntry>
): void {
  const date = isoDate(event.eventDate);
  const beforeSla = Boolean(start && date !== null && date < start);
  const key = `${String(beforeSla)}:${String(event.issueKey)}:${String(event.factType)}:${event.relationship}:${factKey(event.text)}`;
  const previous = lastByIssue.get(event.issueKey);
  const evidence = reference(event);
  // Consecutive unchanged findings collapse; recurrence after a different finding does not.
  if (previous?.key === key) {
    previous.references.push(evidence);
    previous.lastDate = evidence.date;
    return;
  }
  const entry: DelayHistoryEntry = {
    key,
    issueKey: event.issueKey,
    factType: event.factType,
    fact: compact(event.text),
    firstDate: evidence.date,
    lastDate: evidence.date,
    beforeSla,
    references: [evidence],
  };
  entries.push(entry);
  lastByIssue.set(event.issueKey, entry);
}

function openingGap(start: string | null, entries: readonly DelayHistoryEntry[]): string {
  const first = entries.find((entry) => !entry.beforeSla);
  if (!start || (first && !(first.firstDate !== null && first.firstDate > start))) return '';
  return first
    ? `The available dated findings begin on ${String(first.firstDate)}; they do not establish the blocker at the SLA opening on ${start}.`
    : `No dated substantive finding establishes the blocker at the SLA opening on ${start}.`;
}

/** History does not change freshness, actions, conflicts or admission policy. */
export function buildDelayHistory({ opportunity, story, asOf }: DelayHistoryInput): DelayHistory {
  const cutoff = timestamp(asOf);
  const start = isoDate(opportunity.slaCreatedDate ?? story.storyAnchorDate);
  const entries: DelayHistoryEntry[] = [];
  const lastByIssue = new Map<string | null | undefined, DelayHistoryEntry>();
  const chronological = [...(story.timeline ?? [])].sort(
    (a, b) => timestamp(a.eventDate) - timestamp(b.eventDate)
  );
  for (const event of chronological) {
    if (admitted(event, opportunity.id, cutoff)) addEntry(event, start, entries, lastByIssue);
  }
  return { startDate: start, asOf: isoDate(asOf), entries, openingGap: openingGap(start, entries) };
}

export function historyEntryText(entry: DelayHistoryEntry): string {
  const sources = [...new Set(entry.references.map((item) => item.source))].join(' and ');
  const repeated =
    entry.lastDate !== entry.firstDate ? ` (source dates through ${String(entry.lastDate)})` : '';
  const label = entry.beforeSla ? 'Earlier context' : 'Dated';
  return `${label} ${String(entry.firstDate)}, ${sources}${repeated}: ${sentence(entry.fact)}`;
}

export function renderDelayHistory(history?: DelayHistory | null): string {
  if (!history) return '';
  const opening = history.startDate
    ? `The SLA record opened on ${history.startDate}; this account is current through ${String(history.asOf)}.`
    : `This account is current through ${String(history.asOf)}; the SLA opening date is not established.`;
  const evidence = history.entries.length
    ? history.entries.map(historyEntryText).join('\n\n')
    : 'No dated substantive history was admitted for this delay.';
  return [
    opening,
    history.openingGap,
    'The dates below belong to the source evidence. Findings reflect what can be established at the cutoff, including whether an earlier planned milestone is now overdue. Source dates do not establish when a blocker began or ended; exact durations and overlaps remain unverified unless explicitly supported.',
    evidence,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function delayHistoryOmissions(
  history: DelayHistory | null | undefined,
  narrative: unknown
): DelayHistoryOmission[] {
  if (!history) return [];
  const text = compact(narrative);
  const omissions: DelayHistoryOmission[] = history.entries
    .filter((entry) => !text.includes(compact(historyEntryText(entry))))
    .map((entry) => ({
      issueKey: entry.issueKey,
      date: entry.firstDate,
      references: entry.references,
    }));
  if (!omissions.length && !text.includes(compact(renderDelayHistory(history)))) {
    omissions.push({ issueKey: 'history-context', date: history.startDate, references: [] });
  }
  return omissions;
}

export function reviewExplanation<T>(readiness: string, reason: T): T | string {
  if (compact(reason) || readiness !== 'Review') return reason;
  return 'Routine human review: confirm the case history, current blocker, and proposed action against the cited evidence before use.';
}
