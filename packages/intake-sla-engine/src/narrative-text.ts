import type { NarrativeRawFact } from './narrative-types.js';
import {
  canonicalFact,
  cleanTerminalPunctuation,
  humanizeDates,
  normalizedFact,
} from './recommendation-text.js';

function recruitingFact(text: string): string | null {
  const recruiting =
    /RBT recruiting is active: (\d+) screened, (\d+) active, (\d+) proposed, and (\d+) matched candidates\. No candidate or start date is confirmed/i.exec(
      text
    );
  if (!recruiting) return null;
  const [, screened, active, proposed, matched] = recruiting;
  if (Number(active) + Number(proposed) + Number(matched) === 0) {
    return `Replacement RBT recruiting is active with ${screened ?? ''} screened candidate${screened === '1' ? '' : 's'}, but no candidate has advanced and no start date is confirmed`;
  }
  return `RBT recruiting is active with ${active ?? ''} active, ${proposed ?? ''} proposed, and ${matched ?? ''} matched candidates; staffing and the start date remain unconfirmed`;
}

export function conciseFact(value: unknown = ''): string {
  const text = cleanTerminalPunctuation(humanizeDates(value)).replace(
    /^As of \d{1,2}\/\d{1,2},\s*/i,
    ''
  );
  const partialAuthorization =
    /current\s+(initial|treatment)\s+authorization\s+is\s+partial(?:ly)?\s+approval|current\s+(initial|treatment)\s+authorization\s+is\s+partially\s+approved/i.exec(
      text
    );
  if (partialAuthorization) {
    const phase = /initial/i.test(partialAuthorization[0]) ? 'Initial' : 'Treatment';
    return `${phase} authorization is partially approved; the unapproved services and next payer action are not documented`;
  }
  if (/correction, appeal, or resubmission path (?:is|remains) unresolved/i.test(text)) {
    return text.replace(
      /the correction, appeal, or resubmission path (?:is|remains) unresolved/i,
      'the specific next payer action is not documented'
    );
  }
  const assignedStart =
    /^(.+?) is assigned and records an expected care start of (\d{1,2}\/\d{1,2})/i.exec(text);
  if (assignedStart) {
    return `${assignedStart[1] ?? ''} is assigned; the first 97153 is planned for ${assignedStart[2] ?? ''} but is not yet confirmed in Salesforce or linked billing`;
  }
  if (/provider reports direct-care treatment started/i.test(text)) {
    return 'The provider reports direct-care treatment started, but Salesforce and linked billing records have not confirmed the first 97153';
  }
  const recruiting = recruitingFact(text);
  if (recruiting) return recruiting;
  if (/family availability|custody constraints/i.test(text) && /schedule/i.test(text)) {
    return 'Family availability is preventing a consistent care schedule';
  }
  if (/interpreter|translation support/i.test(text)) {
    return 'Interpreter support is required before the next intake milestone';
  }
  if (/provider is still drafting the treatment plan/i.test(text)) {
    return 'The provider is still drafting the treatment plan; no submission date is confirmed';
  }
  if (
    /treatment plan was reported submitted; payer or clinical disposition remains the next gate/i.test(
      text
    )
  ) {
    return 'The treatment plan was submitted for clinical review; Clinical Quality disposition or requested edits are not yet recorded';
  }
  if (/records an expected care start of/i.test(text) && /97153/i.test(text)) {
    return text.replace(
      /; the first 97153 appointment still requires (?:Salesforce or linked billing) confirmation/i,
      ''
    );
  }
  return text;
}

export function contentTerms(value: unknown = ''): string[] {
  const ignored = new Set([
    'before',
    'cannot',
    'current',
    'from',
    'into',
    'must',
    'that',
    'the',
    'until',
    'with',
    'yet',
    'remains',
    'still',
    'this',
    'client',
    'case',
  ]);
  return normalizedFact(value)
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !ignored.has(term));
}

export function materiallyOverlaps(left: unknown = '', right: unknown = ''): boolean {
  const leftTerms = new Set(contentTerms(left));
  const rightTerms = new Set(contentTerms(right));
  const smaller = Math.min(leftTerms.size, rightTerms.size);
  if (smaller < 3) return false;
  let shared = 0;
  for (const term of leftTerms) if (rightTerms.has(term)) shared += 1;
  return shared / smaller >= 0.7;
}

export function factSubsumesBlocker(fact: unknown, blocker: unknown): boolean {
  const factTerms = new Set(contentTerms(fact));
  const blockerTerms = contentTerms(blocker);
  return blockerTerms.length >= 2 && blockerTerms.every((term) => factTerms.has(term));
}

export function inlineClause(value: unknown = ''): string {
  return cleanTerminalPunctuation(value)
    .replace(/[.!?]+\s+/g, '; ')
    .replace(/[.!?]+;/g, ';')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lowerInitial(value = ''): string {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : '';
}

export function uncoveredConflictSide(value: unknown, contextText: unknown = ''): string {
  const context = canonicalFact(contextText);
  return inlineClause(value)
    .split(/\s*;\s*/)
    .filter(Boolean)
    .filter((clause) => {
      const fact = canonicalFact(clause);
      return Boolean(fact) && !context.includes(fact);
    })
    .join('; ');
}

export function humanizeConflict(conflict: unknown, contextText: unknown = ''): string | null {
  if (typeof conflict !== 'string') return null;
  const cleaned = inlineClause(conflict.replace(/^[a-z0-9-]+:\s*/i, ''));
  if (!cleaned || /^(?:true|false)$/i.test(cleaned)) return null;
  const parts = cleaned.split(/\s+A later source reports\s+/i);
  if (parts.length === 2) {
    const earlier = uncoveredConflictSide(parts[0], contextText);
    const later = uncoveredConflictSide(parts[1], contextText);
    if (!earlier && !later) {
      return 'The structured record and latest operational update disagree on the controlling case state';
    }
    if (!earlier) {
      return `The structured record conflicts with a later source reporting ${lowerInitial(later)}`;
    }
    if (!later) {
      return `The latest operational update conflicts with ${lowerInitial(earlier)}`;
    }
    if (
      canonicalFact(earlier) === canonicalFact(later) ||
      canonicalFact(earlier).includes(canonicalFact(later)) ||
      canonicalFact(later).includes(canonicalFact(earlier))
    ) {
      return null;
    }
    return `${earlier}; a later source reports ${lowerInitial(later)}`;
  }
  return uncoveredConflictSide(cleaned, contextText) || null;
}

export function conciseRevisionTopics(event?: NarrativeRawFact | null): string {
  const value = (event?.text ?? event?.fact ?? '').toLowerCase();
  const topics = [];
  if (/behavior definitions|baselines|reduction goals/.test(value)) {
    topics.push('behavior definitions');
  }
  if (/measurable acquisition goals|measurable goals|scoring/.test(value)) {
    topics.push('measurable goals');
  }
  if (/progress summary|program summary/.test(value)) {
    topics.push('progress summary');
  }
  if (value.includes('clinical rationale')) {
    topics.push('clinical rationale');
  }
  if (/transition|discharge plan/.test(value)) {
    topics.push('transition planning');
  }
  if (topics.length <= 1) return topics[0] ?? '';
  if (topics.length === 2) return `${topics[0] ?? ''} and ${topics[1] ?? ''}`;
  return `${topics.slice(0, -1).join(', ')}, and ${topics.at(-1) ?? ''}`;
}
