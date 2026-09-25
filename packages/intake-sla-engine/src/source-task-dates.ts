import type { EvidenceDate } from './evidence.js';
import { firstEvidenceDate } from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';

export interface DatedTaskRecord {
  readonly Description?: string | null | undefined;
  readonly TaskDescription?: string | null | undefined;
  readonly CreatedDate?: EvidenceDate | null | undefined;
  readonly LastModifiedDate?: EvidenceDate | null | undefined;
}
export interface DatedTaskLine {
  readonly text: string;
  readonly eventDate: EvidenceDate;
}
const UPDATE_PREFIX =
  /^(?:Authorization|Treatment plan|Staffing and scheduling|Initial-assessment) update\s*:\s*/i;
interface DateMarker {
  readonly index: number;
  readonly text: string;
}
function isUpdateMarker(description: string, match: DateMarker): boolean {
  const before = description.slice(Math.max(0, match.index - 32), match.index);
  if (
    /(?:\bon|\bfor|\bby|\buntil|\bthrough|\bthis|start date|first day|scheduled for|appointment)\s*$/i.test(
      before
    )
  )
    return false;
  const after = description.slice(
    match.index + match.text.length,
    match.index + match.text.length + 36
  );
  const prefix = description.slice(0, match.index);
  const precedingCharacter = prefix.trimEnd().slice(-1);
  return (
    /[-:]\s*$/.test(match.text) ||
    !prefix.replace(UPDATE_PREFIX, '').trim() ||
    [';', '|', '.'].includes(precedingCharacter) ||
    /^\s*(?:CSM|provider|family|insurance|payer|RBT|awaiting|still|good|needs?|working|ready|no\b|TA\b|IA\b)/i.test(
      after
    )
  );
}
function taskChunks(description: string): string[] {
  const matches = [...description.matchAll(/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\b/g)]
    .map((match) => ({
      index: match.index,
      text:
        match[0] + (/^\s*[-:]/.exec(description.slice(match.index + match[0].length))?.[0] ?? ''),
    }))
    .filter((match) => isUpdateMarker(description, match));
  const indexes = [...new Set(matches.map((match) => match.index))].sort(
    (left, right) => left - right
  );
  if (indexes.length === 0) return [description];
  return indexes.map((start, index) => {
    const end = indexes[index + 1] ?? description.length;
    const prefix = index === 0 && start > 0 ? description.slice(0, start) : '';
    return `${prefix}${description.slice(start, end)}`.trim();
  });
}
/** Preserve dated operational updates without splitting dates belonging to an appointment or commitment. */
export function datedTaskLines(record: DatedTaskRecord, asOf: EvidenceDate): DatedTaskLine[] {
  const description = sourceHtmlText(record.Description ?? record.TaskDescription ?? '');
  if (!description) return [];
  const fallback = firstEvidenceDate(record.CreatedDate, record.LastModifiedDate, asOf) ?? '';
  return taskChunks(description)
    .map((text) => {
      const match = /^\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b/i.exec(
        text.replace(UPDATE_PREFIX, '')
      );
      const year = new Date(fallback).getUTCFullYear();
      const eventDate =
        match === null
          ? fallback
          : `${String(year)}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
      return { text, eventDate };
    })
    .filter(({ eventDate }) => {
      const event = new Date(eventDate).valueOf();
      const cutoff = new Date(asOf).valueOf();
      return !Number.isNaN(event) && !Number.isNaN(cutoff) && event <= cutoff;
    });
}
function submittedDateMatch(text: string): RegExpExecArray | null {
  for (const submitted of text.matchAll(/\bsubmitted\b/gi)) {
    const start = submitted.index + submitted[0].length;
    const suffix = text.slice(start, start + 50);
    const lineBreak = suffix.search(/[\r\n\u2028\u2029]/);
    const limit = Math.min(50, lineBreak < 0 ? suffix.length : lineBreak);
    // Match the original bounded greedy prefix, then its optional "on" at each word boundary.
    for (let offset = limit; offset >= 0; offset -= 1) {
      const index = start + offset;
      if (/\w/.test(text.charAt(index - 1)) === /\w/.test(text.charAt(index))) continue;
      const candidate = text.slice(index);
      const match =
        /^on\s+(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b/i.exec(candidate) ??
        /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b/i.exec(candidate);
      if (match !== null) return match;
    }
  }
  return null;
}
export function explicitTaskOccurrenceDate(
  text: string,
  referenceDate: EvidenceDate
): string | null {
  const match = submittedDateMatch(text);
  const reference = new Date(referenceDate);
  if (Number.isNaN(reference.valueOf())) return null;
  if (match === null && /\bsubmitted\b.{0,35}\b(?:last night|yesterday)\b/i.test(text)) {
    reference.setUTCDate(reference.getUTCDate() - 1);
    return reference.toISOString().slice(0, 10);
  }
  if (match === null) return null;
  const year = reference.getUTCFullYear();
  const candidate = `${String(year)}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
  return new Date(`${candidate}T12:00:00Z`).valueOf() <= reference.valueOf()
    ? candidate
    : `${String(year - 1)}-${candidate.slice(5)}`;
}
