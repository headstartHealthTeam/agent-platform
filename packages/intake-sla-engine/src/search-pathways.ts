import type {
  SearchPathwayIdentity,
  SearchPathwayProvider,
  SearchPathways,
} from './search-pathway-types.js';
import {
  buildNameVariants,
  compactPhone,
  normalizedSearchList,
  searchContact,
  stageSearchVernacular,
} from './search-pathway-values.js';
import { firstEvidenceText } from './source-evidence-context.js';

function providerAnchors(
  identity: SearchPathwayIdentity,
  providers: readonly SearchPathwayProvider[]
): string[] {
  const practice = searchContact(identity.practice);
  return normalizedSearchList([
    practice.name,
    practice.email,
    practice.phone,
    ...providers.flatMap((provider) => [
      provider.email,
      provider.primaryEmail,
      provider.phone,
      ...(provider.emails ?? []),
      ...(provider.phones ?? []),
      ...(provider.names ?? []).flatMap(buildNameVariants),
      ...(provider.practiceAliases ?? []),
      ...(provider.meetingAliases ?? []),
      ...buildNameVariants(firstEvidenceText(provider.name, provider.primaryName)),
    ]),
  ]);
}
function csmAnchors(identity: SearchPathwayIdentity): string[] {
  const current = searchContact(identity.currentCsm);
  return normalizedSearchList([
    ...buildNameVariants(current.name),
    current.email,
    ...(identity.priorCsms ?? []).flatMap((csm) => {
      if (typeof csm === 'string') return buildNameVariants(csm);
      const contact = searchContact(csm);
      return [...buildNameVariants(contact.name), contact.email];
    }),
  ]);
}
function meetingRetrieval(
  providers: readonly SearchPathwayProvider[],
  identity: SearchPathwayIdentity,
  csms: string[]
): SearchPathways['meetingRetrieval'] {
  return {
    providerNames: normalizedSearchList(
      providers.flatMap((provider) => [
        provider.name,
        provider.primaryName,
        ...(provider.names ?? []),
        ...(provider.meetingAliases ?? []),
      ])
    ),
    providerEmails: normalizedSearchList(
      providers.flatMap((provider) => [
        provider.email,
        provider.primaryEmail,
        ...(provider.emails ?? []),
      ])
    ),
    practice: normalizedSearchList([searchContact(identity.practice).name]),
    currentAndPriorCsms: csms,
  };
}
export function buildSearchPathways(identity: SearchPathwayIdentity = {}): SearchPathways {
  const nameVariants = identity.knownNameVariants?.length
    ? normalizedSearchList(identity.knownNameVariants)
    : buildNameVariants(identity.opportunityName);
  const providers = identity.providerRoles?.length
    ? identity.providerRoles
    : (identity.providers ?? []);
  const provider = providerAnchors(identity, providers);
  const csms = csmAnchors(identity);
  const authorization = normalizedSearchList([
    ...(identity.authorizationNumbers ?? []),
    ...(identity.payers ?? []),
  ]);
  const staffing = normalizedSearchList([
    ...(identity.rbtRequests ?? []).flatMap((request) => [request.name, request.assignedRbt]),
    ...(identity.candidates ?? []).flatMap((candidate) => [candidate.name]),
  ]);
  const vernacular = normalizedSearchList(
    identity.searchVernacular?.length
      ? identity.searchVernacular
      : stageSearchVernacular(identity.stage)
  );
  return {
    directIdentifiers: {
      opportunityId: firstEvidenceText(identity.opportunityId) ?? '',
      fullNameVariants: nameVariants.filter((variant) => variant.includes(' ')),
      authorizationNumbers: normalizedSearchList(identity.authorizationNumbers ?? []),
      familyPhones: [...new Set((identity.familyPhones ?? []).map(compactPhone).filter(Boolean))],
    },
    meetingRetrieval: meetingRetrieval(providers, identity, csms),
    transcriptMatching: {
      nameVariants,
      providerAnchors: provider,
      csmAnchors: csms,
      authorizationAnchors: authorization,
      staffingAnchors: staffing,
      vernacular,
    },
    queryPlan: [
      {
        tier: 'Direct',
        label: 'Full client name',
        terms: nameVariants.filter((variant) => variant.includes(' ')),
      },
      { tier: 'Meeting retrieval', label: 'Provider / practice', terms: provider },
      { tier: 'Meeting retrieval', label: 'Current and prior CSM', terms: csms },
      { tier: 'Context', label: 'Authorization / payer', terms: authorization },
      { tier: 'Context', label: 'RBT / candidate', terms: staffing },
      { tier: 'Context', label: 'Stage vernacular', terms: vernacular },
    ].filter((path) => path.terms.length),
  };
}
