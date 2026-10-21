import { nameEditDistance } from './client-name.js';
import type {
  IdentityValue,
  ProviderIdentityCluster,
  ProviderIdentityInput,
} from './provider-identity-types.js';
import { normalizeIdentityValue as normalize } from './provider-identity-values.js';
import { buildProviderIdentityCluster, providerClusterAnchors } from './provider-identity.js';
import { matchRosterOpportunity } from './roster-matching.js';
import type { RosterCandidate } from './roster-matching.js';

const STAGE_TERMS = {
  ia: [
    'ia',
    'initial assessment',
    '97151',
    'assessment',
    'schedule',
    'availability',
    'occurred',
    'completed',
    'cancel',
    'reschedule',
  ],
  treatmentPlan: ['tp', 'treatment plan', 'signature', 'clinical quality', 'review'],
  treatmentAuth: [
    'ta',
    'treatment auth',
    'authorization',
    'payer',
    'denial',
    'appeal',
    'peer review',
  ],
  staffing: ['rbt', 'staffing', 'candidate', 'interview', 'offer', 'hire', 'start', '97153'],
};
export function stageTerms(stage: IdentityValue): string[] {
  const value = normalize(stage);
  if (value.includes('ia') || value.includes('ic')) return STAGE_TERMS.ia;
  if (value.includes('treatment plan') || value.includes('97151')) return STAGE_TERMS.treatmentPlan;
  if (value.includes('ta requested')) return STAGE_TERMS.treatmentAuth;
  if (value.includes('ta approved') || value.includes('97153')) return STAGE_TERMS.staffing;
  return [...new Set(Object.values(STAGE_TERMS).flat())];
}
export interface TextMatchIdentity extends Pick<
  ProviderIdentityInput,
  'providers' | 'providerRoles' | 'practice' | 'currentCsm' | 'priorCsms'
> {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly authorizationNumbers: readonly string[];
  readonly familyPhones: readonly string[];
  readonly stage?: string | null | undefined;
  readonly salesforceRecordIds?: readonly string[] | undefined;
  readonly familyEmails?: readonly string[] | undefined;
  readonly clientAliases?: readonly string[] | undefined;
  readonly providerNames?: readonly string[] | undefined;
  readonly providerIdentity?: ProviderIdentityCluster | undefined;
  readonly providerRoster?: readonly RosterCandidate[] | undefined;
  readonly practiceAliases?: readonly string[] | undefined;
  readonly csmNames?: readonly string[] | undefined;
  readonly csmEmails?: readonly string[] | undefined;
}
export interface TextMatchInput {
  readonly text: string;
  readonly sourceContext?: string;
  readonly identity: TextMatchIdentity;
  readonly stage?: IdentityValue;
  readonly competingClientNames?: readonly string[];
}
export interface TextMatch {
  quality: 'Direct' | 'Likely' | 'Weak';
  reasons: Record<string, boolean | string | number>;
  assumedIdentityMatch?: true;
  assumedIdentityNote?: string;
  matchedAs?: string;
  score?: number;
}
interface NameMatches {
  fullName: string;
  fullNameMatch: boolean | '';
  aliasMatch: boolean;
  firstNameMatch: boolean;
  fuzzyFirstNameMatch: boolean;
}
function nameMatches(haystack: string, identity: TextMatchIdentity): NameMatches {
  const fullName = normalize(identity.opportunityName);
  const aliasMatch = (identity.clientAliases ?? [])
    .filter(
      (alias) =>
        alias !== fullName &&
        alias.includes(' ') &&
        alias.split(' ').every((part) => part.length >= 2)
    )
    .some((alias) => haystack.includes(alias));
  const firstName = fullName.split(' ')[0] ?? '';
  const firstNameMatch =
    // eslint-disable-next-line security/detect-non-literal-regexp -- Exact approved name-pattern compatibility, including . and + and inherited malformed-pattern behavior; escaping changes matching semantics.
    firstName.length >= 3 && new RegExp(`\\b${firstName}\\b`, 'i').test(haystack);
  const fuzzyFirstNameMatch =
    !firstNameMatch &&
    firstName.length >= 4 &&
    haystack
      .split(/\s+/)
      .filter((token) => token.length >= 4)
      .some(
        (token) =>
          Math.abs(token.length - firstName.length) <= 1 &&
          nameEditDistance(token, firstName, normalize) <= 1
      );
  return {
    fullName,
    fullNameMatch: fullName.length > 0 ? haystack.includes(fullName) : '',
    aliasMatch,
    firstNameMatch,
    fuzzyFirstNameMatch,
  };
}
interface ContextMatches {
  providerMatch: boolean;
  csmMatch: boolean;
  practiceMatch: boolean;
  contextMatch: boolean;
  competingMatch: boolean;
}
function anchors(input: TextMatchInput, haystack: string, fullName: string): ContextMatches {
  const { identity, text, sourceContext = '', stage, competingClientNames = [] } = input;
  const anchorText = normalize(`${text} ${sourceContext}`);
  const providerIdentity =
    identity.providerIdentity ?? buildProviderIdentityCluster({ ...identity });
  return {
    providerMatch: providerClusterAnchors(providerIdentity).some((anchor) =>
      anchorText.includes(normalize(anchor))
    ),
    csmMatch: [...(identity.csmNames ?? []), ...(identity.csmEmails ?? [])].some((anchor) =>
      anchorText.includes(normalize(anchor))
    ),
    practiceMatch: (identity.practiceAliases ?? []).some((name) =>
      anchorText.includes(normalize(name))
    ),
    contextMatch: stageTerms(stage).some((term) => haystack.includes(normalize(term))),
    competingMatch: competingClientNames.some((name) => {
      const normalized = normalize(name);
      return normalized.length > 0 && normalized !== fullName && haystack.includes(normalized);
    }),
  };
}
interface DirectMatches {
  exactId: boolean;
  authMatch: boolean;
  phoneMatch: boolean;
  emailMatch: boolean;
}
function directMatches(input: TextMatchInput, haystack: string): DirectMatches {
  const { identity, text, sourceContext = '' } = input;
  const anchorText = normalize(`${text} ${sourceContext}`);
  return {
    exactId: (identity.salesforceRecordIds ?? [identity.opportunityId]).some(
      (id) => id.length > 0 && haystack.includes(normalize(id))
    ),
    authMatch: identity.authorizationNumbers.some((value) => haystack.includes(normalize(value))),
    phoneMatch: identity.familyPhones.some(
      (value) => value.length > 0 && haystack.replace(/\D/g, '').includes(value)
    ),
    emailMatch: (identity.familyEmails ?? []).some((value) =>
      anchorText.includes(normalize(value))
    ),
  };
}
export function assessTextMatch(input: TextMatchInput): TextMatch {
  const { identity } = input;
  const haystack = normalize(input.text);
  const { fullName, fullNameMatch, aliasMatch, firstNameMatch, fuzzyFirstNameMatch } = nameMatches(
    haystack,
    identity
  );
  const { providerMatch, practiceMatch, csmMatch, contextMatch, competingMatch } = anchors(
    input,
    haystack,
    fullName
  );
  const direct = directMatches(input, haystack);
  if (Object.values(direct).some(Boolean) || Boolean(fullNameMatch))
    return {
      quality: competingMatch ? 'Likely' : 'Direct',
      reasons: { ...direct, fullNameMatch, aliasMatch, competingMatch },
    };
  const contextual = { providerMatch, practiceMatch, csmMatch, contextMatch };
  const supportedContext =
    (providerMatch || practiceMatch || csmMatch) && contextMatch && !competingMatch;
  if (aliasMatch && supportedContext)
    return {
      quality: 'Likely',
      assumedIdentityMatch: true,
      assumedIdentityNote: `Assumed ${identity.opportunityName} from a verified client alias in the assigned-provider context.`,
      reasons: { aliasMatch, ...contextual },
    };
  const rosterMatch =
    (identity.providerRoster?.length ?? 0) > 1
      ? matchRosterOpportunity({
          text: haystack,
          targetOpportunityId: identity.opportunityId,
          targetOpportunityName: identity.opportunityName,
          roster: identity.providerRoster ?? [],
          allowFirstNameOnly: contextMatch && (providerMatch || practiceMatch || csmMatch),
        })
      : { matched: false as const };
  if (rosterMatch.matched && supportedContext)
    return {
      quality: 'Likely',
      assumedIdentityMatch: true,
      assumedIdentityNote: `Assumed ${identity.opportunityName} from a unique provider-roster name match (${rosterMatch.matchedTokens}).`,
      matchedAs: rosterMatch.matchedTokens,
      score: rosterMatch.score,
      reasons: {
        providerRosterAssumedMatch: true,
        rosterReason: rosterMatch.reason,
        rosterScore: rosterMatch.score,
        rosterMargin: rosterMatch.margin,
        ...contextual,
      },
    };
  const reasons = {
    firstNameMatch,
    fuzzyFirstNameMatch,
    providerMatch,
    practiceMatch,
    csmMatch,
    contextMatch,
  };
  if (
    (firstNameMatch || fuzzyFirstNameMatch) &&
    (providerMatch || practiceMatch) &&
    contextMatch &&
    !competingMatch
  )
    return { quality: 'Likely', reasons };
  return { quality: 'Weak', reasons: { ...reasons, competingMatch } };
}
