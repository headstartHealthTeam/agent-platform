import { explicitConversationDate } from './conversation-dates.js';
import { normalizeOperationalText } from './conversation-text.js';
import { isoDate, nextBusinessDay, toDate } from './dates.js';
import type { DateValue } from './dates.js';

export interface OperationalFact {
  type: string;
  summary: string;
  owner: string;
  actionType: string;
  action: string;
  relevance: number;
  gateImpact?: string | null | undefined;
  issueKey?: string | null | undefined;
  category?: string | null | undefined;
  kind?: string | null | undefined;
  milestoneDate?: string | null;
  followUpDate?: string | null;
  plannedDate?: string | null | undefined;
  denialReason?: string | null | undefined;
  appealKind?: string | null | undefined;
  requestedInformation?: string | null | undefined;
  specificityMissing?: boolean;
  candidateStep?: string | null | undefined;
}
export type DatedOperationalFact = OperationalFact & {
  milestoneDate: string | null;
  followUpDate: string | null;
};
export interface OperationalSourceContext {
  readonly noteType?: string | null | undefined;
  readonly occurrenceDateAnchored?: boolean | undefined;
  readonly reportedOccurrenceDate?: string | null | undefined;
  readonly direction?: string | null | undefined;
  readonly line?: string | null | undefined;
  readonly slaReason?: string | null | undefined;
  readonly taskSubject?: string | null | undefined;
  readonly sourceType?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
  readonly processPosition?: string | null | undefined;
}
export interface OperationalFactInput {
  readonly text: string;
  readonly category: string;
  readonly eventDate: string;
  readonly asOf?: DateValue;
  readonly context?: OperationalSourceContext | undefined;
}
export interface OperationalFactContext {
  readonly text: string;
  readonly value: string;
  readonly category: string;
  readonly eventDate: string;
  readonly asOf: DateValue;
  readonly context: OperationalSourceContext;
  readonly currentSlaNote: boolean;
  readonly date: string | null;
  readonly datePassed: boolean;
  readonly add: (fact: OperationalFact) => void;
  readonly facts: DatedOperationalFact[];
}

function operationalDate(input: OperationalFactInput): string | null {
  const { text, eventDate, context = {} } = input;
  const explicit = explicitConversationDate(text, eventDate);
  if (explicit) return explicit;
  if (/\b(?:today|this afternoon|this evening|tonight)\b/i.test(text)) return isoDate(eventDate);
  const yesterday = !context.occurrenceDateAnchored && /\b(?:yesterday|last night)\b/i.test(text);
  const tomorrow = /\btomorrow\b/i.test(text);
  if (!yesterday && !tomorrow) return null;
  const shifted = toDate(eventDate);
  if (!shifted) return null;
  shifted.setUTCDate(shifted.getUTCDate() + (yesterday ? -1 : 1));
  return isoDate(shifted);
}
export function createOperationalFactContext(input: OperationalFactInput): OperationalFactContext {
  const { text, category, eventDate, asOf = new Date(), context = {} } = input;
  const date = operationalDate(input);
  const facts: DatedOperationalFact[] = [];
  const add = (fact: OperationalFact): void => {
    facts.push({ milestoneDate: null, followUpDate: date ?? nextBusinessDay(asOf), ...fact });
  };
  return {
    text,
    category,
    eventDate,
    asOf,
    context,
    value: normalizeOperationalText(text),
    currentSlaNote: context.noteType === 'sla',
    date,
    datePassed:
      Boolean(date) &&
      (toDate(date)?.valueOf() ?? Number.NaN) < (toDate(isoDate(asOf))?.valueOf() ?? Number.NaN),
    facts,
    add,
  };
}
export function dedupeOperationalFacts(
  facts: readonly DatedOperationalFact[]
): DatedOperationalFact[] {
  const byType = new Map<string, DatedOperationalFact>();
  for (const fact of [...facts].sort((left, right) => right.relevance - left.relevance)) {
    if (!byType.has(fact.type)) byType.set(fact.type, fact);
  }
  return [...byType.values()];
}
export function hasOperationalText(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}
