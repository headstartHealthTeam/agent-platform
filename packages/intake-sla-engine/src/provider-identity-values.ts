import { z } from 'zod';

import type { IdentityValue } from './provider-identity-types.js';

export function normalizeIdentityValue(value: IdentityValue = ''): string {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@.+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function normalizeIdentityEmail(value: IdentityValue = ''): string {
  return String(value).trim().toLowerCase();
}
export function normalizeIdentityPhone(value: IdentityValue = ''): string {
  return String(value).replace(/\D/g, '').slice(-10);
}
export function identityValues(
  input: object | null | undefined,
  fields: readonly string[]
): IdentityValue[] {
  const record = new Map<string, unknown>(Object.entries(input ?? {}));
  return fields.flatMap((field) => {
    const value = record.get(field);
    if (Array.isArray(value))
      return z
        .array(z.union([z.string(), z.literal(false), z.literal(0), z.null(), z.undefined()]))
        .parse(value);
    const present = Boolean(value);
    return present ? [z.string().parse(value)] : [];
  });
}
export function uniqueIdentityValues(
  items: readonly IdentityValue[],
  normalize: (value: string) => string = normalizeIdentityValue
): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of items.filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )) {
    const key = normalize(item);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}
export const PROVIDER_ROLE_FIELDS: readonly (readonly [string, readonly string[]])[] = [
  ['Rendering Provider', ['renderingProvider', 'renderingProviders']],
  ['IA Rendering Provider', ['iaRenderingProvider', 'iaRenderingProviders']],
  ['TA Rendering Provider', ['taRenderingProvider', 'taRenderingProviders']],
  ['Current Provider', ['currentProvider', 'currentProviders']],
  ['Prior Provider', ['priorProvider', 'priorProviders']],
  [
    'Practice Provider',
    [
      'practiceProvider',
      'practiceProviders',
      'practiceProviderRoster',
      'providerRoster',
      'businessProfileProvider',
      'businessProfileProviders',
    ],
  ],
  ['Other Linked Provider', ['linkedProvider', 'linkedProviders', 'allLinkedProviders']],
];
export const PROVIDER_CLUSTER_ARRAY_FIELDS = [
  'salesforceIds',
  'names',
  'emails',
  'providerProfileEmails',
  'businessEmails',
  'contactEmails',
  'backendUserEmails',
  'firefliesParticipantEmails',
  'registryEmails',
  'phones',
  'practiceAliases',
  'meetingAliases',
  'portalProviderIds',
  'csmNames',
  'csmEmails',
] as const;
