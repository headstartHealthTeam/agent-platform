import { normalizeClientName } from './client-name.js';
import aliases from './contracts/client-identity-aliases.json' with { type: 'json' };

export interface ClientIdentityEntry {
  readonly [key: string]: unknown;
  readonly opportunityIds?: readonly string[] | null | undefined;
  readonly names?: readonly string[] | null | undefined;
  readonly practiceIds?: readonly string[] | null | undefined;
  readonly aliases?: readonly string[] | null | undefined;
  readonly evidence?: unknown;
}
export interface ClientIdentityRegistry {
  readonly version: string;
  readonly clients: readonly ClientIdentityEntry[];
}
export interface ClientIdentityInput {
  readonly opportunityId?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
  readonly practiceId?: string | null | undefined;
}
export const CLIENT_IDENTITY_ALIASES: ClientIdentityRegistry = aliases;
export function clientIdentityRegistryMatches(
  { opportunityId = null, opportunityName = null, practiceId = null }: ClientIdentityInput = {},
  registry: ClientIdentityRegistry = CLIENT_IDENTITY_ALIASES
): ClientIdentityEntry[] {
  const normalizedName = normalizeClientName(opportunityName);
  return registry.clients.filter((entry) => {
    if (Boolean(opportunityId) && entry.opportunityIds?.includes(opportunityId ?? '') === true)
      return true;
    if (
      normalizedName.length > 0 &&
      entry.names?.some((name) => normalizeClientName(name) === normalizedName) === true
    )
      return (
        !practiceId ||
        (entry.practiceIds?.length ?? 0) === 0 ||
        entry.practiceIds?.includes(practiceId) === true
      );
    return false;
  });
}
export function clientIdentityAliasesFor(
  input: ClientIdentityInput = {},
  registry: ClientIdentityRegistry = CLIENT_IDENTITY_ALIASES
): {
  registryVersion: string;
  registryMatchCount: number;
  aliases: string[];
  evidence: unknown[];
} {
  const matches = clientIdentityRegistryMatches(input, registry);
  return {
    registryVersion: registry.version,
    registryMatchCount: matches.length,
    aliases: [...new Set(matches.flatMap((entry) => entry.aliases ?? []))],
    evidence: matches.map((entry) => entry.evidence).filter(Boolean),
  };
}
