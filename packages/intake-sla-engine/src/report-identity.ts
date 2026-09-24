import { stageRelativeSearchWindow } from './collection-search-window.js';
import { buildProviderIdentityCluster, buildProviderRoleClusters } from './provider-identity.js';
import {
  assessFirefliesIdentityCoverage,
  providerFirefliesSearchPlans,
} from './provider-search.js';
import { identityStrings, reportIdentityBase } from './report-identity-base.js';
import type {
  ReportIdentityProfile,
  ReportProviderIdentity,
  ReportRosterPeer,
} from './report-identity-types.js';
import { normalizeRosterValue } from './roster-matching.js';
import { buildSearchPathways } from './search-pathways.js';
import type { StructuredCollection } from './structured-collection.js';

function providerRosterKeys(identity: ReportProviderIdentity): string[] {
  return [
    ...new Set(
      identity.providerRoles
        .flatMap((provider) => [
          ...provider.salesforceIds.map((value) => `id:${value}`),
          ...provider.emails.map((value) => `email:${normalizeRosterValue(value)}`),
          ...provider.names.map((value) => `name:${normalizeRosterValue(value)}`),
        ])
        .filter((value) => !value.endsWith(':'))
    ),
  ];
}
function rosterFor(
  identity: ReportProviderIdentity,
  profiles: readonly ReportProviderIdentity[],
  byKey: ReadonlyMap<string, readonly ReportProviderIdentity[]>
): {
  readonly providerRosterScope: 'Provider' | 'Practice';
  readonly providerRoster: ReportRosterPeer[];
} {
  const peers = new Map<string, ReportProviderIdentity>();
  for (const key of providerRosterKeys(identity)) {
    for (const peer of byKey.get(key) ?? []) peers.set(peer.opportunityId, peer);
  }
  let providerRosterScope: 'Provider' | 'Practice' = 'Provider';
  if (peers.size <= 1 && identity.practice.id) {
    providerRosterScope = 'Practice';
    for (const peer of profiles.filter(
      (candidate) => candidate.practice.id === identity.practice.id
    ))
      peers.set(peer.opportunityId, peer);
  }
  return {
    providerRosterScope,
    providerRoster: [...peers.values()].map((peer) => ({
      opportunityId: peer.opportunityId,
      opportunityName: peer.opportunityName,
      knownNameVariants: peer.knownNameVariants,
      clientAliases: peer.clientAliases,
      stage: peer.stage,
      practiceName: peer.practice.name,
    })),
  };
}
function enrichIdentity(
  identity: ReportProviderIdentity,
  profiles: readonly ReportProviderIdentity[],
  byKey: ReadonlyMap<string, readonly ReportProviderIdentity[]>,
  asOf: Date | string
): ReportIdentityProfile {
  const roster = rosterFor(identity, profiles, byKey);
  const searchInput = {
    providerRoles: identity.providerRoles,
    practice: identity.practice,
    currentCsm: identity.currentCsm,
    priorCsms: identity.priorCsms,
    csmEmails: identityStrings([identity.currentCsm.email]),
    opportunityName: identity.opportunityName,
    knownNameVariants: identity.knownNameVariants,
    stage: identity.stage,
    providerRoster: roster.providerRoster,
    authorizationNumbers: identity.authorizationNumbers,
    payers: identity.payers,
    rbtNames: identityStrings(identity.rbtRequests.map((request) => request.assignedRbt)),
    candidateNames: identityStrings(identity.candidates.map((candidate) => candidate.name)),
  };
  return {
    ...identity,
    ...roster,
    firefliesSearchPlans: providerFirefliesSearchPlans(searchInput),
    firefliesIdentityCoverage: assessFirefliesIdentityCoverage(searchInput),
    searchWindow: stageRelativeSearchWindow({
      stageEntryDate: identity.stageEntryDate,
      slaCreatedDate: identity.slaCreatedDate,
      asOf,
    }),
    searchPathways: buildSearchPathways(identity),
  };
}
/** Original report-specific identity projection, distinct from the generic IdentityProfile builder. */
export function buildReportIdentityProfiles(
  data: StructuredCollection,
  asOf: Date | string
): ReportIdentityProfile[] {
  const profiles = data.opportunities.map((opp): ReportProviderIdentity => {
    const base = reportIdentityBase(opp, data);
    const providerInput = {
      providerRoles: base.providers,
      practice: base.practice,
      currentCsm: base.currentCsm,
      priorCsms: base.priorCsms,
      csmEmails: identityStrings([base.currentCsm.email]),
    };
    return {
      ...base,
      providerRoles: buildProviderRoleClusters(providerInput),
      providerIdentity: buildProviderIdentityCluster(providerInput),
    };
  });
  const byKey = new Map<string, ReportProviderIdentity[]>();
  for (const identity of profiles) {
    for (const key of providerRosterKeys(identity)) {
      const peers = byKey.get(key) ?? [];
      peers.push(identity);
      byKey.set(key, peers);
    }
  }
  return profiles.map((identity) => enrichIdentity(identity, profiles, byKey, asOf));
}
export function reportConversationSearchPathways(
  identities: readonly ReportIdentityProfile[]
): Pick<
  ReportIdentityProfile,
  | 'opportunityId'
  | 'opportunityName'
  | 'stage'
  | 'practice'
  | 'providers'
  | 'currentCsm'
  | 'priorCsms'
  | 'providerRoles'
  | 'providerIdentity'
  | 'firefliesSearchPlans'
  | 'firefliesIdentityCoverage'
  | 'searchWindow'
  | 'searchPathways'
>[] {
  return identities.map((identity) => ({
    opportunityId: identity.opportunityId,
    opportunityName: identity.opportunityName,
    stage: identity.stage,
    practice: identity.practice,
    providers: identity.providers,
    currentCsm: identity.currentCsm,
    priorCsms: identity.priorCsms,
    providerRoles: identity.providerRoles,
    providerIdentity: identity.providerIdentity,
    firefliesSearchPlans: identity.firefliesSearchPlans,
    firefliesIdentityCoverage: identity.firefliesIdentityCoverage,
    searchWindow: identity.searchWindow,
    searchPathways: identity.searchPathways,
  }));
}
