import { unicodeLength, unicodeSlice } from './text-truncation.js';

export function truncate(text: string, max: number): string {
  if (unicodeLength(text) <= max) return text;
  const clipped = unicodeSlice(text, 0, max);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('? '),
    clipped.lastIndexOf('! ')
  );
  if (sentenceEnd >= max * 0.45) {
    return clipped.slice(0, sentenceEnd + 1).trim();
  }
  return shortenSentence(text, max);
}

export function cleanTerminalPunctuation(value: unknown = ''): string {
  return String(value)
    .trim()
    .replace(/[.?!;:]+$/, '');
}

export function withdrawnDenialClause(phase: string, reason: unknown): string {
  const normalizedReason = cleanTerminalPunctuation(reason);
  return /^the payer\b/i.test(normalizedReason)
    ? `${phase} was withdrawn because ${normalizedReason}`
    : `${phase} was withdrawn after the payer found that ${normalizedReason}`;
}

export function requiredItemIsPlural(value: unknown = ''): boolean {
  return /\band\b|\b(?:documents|records|assessments|signatures|forms)\b/i.test(String(value));
}

export function normalizedFact(value: unknown = ''): string {
  return cleanTerminalPunctuation(value).toLowerCase().replace(/\s+/g, ' ');
}

export function canonicalFact(value: unknown = ''): string {
  return String(value)
    .toLowerCase()
    .replace(
      /\b20\d{2}[-/](\d{1,2})[-/](\d{1,2})\b/g,
      (_match: string, month: string, day: string) =>
        `${String(Number(month))} ${String(Number(day))}`
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function duplicateOnlyConflict(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.replace(/^[a-z0-9-]+:\s*/i, '').split(/\s+A later source reports\s+/i);
  return parts.length === 2 && canonicalFact(parts[0]) === canonicalFact(parts[1]);
}

export function isGenericOperationalPlaceholder(
  eventOrText: string | { readonly text?: string | undefined } | null | undefined = ''
): boolean {
  const value = normalizedFact(typeof eventOrText === 'string' ? eventOrText : eventOrText?.text);
  return (
    value.includes('stage-relevant operational update was recorded') ||
    value.includes('unresolved gate is described in the sla summary') ||
    value.includes('latest note discusses the treatment plan but does not state') ||
    value.includes('latest staffing note does not identify') ||
    value.includes('latest note discusses intake documentation but does not identify')
  );
}

export function inlineFact(value: unknown = ''): string {
  const cleaned = cleanTerminalPunctuation(value);
  if (/^(?:[A-Z0-9]{2,}|Salesforce)\b/.test(cleaned)) return cleaned;
  if (
    /^(?:The|A|An|After|Following|Current|Provider|Family|Insurance|Treatment|Initial|Replacement)\b/.test(
      cleaned
    )
  ) {
    return `${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  }
  return cleaned;
}

export function normalizeCategory(value: unknown = ''): string {
  const category = String(value).toLowerCase();
  if (/treatment.?plan|clinical quality|signature/.test(category)) return 'treatmentPlan';
  if (/rbt|97153|staff|candidate|talent acquisition|ticket match/.test(category)) return 'rbt';
  if (/authorization|payer|insurance|vob|eligibility/.test(category)) return 'insurance';
  if (/assessment|initial consultation|intake|scheduling|\bia\b/.test(category)) {
    return 'intakeScheduling';
  }
  return category || 'other';
}

export function humanizeDates(value: unknown = ''): string {
  return String(value).replace(
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    (_match: string, _year: string, month: string, day: string) =>
      `${String(Number(month))}/${String(Number(day))}`
  );
}

export function capitalize(value: unknown = ''): string {
  const text = String(value).trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

export function asSentence(value: unknown = ''): string {
  const text = cleanTerminalPunctuation(humanizeDates(value))
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .trim();
  return text ? `${capitalize(text)}.` : '';
}

export function asInlineSentence(value: unknown = ''): string {
  const text = cleanTerminalPunctuation(humanizeDates(inlineFact(value)))
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
  return text ? `${text}.` : '';
}

export function trimDanglingWords(value = ''): string {
  let text = value.trim().replace(/[\s,;:/-]+$/g, '');
  const dangling =
    /\b(?:a|an|and|or|to|the|is|are|be|been|must|should|can|will|with|for|of|in|on|as|not|requires|complete|including|confirming)$/i;
  while (dangling.test(text)) {
    text = text.replace(dangling, '').replace(/[\s,;:/-]+$/g, '');
  }
  return text;
}

export function shortenSentence(value: unknown, max: number): string {
  const sentence = asSentence(value);
  if (unicodeLength(sentence) <= max) return sentence;
  const clauses = cleanTerminalPunctuation(sentence).split(/[;.!?]/);
  if (clauses[0] && unicodeLength(asSentence(clauses[0])) <= max) {
    return asSentence(clauses[0]);
  }
  const clipped = unicodeSlice(sentence, 0, Math.max(1, max - 1));
  const boundary = clipped.lastIndexOf(' ');
  return asSentence(
    trimDanglingWords(clipped.slice(0, boundary > max * 0.65 ? boundary : clipped.length))
  );
}
