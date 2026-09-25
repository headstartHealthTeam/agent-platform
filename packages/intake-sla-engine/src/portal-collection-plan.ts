import type {
  BuiltPortalCollectionPlan,
  PortalCollectionProfile,
  PortalCollectionProvider,
  PortalCollectionRequest,
} from './portal-collection-types.js';
import {
  portalCollectionFallback,
  portalCollectionNormalize,
  portalCollectionUnique,
} from './portal-collection-values.js';

function providerRequestKey(provider: PortalCollectionProvider): string | null {
  const providerUserId = portalCollectionUnique(provider.portalProviderIds ?? [])[0];
  if (providerUserId) return `provider-id:${providerUserId}`;
  const name = portalCollectionNormalize(
    portalCollectionFallback(provider.primaryName, provider.names?.[0])
  );
  return name ? `provider-name:${name}` : null;
}
function providerName(provider: PortalCollectionProvider): string {
  if (provider.primaryName) return provider.primaryName;
  const name = provider.names?.[0];
  return typeof name === 'string' ? name : '';
}
type WindowDate = string | null | undefined;
function minDate(left: WindowDate, right: WindowDate): WindowDate {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
}
function maxDate(left: WindowDate, right: WindowDate): WindowDate {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}
function clientRequest(profile: PortalCollectionProfile): PortalCollectionRequest {
  return {
    requestKey: `client:${profile.opportunityId}`,
    requestType: 'Client',
    opportunityIds: [profile.opportunityId],
    opportunityNames: [profile.opportunityName],
    clientName: profile.opportunityName,
    clientNames: portalCollectionUnique([
      profile.opportunityName,
      ...(profile.knownNameVariants ?? []),
    ]),
    createdFrom: profile.searchWindow?.fromDate,
    createdTo: profile.searchWindow?.toDate,
    limit: 50,
    paginate: true,
  };
}
function addProvider(
  providers: Map<string, PortalCollectionRequest>,
  profile: PortalCollectionProfile,
  provider: PortalCollectionProvider
): void {
  const requestKey = providerRequestKey(provider);
  if (!requestKey) return;
  const current = providers.get(requestKey) ?? {
    requestKey,
    requestType: 'Provider',
    providerName: providerName(provider),
    providerUserId: portalCollectionUnique(provider.portalProviderIds ?? [])[0] ?? '',
    opportunityIds: [],
    opportunityNames: [],
    roster: [],
    createdFrom: null,
    createdTo: null,
    limit: 50,
    paginate: true,
  };
  current.opportunityIds = portalCollectionUnique([
    ...(current.opportunityIds ?? []),
    profile.opportunityId,
  ]);
  current.opportunityNames = portalCollectionUnique([
    ...(current.opportunityNames ?? []),
    profile.opportunityName,
  ]);
  current.roster = [
    ...new Map(
      [...(current.roster ?? []), ...(profile.providerRoster ?? [])].map((row) => [
        row.opportunityId,
        row,
      ])
    ).values(),
  ];
  current.createdFrom = minDate(current.createdFrom, profile.searchWindow?.fromDate);
  current.createdTo = maxDate(current.createdTo, profile.searchWindow?.toDate);
  providers.set(requestKey, current);
}
export function buildPortalCollectionPlan(
  profiles: readonly PortalCollectionProfile[] = []
): BuiltPortalCollectionPlan {
  const providers = new Map<string, PortalCollectionRequest>();
  const clientRequests: PortalCollectionRequest[] = [];
  for (const profile of profiles) {
    clientRequests.push(clientRequest(profile));
    for (const provider of profile.providerRoles ?? []) addProvider(providers, profile, provider);
  }
  const providerRequests = [...providers.values()];
  const sentinel =
    providerRequests.find((request) => request.providerUserId) ?? providerRequests[0];
  return {
    version: '2026-08-11.1',
    opportunityCount: profiles.length,
    providerRequestCount: providerRequests.length,
    clientRequestCount: clientRequests.length,
    sentinelRequestKey: sentinel?.requestKey ?? null,
    requests: [...providerRequests, ...clientRequests],
  };
}
