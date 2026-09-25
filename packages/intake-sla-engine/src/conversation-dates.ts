import { normalizeOperationalText } from './conversation-text.js';
import { isoDate, toDate } from './dates.js';
import type { DateValue } from './dates.js';

const WEEKDAYS = new Map([
  ['sunday', 0],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6],
]);
const MONTHS = new Map([
  ['january', 1],
  ['jan', 1],
  ['february', 2],
  ['feb', 2],
  ['march', 3],
  ['mar', 3],
  ['april', 4],
  ['apr', 4],
  ['may', 5],
  ['june', 6],
  ['jun', 6],
  ['july', 7],
  ['jul', 7],
  ['august', 8],
  ['aug', 8],
  ['september', 9],
  ['sep', 9],
  ['sept', 9],
  ['october', 10],
  ['oct', 10],
  ['november', 11],
  ['nov', 11],
  ['december', 12],
  ['dec', 12],
]);

export function dateFromRelativeWord(word: string, eventDate: DateValue): string | null {
  const base = toDate(eventDate);
  if (!base) return null;
  const value = normalizeOperationalText(word);
  if (value === 'today') return isoDate(base);
  const fixedOffset = value === 'tomorrow' ? 1 : value === 'next week' ? 7 : null;
  const weekday = WEEKDAYS.get(value);
  const offset =
    fixedOffset ?? (weekday === undefined ? null : (weekday - base.getUTCDay() + 7) % 7);
  if (offset === null) return null;
  base.setUTCDate(base.getUTCDate() + offset);
  return isoDate(base);
}

function nativeConversationDate(value: DateValue): Date {
  if (value instanceof Date) return new Date(value.valueOf());
  return new Date(value === null ? 0 : (value ?? Number.NaN));
}
function numericDate(match: RegExpExecArray, eventDate: DateValue): string {
  const year = match[3]
    ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    : nativeConversationDate(eventDate).getUTCFullYear();
  return `${String(year)}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
}

export function explicitConversationDate(text: unknown, eventDate: DateValue): string | null {
  const value = String(text);
  const operational =
    /\b(?:start date|first day|first session|97153 appointment|assessment date|ia date|completion target|complete|completed|submit|submitted|submission)\b.{0,24}\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])(?:[/-](20\d\d|\d\d))?\b/i.exec(
      value
    );
  if (operational) return numericDate(operational, eventDate);
  const withoutPrefix = value.replace(
    /^\s*(?:authorization|treatment plan|staffing and scheduling|initial-assessment) update\s*:\s*(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\s*[-:]\s*|^\s*(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\s*[-:]\s*/i,
    ''
  );
  const numeric = /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])(?:[/-](20\d\d|\d\d))?\b/.exec(
    withoutPrefix
  );
  if (numeric) return numericDate(numeric, eventDate);
  const named =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept?|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(
      withoutPrefix
    );
  if (named) {
    return `${String(nativeConversationDate(eventDate).getUTCFullYear())}-${String(MONTHS.get((named[1] ?? '').toLowerCase())).padStart(2, '0')}-${String(Number(named[2])).padStart(2, '0')}`;
  }
  const ordinal =
    /\b(?:on|for|until|through|starting|start|scheduled|schedule|by)\s+(?:the\s+(\d{1,2})|(\d{1,2}))(?:st|nd|rd|th)\b/i.exec(
      withoutPrefix
    );
  if (ordinal) {
    const base = nativeConversationDate(eventDate);
    return `${String(base.getUTCFullYear())}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(Number(ordinal[1] ?? ordinal[2])).padStart(2, '0')}`;
  }
  const relative =
    /\b(today|tomorrow|next week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(
      withoutPrefix
    );
  return relative ? dateFromRelativeWord(relative[1] ?? '', eventDate) : null;
}
