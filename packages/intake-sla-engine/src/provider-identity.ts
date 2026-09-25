import aliases from './contracts/provider-identity-aliases.json' with { type: 'json' };
import { explicitRoleProviders, providerInputs } from './provider-identity-input.js';
import type {
  IdentityClusterArrays,
  IdentityValue,
  ProviderIdentityCluster,
  ProviderIdentityInput,
  ProviderIdentityRegistry,
  ProviderRoleCluster,
} from './provider-identity-types.js';
import {
  identityValues,
  normalizeIdentityEmail,
  normalizeIdentityPhone,
  normalizeIdentityValue,
  uniqueIdentityValues,
} from './provider-identity-values.js';

export const PROVIDER_IDENTITY_ALIASES: ProviderIdentityRegistry = aliases;
type Seed = { [Field in keyof Omit<IdentityClusterArrays, 'registryEmails'>]: IdentityValue[] };
function providerSeed(input: ProviderIdentityInput): Seed {
  const providers = providerInputs(input);
  const providerValues = (fields: readonly string[]): IdentityValue[] =>
    providers.flatMap((provider) => identityValues(provider, fields));
  const providerProfileEmails = [
    ...identityValues(input, ['providerProfileEmails']),
    ...providerValues(['providerProfileEmail', 'providerProfileEmails']),
  ];
  const businessEmails = [
    ...identityValues(input, ['businessEmails']),
    ...providerValues(['businessEmail', 'businessEmails']),
  ];
  const contactEmails = [
    ...identityValues(input, ['contactEmails']),
    ...providerValues(['contactEmail', 'contactEmails', 'secondaryEmail']),
  ];
  const backendUserEmails = [
    ...identityValues(input, ['backendUserEmails', 'portalLoginEmails']),
    ...providerValues(['backendUserEmail', 'portalLoginEmail']),
  ];
  const firefliesParticipantEmails = [
    ...identityValues(input, ['firefliesParticipantEmails']),
    ...providerValues(['firefliesParticipantEmail', 'firefliesParticipantEmails']),
  ];
  return {
    salesforceIds: [
      ...identityValues(input, ['providerIds']),
      ...providerValues(['id', 'salesforceId']),
    ],
    names: [
      ...identityValues(input, ['providerNames', 'providerAliases']),
      ...providerValues(['name', 'legalName', 'displayName', 'nickname', 'aliases']),
    ],
    emails: [
      ...identityValues(input, ['providerEmails']),
      ...providerValues(['email', 'emails']),
      ...providerProfileEmails,
      ...businessEmails,
      ...contactEmails,
      ...backendUserEmails,
      ...firefliesParticipantEmails,
    ],
    providerProfileEmails,
    businessEmails,
    contactEmails,
    backendUserEmails,
    firefliesParticipantEmails,
    phones: [...identityValues(input, ['providerPhones']), ...providerValues(['phone', 'phones'])],
    practiceAliases: [
      ...(typeof input.practice === 'string'
        ? [input.practice]
        : identityValues(input.practice, ['name', 'aliases'])),
      ...identityValues(input, ['practiceAliases']),
      ...providerValues(['practiceName', 'practice', 'practiceAliases']),
    ],
    meetingAliases: [
      ...identityValues(input, ['meetingAliases']),
      ...providerValues(['meetingAliases']),
    ],
    portalProviderIds: [
      ...identityValues(input, ['portalProviderIds']),
      ...providerValues(['portalProviderId', 'portalProviderIds']),
    ],
    csmNames: [
      ...identityValues(input, ['priorCsms']),
      ...(typeof input.currentCsm === 'string'
        ? [input.currentCsm]
        : identityValues(input.currentCsm, ['name', 'aliases'])),
      ...identityValues(input, ['csmNames']),
    ],
    csmEmails: [
      ...(typeof input.currentCsm === 'object'
        ? identityValues(input.currentCsm, ['email', 'emails'])
        : []),
      ...identityValues(input, ['csmEmails']),
    ],
  };
}
function registryMatch(seed: Seed, entry: ProviderIdentityRegistry['providers'][number]): boolean {
  const ids = new Set(seed.salesforceIds.map(String));
  if (entry.salesforceIds.some((id) => ids.has(id))) return true;
  const emails = new Set(seed.emails.map(normalizeIdentityEmail));
  if (entry.emails.some((email) => emails.has(normalizeIdentityEmail(email)))) return true;
  const names = new Set(seed.names.map(normalizeIdentityValue));
  return entry.names.some((name) => names.has(normalizeIdentityValue(name)));
}
export function buildProviderIdentityCluster(
  input: ProviderIdentityInput,
  registry: ProviderIdentityRegistry = PROVIDER_IDENTITY_ALIASES
): ProviderIdentityCluster {
  const seed = providerSeed(input);
  const matches = registry.providers.filter((entry) => registryMatch(seed, entry));
  const merged = (field: keyof Seed): IdentityValue[] => [
    ...identityValues(seed, [field]),
    ...matches.flatMap((entry) => identityValues(entry, [field])),
  ];
  const emails = (values: readonly IdentityValue[]): string[] =>
    uniqueIdentityValues(values, normalizeIdentityEmail).map(normalizeIdentityEmail);
  return {
    registryVersion: registry.version,
    registryMatchCount: matches.length,
    salesforceIds: uniqueIdentityValues(merged('salesforceIds'), String),
    names: uniqueIdentityValues(merged('names')),
    emails: emails(merged('emails')),
    providerProfileEmails: emails(seed.providerProfileEmails),
    businessEmails: emails(seed.businessEmails),
    contactEmails: emails(seed.contactEmails),
    backendUserEmails: emails(seed.backendUserEmails),
    firefliesParticipantEmails: emails(seed.firefliesParticipantEmails),
    registryEmails: emails(matches.flatMap((entry) => entry.emails)),
    phones: uniqueIdentityValues(merged('phones'), normalizeIdentityPhone)
      .map(normalizeIdentityPhone)
      .filter(Boolean),
    practiceAliases: uniqueIdentityValues(merged('practiceAliases')),
    meetingAliases: uniqueIdentityValues(merged('meetingAliases')),
    portalProviderIds: uniqueIdentityValues(merged('portalProviderIds'), String),
    csmNames: uniqueIdentityValues(merged('csmNames')),
    csmEmails: emails(merged('csmEmails')),
  };
}
export function buildProviderRoleClusters(
  input: ProviderIdentityInput,
  registry: ProviderIdentityRegistry = PROVIDER_IDENTITY_ALIASES
): ProviderRoleCluster[] {
  const common = {
    practice: input.practice,
    practiceAliases: input.practiceAliases,
    currentCsm: input.currentCsm,
    priorCsms: input.priorCsms,
    csmNames: input.csmNames,
    csmEmails: input.csmEmails,
  };
  return explicitRoleProviders(input).map((provider, index) => {
    const cluster = buildProviderIdentityCluster({ ...common, providers: [provider] }, registry);
    return {
      role: provider.role ?? 'Unspecified',
      sequence: index,
      primaryName:
        provider.name ?? provider.displayName ?? provider.legalName ?? cluster.names[0] ?? null,
      primaryEmail:
        provider.firefliesParticipantEmail ??
        provider.backendUserEmail ??
        provider.providerProfileEmail ??
        provider.contactEmail ??
        provider.businessEmail ??
        provider.email ??
        cluster.emails[0] ??
        null,
      ...cluster,
    };
  });
}
export function providerClusterAnchors(
  cluster: Pick<
    ProviderIdentityCluster,
    | 'salesforceIds'
    | 'names'
    | 'emails'
    | 'phones'
    | 'practiceAliases'
    | 'meetingAliases'
    | 'portalProviderIds'
  >
): string[] {
  return [
    ...cluster.salesforceIds,
    ...cluster.names,
    ...cluster.emails,
    ...cluster.phones,
    ...cluster.practiceAliases,
    ...cluster.meetingAliases,
    ...cluster.portalProviderIds,
  ].filter(Boolean);
}
