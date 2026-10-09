import type { DateValue } from './dates.js';

export interface CollectionSearchWindow {
  readonly fromDate: string;
  readonly toDate: string;
  readonly basis: 'Earlier of SLA creation or stage entry minus buffer' | 'Fallback lookback';
}
const DAY_MS = 24 * 60 * 60 * 1000;
function milliseconds(value: DateValue): number {
  return new Date(value instanceof Date ? value.valueOf() : (value ?? 0)).valueOf();
}
export function stageRelativeSearchWindow({
  stageEntryDate,
  slaCreatedDate,
  asOf = new Date().toISOString(),
  bufferDays = 3,
  fallbackDays = 120,
  maximumDays = 180,
}: {
  readonly stageEntryDate?: DateValue;
  readonly slaCreatedDate?: DateValue;
  readonly asOf?: DateValue;
  readonly bufferDays?: number;
  readonly fallbackDays?: number;
  readonly maximumDays?: number;
} = {}): CollectionSearchWindow {
  const asOfTime = milliseconds(asOf);
  if (!Number.isFinite(asOfTime)) throw new Error(`Invalid asOf value: ${String(asOf)}`);
  const anchors = [stageEntryDate, slaCreatedDate]
    .filter(Boolean)
    .map(milliseconds)
    .filter((value) => Number.isFinite(value) && value <= asOfTime);
  const anchor = anchors.length ? Math.min(...anchors) : Number.NaN;
  const start = Number.isFinite(anchor)
    ? Math.max(anchor - bufferDays * DAY_MS, asOfTime - maximumDays * DAY_MS)
    : asOfTime - fallbackDays * DAY_MS;
  return {
    fromDate: new Date(start).toISOString().slice(0, 10),
    toDate: new Date(asOfTime).toISOString().slice(0, 10),
    basis: Number.isFinite(anchor)
      ? 'Earlier of SLA creation or stage entry minus buffer'
      : 'Fallback lookback',
  };
}
