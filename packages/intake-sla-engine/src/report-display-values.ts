import type { DateValue } from './dates.js';
import { truncateWithEllipsis, unicodeLength, unicodeSlice } from './text-truncation.js';

function stringValue(value: unknown): string {
  return String(value);
}
/** Preserve the report's truthy fallback, including its final null/empty value. */
export function reportPreferred<Values extends readonly unknown[]>(
  ...values: Values
): Values[number] | undefined {
  return values.find(Boolean) ?? values.at(-1);
}
export function reportText(...values: readonly (string | null | undefined)[]): string {
  return values.find(Boolean) ?? '';
}

/** Report display coercion is deliberately distinct from evidence normalization. */
export function reportClean(value: unknown): string {
  if (value === null || value === undefined || typeof value === 'object') return '';
  return stringValue(value);
}
export function reportTruncate(value: unknown, max = 500): string {
  return truncateWithEllipsis(reportClean(value).replace(/\s+/g, ' ').trim(), max);
}
export function reportPlainText(value: unknown): string {
  return reportClean(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
export function reportTimestamp(value: DateValue): number {
  return new Date(value instanceof Date ? value.getTime() : ([value].find(Boolean) ?? 0)).getTime();
}
export function reportLatestDate(...values: readonly DateValue[]): string {
  const dates = values
    .filter(Boolean)
    .map(reportTimestamp)
    .filter((date) => !Number.isNaN(date));
  const latest = dates.sort((left, right) => right - left)[0];
  return latest === undefined ? '' : new Date(latest).toISOString();
}
export function reportShortDate(value: DateValue): string {
  const present = Boolean(value);
  if (!present) return '';
  const date = new Date(reportTimestamp(value));
  return Number.isNaN(date.getTime())
    ? ''
    : `${String(date.getUTCMonth() + 1)}/${String(date.getUTCDate())}`;
}
export function reportGroupBy<T, Key>(
  records: readonly T[],
  select: (record: T) => Key
): Map<Key, T[]> {
  const result = new Map<Key, T[]>();
  for (const record of records) {
    const key = select(record);
    const present = Boolean(key);
    if (!present) continue;
    const group = result.get(key) ?? [];
    group.push(record);
    result.set(key, group);
  }
  return result;
}
export function reportOperationalText(value: unknown): string {
  return reportClean(value)
    .replace(/\s*\((?:LF|LJ|KB|AM|NK)\)\s*/gi, ' ')
    .replace(
      /Family potentially unresp provider to reach out first/i,
      'Family may be unresponsive; provider will reach out first'
    )
    .replace(
      /Provider needs to resubmit TP CSM to f\/?u/i,
      'Provider needs to resubmit the TP; CSM is following up'
    )
    .replace(/Awaiting Ins Approval/i, 'Awaiting insurance approval')
    .replace(/not bought it/gi, 'not agreed')
    .replace(/\bdoesnt\b/gi, "doesn't")
    .replace(/\s*\|\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .trim();
}
const DANGLING =
  /\b(?:and|or|but|because|since|with|for|from|to|the|a|an|of|on|by|including|after|before|while|until)$/i;
function sentenceEnd(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
export function reportFitCompleteThought(value: unknown, max: number): string {
  const text = reportOperationalText(value)
    .replace(/\.\.\.$/, '')
    .trim();
  if (unicodeLength(text) <= max && !DANGLING.test(text.replace(/[,:;\s]+$/g, '')))
    return sentenceEnd(text);
  let fitted = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    const candidate = fitted ? `${fitted} ${sentence}` : sentence;
    if (unicodeLength(candidate) > max) break;
    fitted = candidate;
  }
  if (fitted) {
    const complete = DANGLING.test(fitted.replace(/[,:;\s]+$/g, ''))
      ? `${fitted.replace(/[,:;\s]+$/g, '')} status remains unresolved.`
      : fitted;
    if (unicodeLength(complete) <= max) return sentenceEnd(complete);
  }
  const clipped = unicodeSlice(text, 0, max - 1);
  const boundary = Math.max(
    clipped.lastIndexOf(';'),
    clipped.lastIndexOf(','),
    clipped.lastIndexOf(' ')
  );
  return `${clipped.slice(0, boundary > 40 ? boundary : max - 1).replace(/[,:;\s]+$/, '')}.`;
}
export interface ReportHoldRecord {
  readonly Current_Days_on_Hold__c?: unknown;
  readonly Total_Days_on_Hold__c?: unknown;
  readonly On_Hold_Start_Date__c?: unknown;
}
export function reportNonNegativeDaysOnHold(opp: ReportHoldRecord, asOf = new Date()): number | '' {
  const stored = Number(opp.Current_Days_on_Hold__c ?? opp.Total_Days_on_Hold__c);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const hasStart = Boolean(opp.On_Hold_Start_Date__c);
  if (!hasStart) return '';
  const start = new Date(`${stringValue(opp.On_Hold_Start_Date__c).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  return Math.max(0, Math.floor((asOf.getTime() - start.getTime()) / 86400000));
}
