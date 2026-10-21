import { requireContract as check } from './connector-checkpoint.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';
import type {
  SourceAuthorizationOpportunity,
  SourceAuthorizationRecord,
} from './source-authorization-types.js';

export const DENIAL_CONTEXT_CHANNEL = 'C083BNXBH6F';
export interface DenialIdentityProfile {
  readonly opportunityId: string;
  readonly opportunityName?: unknown;
  readonly searchWindow?: {
    readonly fromDate?: string | null;
    readonly toDate?: string | null;
  } | null;
  readonly knownNameVariants?: readonly unknown[] | null;
  readonly clientAliases?: readonly unknown[] | null;
  readonly authorizationNumbers?: readonly unknown[] | null;
  readonly searchPathways?: {
    readonly directIdentifiers?: {
      readonly authorizationNumbers?: readonly unknown[] | null;
    } | null;
  } | null;
  readonly providerNames?: readonly unknown[] | null;
  readonly providerIdentity?: {
    readonly names?: readonly unknown[] | null;
    readonly practiceAliases?: readonly unknown[] | null;
  } | null;
  readonly providers?:
    readonly { readonly name?: unknown; readonly names?: readonly unknown[] | null }[] | null;
  readonly practiceAliases?: readonly unknown[] | null;
  readonly practice?: string | { readonly name?: unknown } | null;
  readonly payer?: unknown;
  readonly payers?: readonly unknown[] | null;
}
export interface DenialQuery {
  readonly tier: 'Context';
  readonly label: 'Client Intake denial context';
  readonly query: string;
}
export interface DenialContextRequirement {
  readonly opportunityId: string;
  readonly required: boolean;
  readonly queries: readonly DenialQuery[];
  readonly phase?: string;
  readonly gateRecordId?: string;
  readonly coverageBasis?: string;
  readonly payerRefinements?: readonly string[];
}
export interface DenialRequirementInputs {
  readonly opportunities: readonly SourceAuthorizationOpportunity[];
  readonly profiles: readonly DenialIdentityProfile[];
  readonly auths: readonly SourceAuthorizationRecord[];
  readonly authReviews: readonly SourceAuthorizationRecord[];
  readonly asOf: string;
}
function unique(values: readonly unknown[]): string[] {
  return [
    ...new Map(
      values
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => [v.trim().toLowerCase(), v.trim()])
    ).values(),
  ];
}
function identityTerms(
  profile: DenialIdentityProfile,
  id: string,
  authorizationNumber: string,
  reviewNumber?: string | null
): string[] {
  return unique(
    [
      profile.opportunityName,
      ...(profile.knownNameVariants ?? []),
      ...(profile.clientAliases ?? []),
      id,
      ...(profile.authorizationNumbers ?? []),
      ...(profile.searchPathways?.directIdentifiers?.authorizationNumbers ?? []),
      authorizationNumber,
      reviewNumber,
      ...(profile.providerNames ?? []),
      ...(profile.providerIdentity?.names ?? []),
      ...(profile.providers ?? []).flatMap((provider) => [
        provider.name,
        ...(provider.names ?? []),
      ]),
      ...(profile.practiceAliases ?? []),
      ...(profile.providerIdentity?.practiceAliases ?? []),
      typeof profile.practice === 'string' ? profile.practice : profile.practice?.name,
    ].map((value) => (typeof value === 'string' ? value.replaceAll('"', '').trim() : value))
  );
}
function requiredQueries(
  profile: DenialIdentityProfile,
  terms: readonly string[],
  asOf: string
): DenialQuery[] {
  const { fromDate, toDate } = profile.searchWindow ?? {};
  check(
    typeof fromDate === 'string' &&
      typeof toDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(fromDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(toDate) &&
      fromDate <= toDate &&
      toDate === asOf.slice(0, 10),
    'Denial-context search window must end at the frozen cutoff date'
  );
  const end = new Date(`${toDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return terms.map((term) => ({
    tier: 'Context',
    label: 'Client Intake denial context',
    query: `in:${DENIAL_CONTEXT_CHANNEL} "${term.replaceAll('"', '').trim()}" after:${fromDate} before:${end.toISOString().slice(0, 10)}`,
  }));
}
/** Full identity searches already cover keyword refinements; do not add narrower redundant reads. */
export function denialContextRequirements({
  opportunities,
  profiles,
  auths,
  authReviews,
  asOf,
}: DenialRequirementInputs): DenialContextRequirement[] {
  check(
    [opportunities, profiles, auths, authReviews].every(Array.isArray) &&
      Number.isFinite(Date.parse(asOf)),
    'Denial-context planning requires current-run structured inputs and cutoff'
  );
  const profileById = new Map(profiles.map((profile) => [profile.opportunityId, profile]));
  check(
    profileById.size === profiles.length &&
      profiles.length === opportunities.length &&
      new Set(opportunities.map((opp) => opp.Id)).size === opportunities.length &&
      opportunities.every(
        (opp) => typeof opp.Id === 'string' && opp.Id.length > 0 && profileById.has(opp.Id)
      ),
    'Denial-context identity cohort does not match the current run'
  );
  return opportunities.map((opp) => {
    const id = opp.Id;
    const profile = id === undefined ? undefined : profileById.get(id);
    check(
      id !== undefined && profile !== undefined,
      'Denial-context identity cohort does not match the current run'
    );
    const reviews = authReviews.filter((review) => review.Client_Opportunity_Record__c === id);
    const gate = resolveSourceAuthorizationGate({
      opp,
      asOf: new Date(asOf),
      auths: auths.filter((auth) => auth.Client_Opportunity_Record__c === id),
      authReviews: reviews,
    });
    if (!/^(IA|TA) Requested$/i.test(opp.StageName ?? '') || gate.state !== 'Denied') {
      return { opportunityId: id, required: false, queries: [] };
    }
    const selectedReview = reviews.find((review) => review.Id === gate.recordId);
    return {
      opportunityId: id,
      required: true,
      phase: gate.phase,
      gateRecordId: gate.recordId,
      coverageBasis:
        'Complete identity searches include all denial, partial-denial, appeal, reconsideration, peer-review, additional-details and payer refinements; Opportunity ID also matches its link.',
      payerRefinements: unique([gate.payer, profile.payer, ...(profile.payers ?? [])]),
      queries: requiredQueries(
        profile,
        identityTerms(
          profile,
          id,
          gate.authorizationNumber,
          selectedReview?.Authorization_Number__c
        ),
        asOf
      ),
    };
  });
}
