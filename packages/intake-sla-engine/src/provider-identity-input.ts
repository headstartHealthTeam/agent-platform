import { z } from 'zod';

import type {
  IdentityProvider,
  ProviderIdentityInput,
  ProviderSourceIdentity,
} from './provider-identity-types.js';
import { identityValues, PROVIDER_ROLE_FIELDS } from './provider-identity-values.js';

const text = z.string().nullish();
const providerSchema = z.looseObject({
  role: text,
  name: text,
  displayName: text,
  legalName: text,
  firefliesParticipantEmail: text,
  backendUserEmail: text,
  providerProfileEmail: text,
  contactEmail: text,
  businessEmail: text,
  email: text,
});
function asProviderObject(value: unknown): IdentityProvider | null {
  const present = Boolean(value);
  if (!present) return null;
  return typeof value === 'string' ? { name: value } : providerSchema.parse(value);
}
function providerValues(input: ProviderIdentityInput, fields: readonly string[]): unknown[] {
  const values = new Map(Object.entries(input));
  return fields.flatMap((field): unknown[] => {
    const value = values.get(field);
    if (Array.isArray(value)) return value;
    const present = Boolean(value);
    return present ? [value] : [];
  });
}
function withRole(value: unknown, role: string): IdentityProvider | null {
  const provider = asProviderObject(value);
  return provider === null ? null : { ...provider, role: provider.role ?? role };
}
function configuredProviders(input: ProviderIdentityInput): IdentityProvider[] {
  const configured = input.providerRoles ?? {};
  if (Array.isArray(configured)) {
    return configured.map(asProviderObject).filter((value) => value !== null);
  }
  return Object.entries(configured).flatMap(([role, values]) =>
    (Array.isArray(values) ? values : [values])
      .map((value) => withRole(value, role))
      .filter((value) => value !== null)
  );
}
export function explicitRoleProviders(input: ProviderIdentityInput): IdentityProvider[] {
  return [
    ...configuredProviders(input),
    ...PROVIDER_ROLE_FIELDS.flatMap(([role, fields]) =>
      providerValues(input, fields)
        .map((value) => withRole(value, role))
        .filter((value) => value !== null)
    ),
  ];
}
export function providerInputs(input: ProviderIdentityInput): IdentityProvider[] {
  return [
    ...(input.providers ?? []).map(asProviderObject).filter((value) => value !== null),
    ...explicitRoleProviders(input),
  ];
}
export interface ProviderSourceIdentityInput {
  readonly role?: string;
  readonly providerProfile?: Readonly<Record<string, unknown>>;
  readonly contacts?: readonly Readonly<Record<string, unknown>>[];
  readonly businessProfile?: Readonly<Record<string, unknown>>;
  readonly backendUser?: Readonly<Record<string, unknown>>;
  readonly verifiedFirefliesParticipants?: readonly Readonly<Record<string, unknown>>[];
}
function scalar(input: Readonly<Record<string, unknown>>, key: string): string | null | undefined {
  return text.parse(new Map(Object.entries(input)).get(key));
}
function joined(input: Readonly<Record<string, unknown>>, fields: readonly string[]): string {
  return fields
    .map((field) => scalar(input, field))
    .filter(Boolean)
    .join(' ');
}
export function providerIdentityInputFromSources({
  role = 'Unspecified',
  providerProfile = {},
  contacts = [],
  businessProfile = {},
  backendUser = {},
  verifiedFirefliesParticipants = [],
}: ProviderSourceIdentityInput): ProviderSourceIdentity {
  const contact = contacts.find(
    (value) => Boolean(scalar(value, 'MobilePhone')) || Boolean(scalar(value, 'Phone'))
  );
  const practice = z
    .object({ Practice_Name__r: z.object({ Name: text }).nullish() })
    .parse(providerProfile).Practice_Name__r;
  return {
    role,
    id: scalar(providerProfile, 'Id') ?? scalar(providerProfile, 'id') ?? null,
    name: scalar(providerProfile, 'Name') ?? joined(backendUser, ['firstName', 'lastName']),
    legalName: joined(providerProfile, ['First_Name__c', 'Last_Name__c']) || null,
    providerProfileEmail: scalar(providerProfile, 'Email__c') ?? null,
    providerProfileEmails: identityValues(providerProfile, ['Email__c']),
    contactEmails: contacts.flatMap((value) =>
      identityValues(value, ['Email', 'Secondary_Email__c'])
    ),
    businessEmails: identityValues(businessProfile, ['Business_Email__c']),
    backendUserEmail: scalar(backendUser, 'email') ?? null,
    firefliesParticipantEmails: verifiedFirefliesParticipants.flatMap((value) =>
      identityValues(value, ['email', 'emails'])
    ),
    phone:
      scalar(backendUser, 'mobile') ??
      scalar(providerProfile, 'Phone__c') ??
      scalar(contact ?? {}, 'MobilePhone') ??
      scalar(contact ?? {}, 'Phone') ??
      scalar(businessProfile, 'Business_Phone__c') ??
      null,
    portalProviderId:
      scalar(providerProfile, 'Headstart_Backend_Id__c') ?? scalar(backendUser, 'id') ?? null,
    salesforceId: scalar(providerProfile, 'Id') ?? scalar(providerProfile, 'id') ?? null,
    practiceName:
      scalar(businessProfile, 'Name') ?? practice?.Name ?? scalar(backendUser, 'llcName') ?? null,
  };
}
