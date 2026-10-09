export type DateValue = string | number | Date | null | undefined;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toDate(value: DateValue): Date | null {
  if (value === null || value === undefined || value === '' || value === 0) return null;
  const parsed = new Date(value instanceof Date ? value.valueOf() : value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

export function isoDate(value: DateValue): string | null {
  return toDate(value)?.toISOString().slice(0, 10) ?? null;
}

export function calendarAgeDays(eventDate: DateValue, asOf: DateValue): number | null {
  const event = toDate(eventDate);
  const end = toDate(asOf);
  if (event === null || end === null) return null;
  const startDay = Date.UTC(event.getUTCFullYear(), event.getUTCMonth(), event.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.max(0, Math.floor((endDay - startDay) / DAY_MS));
}

export function freshnessFor(
  eventDate: DateValue,
  asOf: DateValue
): 'Missing' | 'Current' | 'Semi-Stale' | 'Stale' {
  const age = calendarAgeDays(eventDate, asOf);
  if (age === null) return 'Missing';
  if (age <= 2) return 'Current';
  if (age <= 6) return 'Semi-Stale';
  return 'Stale';
}

export function nextBusinessDay(value: DateValue): string | null {
  const date = toDate(value) ?? new Date();
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + 1);
  while (result.getUTCDay() === 0 || result.getUTCDay() === 6)
    result.setUTCDate(result.getUTCDate() + 1);
  return isoDate(result);
}

export function parseEmbeddedDate(
  text: string | null | undefined,
  referenceDate: DateValue
): string | null {
  if (text === null || text === undefined || text.length === 0) return null;
  const match = /\b(1[0-2]|0?[1-9])\/(3[01]|[12]\d|0?[1-9])\b/.exec(text);
  if (match === null) return null;
  const reference = toDate(referenceDate) ?? new Date();
  const explicitYear = /^\/(\d{2,4})\b/.exec(text.slice(match.index + match[0].length))?.[1];
  // The leading note date is its update; later dates may describe promises or older chronology.
  const year =
    explicitYear === undefined
      ? reference.getUTCFullYear()
      : Number(explicitYear.length === 2 ? `20${explicitYear}` : explicitYear);
  return isoDate(new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2]))));
}
