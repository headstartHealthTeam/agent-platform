import { slackDisplayText } from '@headstart-health/slack-data';

import { matchRosterOpportunity } from './roster-matching.js';
import type { SlackEvidenceProfile, SlackSegmentMatch } from './slack-evidence-types.js';

export function normalizedSlackEvidence(value: string | null | undefined = ''): string {
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}
export function slackClientHeading(line: string): boolean {
  const text = slackDisplayText(line);
  return (
    /^[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+\s*(?:-|–|—|:)\s+/.test(text) ||
    /^[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+\s*(?:-|–|—|:)\s+/.test(text) ||
    /^[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+\s+[A-Z][A-Za-z'’.-]+\s*(?:-|–|—|:)\s+/.test(
      text
    )
  );
}
export function slackCompetingNames(profile: SlackEvidenceProfile): string[] {
  const targetName = normalizedSlackEvidence(profile.opportunityName);
  const values = [
    ...(profile.providerRoster ?? [])
      .filter((record) => record.opportunityId !== profile.opportunityId)
      .flatMap((record) => [record.opportunityName, ...(record.knownNameVariants ?? [])]),
    ...(profile.cohortClientNames ?? []).filter(
      (name) => normalizedSlackEvidence(name) !== targetName
    ),
  ]
    .map(normalizedSlackEvidence)
    .filter(Boolean);
  return [...new Set(values)];
}
const STAGE_TERMS = [
  'assessment',
  '97151',
  'treatment plan',
  'authorization',
  'payer',
  'rbt',
  'staffing',
  '97153',
  'schedule',
  'start date',
];
export function slackAnchorMatches(
  lines: readonly string[],
  profile: SlackEvidenceProfile
): (SlackSegmentMatch & { readonly index: number })[] {
  const targetName = normalizedSlackEvidence(profile.opportunityName);
  const opportunityId = normalizedSlackEvidence(profile.opportunityId);
  const providerAnchors = [
    ...(profile.providerNames ?? []),
    ...(profile.providerEmails ?? []),
    ...(profile.practiceAliases ?? []),
  ]
    .map(normalizedSlackEvidence)
    .filter(Boolean);
  return lines.flatMap<SlackSegmentMatch & { readonly index: number }>((line, index) => {
    const normalized = normalizedSlackEvidence(slackDisplayText(line));
    if (normalized.includes(targetName) || normalized.includes(opportunityId))
      return [{ index, quality: 'Direct', assumedIdentityMatch: false }];
    const localContext = lines
      .slice(Math.max(0, index - 1), Math.min(lines.length, index + 2))
      .map(slackDisplayText)
      .join(' ');
    const context = normalizedSlackEvidence(localContext);
    if (
      !providerAnchors.some((anchor) => context.includes(anchor)) ||
      !STAGE_TERMS.some((term) => context.includes(term))
    )
      return [];
    const match = matchRosterOpportunity({
      text: localContext,
      targetOpportunityId: profile.opportunityId,
      targetOpportunityName: profile.opportunityName,
      ...(profile.providerRoster === undefined ? {} : { roster: profile.providerRoster }),
      allowFirstNameOnly: true,
    });
    return match.matched
      ? [
          {
            index,
            quality: 'Likely',
            assumedIdentityMatch: true,
            assumedIdentityNote: `Assumed ${profile.opportunityName} from a unique provider-roster Slack match (${match.matchedTokens}).`,
            matchedAs: match.matchedTokens,
            score: match.score,
          },
        ]
      : [];
  });
}
