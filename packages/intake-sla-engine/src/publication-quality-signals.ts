import { toDate, type DateValue } from './dates.js';

export function compactQualityText(value: unknown = ''): string {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function qualityDateOnly(value: DateValue): string {
  return toDate(value)?.toISOString().slice(0, 10) ?? '';
}

export function qualityRawLeakage(
  summary: string,
  operationalSummary: string,
  rawEvidence: readonly unknown[] = []
): boolean {
  const generated = compactQualityText(`${summary} ${operationalSummary}`).toLowerCase();
  return rawEvidence.some((value) => {
    const source = compactQualityText(value).toLowerCase();
    return source.length >= 80 && generated.includes(source.slice(0, 60));
  });
}

export function incompleteThought(value: unknown = ''): boolean {
  const text = compactQualityText(value);
  if (!text) return false;
  if (/(?:\.\.\.|…)$/.test(text)) return true;
  if (
    /\b(?:and|or|but|because|since|with|for|from|to|the|a|an|of|on|by|including|after|before|while|until)$/i.test(
      text.replace(/[.!?,:;\s]+$/g, '')
    )
  )
    return true;
  return !/[.!?]$/.test(text);
}

export function vagueGeneratedLanguage(value: unknown = ''): boolean {
  return /\b(?:stage-relevant operational update|unresolved gate is described|activity was recorded|an? update was recorded)\b|\bcorrection, appeal, or resubmission\b|\breplacement or closure path\b/i.test(
    compactQualityText(value)
  );
}

export function unresolvedSpecificity(value: unknown = ''): boolean {
  const text = compactQualityText(value);
  return (
    /\b(?:because )?explanation\s*:/i.test(text) ||
    /\bprovider action required\b/i.test(text) ||
    /\bcandidate (?:is )?in (?:the )?(?:screening, interview, or offer|screening\/interview\/offer)/i.test(
      text
    ) ||
    /\bstage-relevant operational update\b/i.test(text) ||
    /\bthe unresolved gate is described\b/i.test(text) ||
    /\ba required (?:intake or payer )?document remains outstanding\b(?!.*\b(?:packet|evaluation|report|order|referral|vineland|basc|signature|insurance card|records)\b)/i.test(
      text
    )
  );
}

export function repeatedNarrativeFragment(value: unknown = ''): boolean {
  const clauses = compactQualityText(value)
    .split(/(?<=[.!?])\s+|\s*[;|]\s*/)
    .map((clause) =>
      clause
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    )
    .filter((clause) => clause.split(' ').length >= 6);
  return clauses.some((clause, index) => clauses.indexOf(clause) !== index);
}

export function startsWithUpdateDate(summary: unknown, latestUpdateDate: DateValue): boolean {
  const date = qualityDateOnly(latestUpdateDate);
  if (!date) return true;
  const [, month, day] = date.split('-');
  const label = `${String(Number(month))}/${String(Number(day))}`;
  const text = compactQualityText(summary).replace(/^As of\s+/, '');
  // The numeric label ends in a word character; retain the original trailing word boundary.
  return text.startsWith(label) && !/\w/.test(text.charAt(label.length));
}

export function futureMilestonePresentedAsCompleted({
  summary,
  operationalSummary,
  futureMilestoneDates = [],
  asOf,
}: {
  readonly summary: string;
  readonly operationalSummary: string;
  readonly futureMilestoneDates?: readonly DateValue[];
  readonly asOf: DateValue;
}): boolean {
  const asOfDate = qualityDateOnly(asOf);
  const dates = new Set(
    futureMilestoneDates.map(qualityDateOnly).filter((value) => value > asOfDate)
  );
  if (!dates.size) return false;
  const generated = compactQualityText(`${summary} ${operationalSummary}`);
  for (const match of generated.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const date = `${match[1] ?? ''}-${match[2] ?? ''}-${match[3] ?? ''}`;
    if (!dates.has(date)) continue;
    const start = Math.max(
      generated.lastIndexOf('. ', match.index),
      generated.lastIndexOf('? ', match.index),
      generated.lastIndexOf('! ', match.index)
    );
    const ends = [
      generated.indexOf('. ', match.index),
      generated.indexOf('? ', match.index),
      generated.indexOf('! ', match.index),
    ].filter((index) => index >= 0);
    const end = ends.length ? Math.min(...ends) + 1 : generated.length;
    const nearby = generated.slice(start + 1, end);
    const future =
      /\b(?:planned|scheduled|committed|expected|monitor|future|not yet|remains? (?:pending|unconfirmed)|without .* evidence)\b/i.test(
        nearby
      );
    if (!future && /\b(?:completed|occurred|started|submitted|approved)\b/i.test(nearby))
      return true;
  }
  return false;
}
