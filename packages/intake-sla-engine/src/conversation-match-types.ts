import type { DateValue } from './dates.js';
import type { IdentityValue } from './provider-identity-types.js';

export interface ConversationProvider {
  readonly primaryName?: string | null | undefined;
  readonly primaryEmail?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly names?: readonly IdentityValue[] | null | undefined;
  readonly emails?: readonly IdentityValue[] | null | undefined;
  readonly phones?: readonly IdentityValue[] | null | undefined;
}
export interface ConversationProfile {
  readonly opportunityId?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly clientName?: string | null | undefined;
  readonly knownNameVariants?: readonly IdentityValue[] | null | undefined;
  readonly clientAliases?: readonly IdentityValue[] | null | undefined;
  readonly practice?: string | Readonly<Record<string, unknown>> | null | undefined;
  readonly practiceAliases?: readonly IdentityValue[] | null | undefined;
  readonly providerNames?: readonly IdentityValue[] | null | undefined;
  readonly providerEmails?: readonly IdentityValue[] | null | undefined;
  readonly providerPhones?: readonly IdentityValue[] | null | undefined;
  readonly providerRoles?: readonly ConversationProvider[] | null | undefined;
  readonly providers?: readonly ConversationProvider[] | null | undefined;
  readonly authorizationNumbers?: readonly IdentityValue[] | null | undefined;
  readonly payers?: readonly IdentityValue[] | null | undefined;
  readonly payer?: string | null | undefined;
  readonly familyEmails?: readonly IdentityValue[] | null | undefined;
  readonly familyPhones?: readonly IdentityValue[] | null | undefined;
  readonly rbtNames?: readonly IdentityValue[] | null | undefined;
  readonly candidateNames?: readonly IdentityValue[] | null | undefined;
  readonly rbtRequests?:
    | readonly {
        readonly name?: string | null | undefined;
        readonly assignedRbt?: string | null | undefined;
      }[]
    | null
    | undefined;
  readonly candidates?: readonly { readonly name?: string | null | undefined }[] | null | undefined;
  readonly stage?: unknown;
}
export interface ConversationMatchInput {
  readonly text: string;
  readonly metadata?: string | undefined;
  readonly targetProfile?: ConversationProfile | null | undefined;
  readonly providerRoster?: readonly ConversationProfile[] | undefined;
  readonly providerRelationshipConfirmed?: boolean | undefined;
  readonly linkedOpportunityId?: string | null | undefined;
  readonly eventDate?: DateValue;
  readonly storyStartDate?: DateValue;
  readonly asOf?: DateValue;
}
export interface ConversationScoreBreakdown {
  name: number;
  providerRoster: number;
  stage: number;
  context: number;
  date: number;
}
export interface ScoredConversationCandidate {
  profile: ConversationProfile;
  direct: string | null;
  matchedAs: string;
  nameMatchKind: string;
  breakdown: ConversationScoreBreakdown;
  score: number;
  contextualAnchors: string[];
}
export interface ConversationMatch {
  opportunityId: string | null | undefined;
  opportunityName: string | null | undefined;
  quality: 'Direct' | 'Likely' | 'Weak' | 'Rejected';
  score: number;
  margin: number;
  matchedAs: string;
  nameMatchKind: string;
  scoreBreakdown: ConversationScoreBreakdown;
  contextualAnchors: string[];
  reason: string;
  winnerOpportunityId: string | null;
  winnerOpportunityName: string | null;
  runnerUpOpportunityName: string | null;
  rankedCandidates: {
    opportunityId: string | null | undefined;
    opportunityName: string | null | undefined;
    score: number;
    matchedAs: string;
  }[];
}
