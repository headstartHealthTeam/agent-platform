import { clientIdentityAliasesFor } from './client-identity.js';
import type {
  IdentityProvider,
  IdentityValue,
  ProviderIdentityCluster,
  ProviderIdentityInput,
  ProviderRoleCluster,
} from './provider-identity-types.js';
import { normalizeIdentityValue } from './provider-identity-values.js';
import { buildProviderIdentityCluster, buildProviderRoleClusters } from './provider-identity.js';
import type { RosterCandidate } from './roster-matching.js';

export interface IdentityProfileInput extends ProviderIdentityInput {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly leadId?: string | null;
  readonly accountId?: string | null;
  readonly contactId?: string | null;
  readonly backendUserId?: string | null;
  readonly relatedSalesforceRecordIds?: readonly string[] | null;
  readonly opportunityUrl?: string | null;
  readonly stage?: string | null;
  readonly stageEntryDate?: string | null;
  readonly slaCreatedDate?: string | null;
  readonly clientAliases?: readonly string[] | null;
  readonly familyPhones?: readonly string[] | null;
  readonly familyEmails?: readonly string[] | null;
  readonly practiceId?: string | null;
  readonly businessProfileId?: string | null;
  readonly practiceProviderRosterComplete?: boolean;
  readonly payer?: string | null;
  readonly authorizationNumbers?: readonly string[] | null;
  readonly rbtNames?: readonly string[] | null;
  readonly candidateNames?: readonly string[] | null;
  readonly providerRoster?: readonly RosterCandidate[] | null;
  readonly providerRosterScope?: string | null;
}
export interface ProfileProvider extends IdentityProvider {
  role: string;
  name: string | null;
  names: string[];
  email: string | null;
  emails: string[];
  phones: string[];
  salesforceIds: string[];
  portalProviderIds: string[];
}
export interface IdentityProfile {
  opportunityId: string;
  opportunityName: string;
  leadId: string | null;
  accountId: string | null;
  contactId: string | null;
  backendUserId: string | null;
  salesforceRecordIds: string[];
  opportunityUrl: string | null;
  stage: string | null;
  stageEntryDate: string | null;
  slaCreatedDate: string | null;
  clientAliases: string[];
  clientAliasRegistryVersion: string;
  clientAliasRegistryMatchCount: number;
  clientAliasEvidence: unknown[];
  familyPhones: string[];
  familyEmails: string[];
  practice: Exclude<ProviderIdentityInput['practice'], undefined>;
  practiceId: string | null;
  businessProfileId: string | null;
  practiceAliases: string[];
  practiceProviderRosterComplete: boolean;
  providers: ProfileProvider[];
  providerRoles: ProviderRoleCluster[];
  providerIdentity: ProviderIdentityCluster;
  providerNames: string[];
  providerEmails: string[];
  providerPhones: string[];
  providerIds: string[];
  portalProviderIds: string[];
  meetingAliases: string[];
  csmNames: string[];
  csmEmails: string[];
  currentCsm: Exclude<ProviderIdentityInput['currentCsm'], undefined>;
  priorCsms: IdentityValue[];
  payer: string | null;
  authorizationNumbers: string[];
  rbtNames: string[];
  candidateNames: string[];
  providerRoster: readonly RosterCandidate[];
  providerRosterScope: string | null;
}
function nameVariants(name = ''): string[] {
  const normalized = normalizeIdentityValue(name);
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 0) return [];
  const variants = new Set([normalized, parts.join(''), [...parts].reverse().join(' ')]);
  if (parts.length > 1) {
    variants.add(`${parts[0] ?? ''} ${parts.at(-1)?.[0] ?? ''}`);
    variants.add(`${parts[0]?.[0] ?? ''} ${parts.at(-1) ?? ''}`);
  }
  return [...variants];
}
function profileProvider(
  cluster: ProviderIdentityCluster,
  role = 'Unspecified',
  name = cluster.names[0] ?? null,
  email = cluster.emails[0] ?? null
): ProfileProvider {
  return {
    role,
    name,
    names: cluster.names,
    email,
    emails: cluster.emails,
    phones: cluster.phones,
    salesforceIds: cluster.salesforceIds,
    portalProviderIds: cluster.portalProviderIds,
  };
}
export function buildIdentityProfile(input: IdentityProfileInput): IdentityProfile {
  const registry = clientIdentityAliasesFor({
    opportunityId: input.opportunityId,
    opportunityName: input.opportunityName,
    practiceId: input.practiceId ?? input.businessProfileId,
  });
  const clientAliases = new Set<string>();
  for (const name of [input.opportunityName, ...(input.clientAliases ?? []), ...registry.aliases])
    for (const variant of nameVariants(name)) clientAliases.add(variant);
  const providerIdentity = buildProviderIdentityCluster(input);
  const providerRoles = buildProviderRoleClusters(input);
  const salesforceRecordIds = [
    input.opportunityId,
    input.leadId,
    input.accountId,
    input.contactId,
    ...(input.relatedSalesforceRecordIds ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return {
    opportunityId: input.opportunityId,
    leadId: input.leadId ?? null,
    accountId: input.accountId ?? null,
    contactId: input.contactId ?? null,
    backendUserId: input.backendUserId ?? null,
    salesforceRecordIds: [...new Set(salesforceRecordIds)],
    opportunityUrl: input.opportunityUrl ?? null,
    opportunityName: input.opportunityName,
    stage: input.stage ?? null,
    stageEntryDate: input.stageEntryDate ?? null,
    slaCreatedDate: input.slaCreatedDate ?? null,
    clientAliases: [...clientAliases],
    clientAliasRegistryVersion: registry.registryVersion,
    clientAliasRegistryMatchCount: registry.registryMatchCount,
    clientAliasEvidence: registry.evidence,
    familyPhones: (input.familyPhones ?? []).map((value) => value.replace(/\D/g, '').slice(-10)),
    familyEmails: [
      ...new Set((input.familyEmails ?? []).map((value) => value.trim().toLowerCase())),
    ],
    practice: input.practice ?? null,
    practiceId: input.practiceId ?? input.businessProfileId ?? null,
    businessProfileId: input.businessProfileId ?? input.practiceId ?? null,
    practiceAliases: providerIdentity.practiceAliases,
    practiceProviderRosterComplete: input.practiceProviderRosterComplete === true,
    providers:
      providerRoles.length > 0
        ? providerRoles.map((provider) =>
            profileProvider(provider, provider.role, provider.primaryName, provider.primaryEmail)
          )
        : [profileProvider(providerIdentity)],
    providerRoles,
    providerIdentity,
    providerNames: providerIdentity.names,
    providerEmails: providerIdentity.emails,
    providerPhones: providerIdentity.phones,
    providerIds: providerIdentity.salesforceIds,
    portalProviderIds: providerIdentity.portalProviderIds,
    meetingAliases: providerIdentity.meetingAliases,
    csmNames: providerIdentity.csmNames,
    csmEmails: providerIdentity.csmEmails,
    currentCsm: input.currentCsm ?? null,
    priorCsms: [...new Set(input.priorCsms ?? [])],
    payer: input.payer ?? null,
    authorizationNumbers: [...new Set(input.authorizationNumbers ?? [])],
    rbtNames: [...new Set(input.rbtNames ?? [])],
    candidateNames: [...new Set(input.candidateNames ?? [])],
    providerRoster: input.providerRoster ?? [],
    providerRosterScope: input.providerRosterScope ?? null,
  };
}
