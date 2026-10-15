import { nameEditDistance } from './client-name.js';
import type {
  PathwayConversationMatch,
  PathwayMatchInput,
  SearchPathways,
} from './search-pathway-types.js';
import { normalizeSearchText } from './search-pathway-values.js';
import { buildSearchPathways } from './search-pathways.js';

function approximateTokenPresent(body: string, token: string): boolean {
  const target = normalizeSearchText(token);
  if (target.length < 4) return false;
  const maximum = target.length >= 8 ? 2 : 1;
  return normalizeSearchText(body)
    .split(/\s+/)
    .some(
      (candidate) =>
        candidate.length >= 4 &&
        Math.abs(candidate.length - target.length) <= maximum &&
        nameEditDistance(candidate, target, normalizeSearchText) <= maximum
    );
}
interface MatchSignals {
  firstName: string;
  hasFirst: boolean;
  hasLast: boolean;
  fuzzyFirst: boolean;
  fuzzyLast: boolean;
  provider: boolean;
  csm: boolean;
  authorization: boolean;
  staffing: boolean;
  vernacular: boolean;
}
function matchSignals(
  input: PathwayMatchInput,
  pathways: SearchPathways,
  body: string
): MatchSignals {
  const combined = `${body} ${normalizeSearchText(input.metadata ?? '')}`.trim();
  const parts = normalizeSearchText(input.identity?.opportunityName).split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '';
  const lastName = parts.at(-1) ?? '';
  const tokens = body.split(' ');
  const organizations = new Set([
    'autism',
    'health',
    'medical',
    'therapy',
    'behavior',
    'center',
    'clinic',
    'hospital',
  ]);
  const firstAsOrganization =
    Boolean(firstName) &&
    tokens.some(
      (token, index) => token === firstName && organizations.has(tokens.at(index + 1) ?? '')
    );
  const hasFirst = Boolean(firstName) && !firstAsOrganization && tokens.includes(firstName);
  const hasLast = Boolean(lastName) && tokens.includes(lastName);
  const anchors = pathways.transcriptMatching;
  return {
    firstName,
    hasFirst,
    hasLast,
    fuzzyFirst: !firstAsOrganization && !hasFirst && approximateTokenPresent(body, firstName),
    fuzzyLast: !hasLast && approximateTokenPresent(body, lastName),
    provider: anchors.providerAnchors.some((anchor) => combined.includes(anchor)),
    csm: anchors.csmAnchors.some((anchor) => combined.includes(anchor)),
    authorization: anchors.authorizationAnchors.some((anchor) => body.includes(anchor)),
    staffing: anchors.staffingAnchors.some((anchor) => body.includes(anchor)),
    vernacular: anchors.vernacular.some((term) => body.includes(term)),
  };
}
function contextualScore(signals: MatchSignals): { score: number; reason: string } | null {
  const s = signals;
  if (s.hasFirst && s.hasLast) return { score: 85, reason: 'Client first and last name' };
  if ((s.hasFirst || s.fuzzyFirst) && (s.hasLast || s.fuzzyLast) && s.provider)
    return { score: 82, reason: 'Fuzzy client name plus provider/practice' };
  if (s.hasFirst && s.provider)
    return { score: 72, reason: 'Client first name plus provider/practice' };
  if (s.fuzzyFirst && s.provider && (s.vernacular || s.authorization || s.staffing))
    return { score: 67, reason: 'Fuzzy first name plus provider/practice and process context' };
  if (s.hasFirst && s.csm && s.vernacular)
    return { score: 60, reason: 'Client first name plus CSM and stage terminology only' };
  if (s.hasFirst && (s.authorization || s.staffing))
    return { score: 70, reason: 'Client first name plus authorization/RBT reference' };
  if (s.hasFirst && s.vernacular)
    return { score: 55, reason: 'Client first name plus stage terminology' };
  return null;
}
function directScore(
  input: PathwayMatchInput,
  pathways: SearchPathways,
  body: string
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const identifiers = pathways.directIdentifiers;
  if (identifiers.fullNameVariants.some((variant) => body.includes(variant))) {
    score = Math.max(score, 90);
    reasons.push('Full client name');
  }
  if (identifiers.authorizationNumbers.some((number) => body.includes(number))) {
    score = Math.max(score, 95);
    reasons.push('Authorization number');
  }
  const phones = [
    ...input.text.matchAll(/(?:\+1[\s.-]?|1[\s.-]?|)(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{4})/g),
  ].map((match) => `${match[1] ?? ''}${match[2] ?? ''}${match[3] ?? ''}`);
  if (phones.some((phone) => identifiers.familyPhones.includes(phone))) {
    score = Math.max(score, 95);
    reasons.push('Family phone');
  }
  return { score, reasons };
}
function anchorReasons(signals: MatchSignals): string[] {
  const reasons: string[] = [];
  if (signals.provider) reasons.push('Provider/practice anchor');
  if (signals.csm) reasons.push('CSM anchor');
  if (signals.authorization) reasons.push('Authorization/payer anchor');
  if (signals.staffing) reasons.push('RBT/candidate anchor');
  if (signals.vernacular) reasons.push('Stage terminology');
  return reasons;
}
export function evaluateConversationMatch(input: PathwayMatchInput): PathwayConversationMatch {
  const { opportunityId = '', linkedOpportunityId = '', identity = {} } = input;
  if (opportunityId && linkedOpportunityId === opportunityId)
    return { matched: true, quality: 'Direct', score: 100, reasons: ['Opportunity lookup'] };
  if (
    opportunityId &&
    /^006[A-Za-z0-9]{12,15}$/.test(String(linkedOpportunityId)) &&
    linkedOpportunityId !== opportunityId
  )
    return {
      matched: false,
      quality: 'Weak',
      score: 0,
      reasons: ['Directly linked to a different Opportunity'],
    };
  const pathways = identity.searchPathways ?? buildSearchPathways(identity);
  const body = normalizeSearchText(input.text);
  if (!body) return { matched: false, quality: 'Weak', score: 0, reasons: [] };
  const signals = matchSignals(input, pathways, body);
  const direct = directScore(input, pathways, body);
  const contextual = contextualScore(signals);
  const score = Math.max(direct.score, contextual?.score ?? 0);
  const reasons = [
    ...direct.reasons,
    ...(contextual ? [contextual.reason] : []),
    ...anchorReasons(signals),
  ];
  const competitor = /\b(?:for|about|regarding)\s+([A-Z][A-Za-z'-]{2,})/.exec(input.text)?.[1];
  if (
    competitor &&
    signals.firstName &&
    normalizeSearchText(competitor) !== signals.firstName &&
    score < 90
  )
    return {
      matched: false,
      quality: 'Weak',
      score: Math.min(score, 40),
      reasons: [...reasons, 'Competing client name'],
    };
  const matched = score >= 65;
  return {
    matched,
    quality: score >= 85 ? 'Direct' : matched ? 'Likely' : 'Weak',
    score,
    reasons: [...new Set(reasons)],
  };
}
