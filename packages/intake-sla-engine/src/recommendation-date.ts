import { isoDate, type DateValue } from './dates.js';

export function nativeRecommendationDate(value: DateValue): Date {
  return new Date(
    value instanceof Date ? value.valueOf() : value === null ? 0 : (value ?? Number.NaN)
  );
}

export function dateValue(value: DateValue): number {
  const parsed = nativeRecommendationDate(value).valueOf();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function humanDate(value: DateValue): string | null {
  const present = Boolean(value);
  const date = present ? new Date(`${String(isoDate(value))}T12:00:00Z`) : null;
  if (!date || Number.isNaN(date.valueOf())) return null;
  return `${String(date.getUTCMonth() + 1)}/${String(date.getUTCDate())}`;
}
