import type { DateValue } from './dates.js';
import { isAdministrativeOnly } from './freshness-administrative.js';
import { freshnessText, freshnessTimestamp, parseFreshnessNoteDate } from './freshness-values.js';

const GENERATED_SLA_DRAFT_PATTERNS = [
  /\bThe initial assessment phase is complete or underway; treatment authorization cannot proceed until\b/i,
  /\bTreatment authorization is approved; .{0,120}first 97153\b/i,
  /\bNo substantive treatment-plan update (?:was )?found\b/i,
  /\bThe provider must confirm start readiness and the first 97153 appointment date\b/i,
  /\bTreatment authorization is approved; .{0,100}\bis hired, but the first 97153\b/i,
  /\bFreshness read:\b/i,
  /\bUnresolved gate:\b/i,
  /\bNext process milestone:\b/i,
  /\bRecommended owner action:\b/i,
];
export function isGeneratedSlaDraft(value: unknown): boolean {
  const normalized = freshnessText(value);
  return GENERATED_SLA_DRAFT_PATTERNS.some((pattern) => pattern.test(normalized));
}
export function stripGeneratedSlaDraft(value: unknown): string {
  const normalized = freshnessText(value);
  const starts = GENERATED_SLA_DRAFT_PATTERNS.map((pattern) => normalized.search(pattern)).filter(
    (index) => index >= 0
  );
  if (!starts.length) return normalized;
  const first = Math.min(...starts);
  // A single human-authored sentence can resemble a generated summary.
  if (first === 0 && starts.length < 2) return normalized;
  return normalized
    .slice(0, first)
    .replace(/[\s;:|,-]+$/g, '')
    .trim();
}
export interface SubstantiveFreshnessNote {
  readonly at: DateValue;
  readonly summary: string;
  readonly explicitDate: boolean;
}
export function extractLatestSubstantiveNote(
  notes: unknown,
  updatedAt: DateValue,
  asOf: DateValue = new Date()
): SubstantiveFreshnessNote | null {
  const compact = freshnessText(notes);
  if (!compact || isAdministrativeOnly(compact)) return null;
  const matches = [
    ...compact.matchAll(
      /(?:^|\s|\|)(\d{1,2}\/\d{1,2}(?:\/\d{2,4}|))\s*(?:[-:]\s*|\s+(?=[A-Za-z]))/g
    ),
  ];
  if (!matches.length) {
    const summary = stripGeneratedSlaDraft(compact);
    return !summary || isAdministrativeOnly(summary)
      ? null
      : { at: updatedAt, summary, explicitDate: false };
  }
  const segments = matches
    .map((match, index) => {
      const start = match.index + match[0].length;
      const end = matches.at(index + 1)?.index ?? compact.length;
      return {
        at: parseFreshnessNoteDate(match[1], asOf),
        summary: stripGeneratedSlaDraft(
          freshnessText(compact.slice(start, end)).replace(/^[-:|]+\s*/, '')
        ),
        explicitDate: true,
      };
    })
    .filter(
      (segment) =>
        Boolean(segment.at) && Boolean(segment.summary) && !isAdministrativeOnly(segment.summary)
    );
  segments.sort((a, b) => (freshnessTimestamp(b.at) ?? 0) - (freshnessTimestamp(a.at) ?? 0));
  return segments[0] ?? null;
}
export function isSubstantiveHumanSlaNote(value: unknown, asOf: DateValue = new Date()): boolean {
  const note = extractLatestSubstantiveNote(value, asOf, asOf);
  return (
    Boolean(note?.summary) &&
    /\b(?:approved|denied|pending|awaiting|submitted|resubmit|complete|completed|working|draft|edit|signature|schedule|start|staff|rbt|candidate|family|provider|payer|authorization|auth|vob|eligibility|coverage|outreach|follow|unresponsive|hold|pause|moving forward|renew|assessment|review|cancel|discharge)\b/i.test(
      note?.summary ?? ''
    )
  );
}
