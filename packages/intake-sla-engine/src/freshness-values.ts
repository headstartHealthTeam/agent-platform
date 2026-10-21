import { toDate } from './dates.js';
import type { DateValue } from './dates.js';

export function freshnessText(value: unknown): string {
  const present = Boolean(value);
  return String(present ? value : '')
    .replace(/\s+/g, ' ')
    .trim();
}
export function freshnessTimestamp(value: DateValue): number | null {
  return toDate(value)?.getTime() ?? null;
}
export function parseFreshnessNoteDate(value: unknown, referenceDate: DateValue): string {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4})|)$/.exec(freshnessText(value));
  if (!match) return '';
  const reference =
    referenceDate instanceof Date
      ? referenceDate
      : new Date(referenceDate === null ? 0 : (referenceDate ?? Number.NaN));
  let year = match[3] ? Number(match[3]) : reference.getUTCFullYear();
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2]), 12));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
export function dateAnchoredSummary(summary: unknown, updateAt: DateValue): string {
  const normalized = freshnessText(summary);
  const at = freshnessTimestamp(updateAt);
  if (!normalized || at === null) return normalized;
  const parsed = new Date(at);
  const date = /T00:00:00(?:\.000)?Z$/.test(String(updateAt))
    ? `${String(parsed.getUTCMonth() + 1)}/${String(parsed.getUTCDate())}`
    : new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: 'numeric',
        day: 'numeric',
      }).format(parsed);
  const withoutIntro = normalized.replace(/^as of\s+/i, '');
  if (withoutIntro.startsWith(date) && /^[\s:,]/.test(withoutIntro.slice(date.length)))
    return normalized;
  return `${date}: ${normalized}`;
}
