export type IdentityValue = string | null | undefined | false | 0;
export interface IdentityProvider {
  readonly [field: string]: unknown;
  readonly role?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly displayName?: string | null | undefined;
  readonly legalName?: string | null | undefined;
  readonly firefliesParticipantEmail?: string | null | undefined;
  readonly backendUserEmail?: string | null | undefined;
  readonly providerProfileEmail?: string | null | undefined;
  readonly contactEmail?: string | null | undefined;
  readonly businessEmail?: string | null | undefined;
  readonly email?: string | null | undefined;
}
export type ProviderValue = string | IdentityProvider | null | undefined | false | 0;
export interface ProviderSourceIdentity extends IdentityProvider {
  readonly id: string | null;
  readonly name: string;
  readonly legalName: string | null;
  readonly providerProfileEmail: string | null;
  readonly providerProfileEmails: readonly IdentityValue[];
  readonly contactEmails: readonly IdentityValue[];
  readonly businessEmails: readonly IdentityValue[];
  readonly backendUserEmail: string | null;
  readonly firefliesParticipantEmails: readonly IdentityValue[];
  readonly phone: string | null;
  readonly portalProviderId: string | null;
  readonly salesforceId: string | null;
  readonly practiceName: string | null;
}
export interface ProviderIdentityInput {
  readonly [field: string]: unknown;
  readonly providers?: readonly ProviderValue[] | null | undefined;
  readonly providerRoles?:
    | readonly ProviderValue[]
    | Readonly<Record<string, ProviderValue | readonly ProviderValue[]>>
    | null
    | undefined;
  readonly practice?: string | Readonly<Record<string, unknown>> | null | undefined;
  readonly practiceAliases?: readonly IdentityValue[] | string | null | undefined;
  readonly currentCsm?: string | Readonly<Record<string, unknown>> | null | undefined;
  readonly priorCsms?: readonly IdentityValue[] | string | null | undefined;
  readonly csmNames?: readonly IdentityValue[] | string | null | undefined;
  readonly csmEmails?: readonly IdentityValue[] | string | null | undefined;
}
export interface ProviderIdentityCluster {
  registryVersion: string;
  registryMatchCount: number;
  salesforceIds: string[];
  names: string[];
  emails: string[];
  providerProfileEmails: string[];
  businessEmails: string[];
  contactEmails: string[];
  backendUserEmails: string[];
  firefliesParticipantEmails: string[];
  registryEmails: string[];
  phones: string[];
  practiceAliases: string[];
  meetingAliases: string[];
  portalProviderIds: string[];
  csmNames: string[];
  csmEmails: string[];
}
export type IdentityClusterArrays = Omit<
  ProviderIdentityCluster,
  'registryVersion' | 'registryMatchCount'
>;
export interface ProviderRoleCluster extends ProviderIdentityCluster {
  readonly [field: string]: unknown;
  role: string;
  sequence: number;
  primaryName: string | null;
  primaryEmail: string | null;
}
export interface ProviderIdentityRegistry {
  readonly version: string;
  readonly providers: readonly (Partial<IdentityClusterArrays> & {
    readonly salesforceIds: readonly string[];
    readonly names: readonly string[];
    readonly emails: readonly string[];
  })[];
}
