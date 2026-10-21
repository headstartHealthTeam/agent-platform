import {
  executionProfileSchema,
  type ProviderBinding,
} from '@headstart-health/capability-contracts';
import { resolveCapabilityBinding } from '@headstart-health/capability-runtime';
import { z } from 'zod';

export const CAPABILITY = 'openai.agents.read';
export const PROVIDER = 'openai-sdk';
export const ADAPTER_VERSION = '0.1.0';
export const requirement = {
  id: CAPABILITY,
  sideEffect: 'read' as const,
  requiredPermissions: ['api.agents.read'],
  targetAssertions: [],
  optional: false,
};

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
export const targetSchema = z
  .object({
    organizationId: identifier.refine((value) => value.startsWith('org-')),
    projectId: identifier.refine((value) => value.startsWith('proj_')),
  })
  .strict();
export type Target = z.infer<typeof targetSchema>;
export const credentialSchema = z
  .object({
    account: z.literal('headstarthealth.1password.com'),
    expectedEmail: z.email(),
    vault: identifier,
    item: identifier,
    field: identifier.default('credential'),
  })
  .strict();
export type CredentialReference = z.infer<typeof credentialSchema>;
export const configSchema = z
  .object({
    profile: executionProfileSchema,
    credentials: z.record(z.string(), credentialSchema),
  })
  .strict();

export interface RuntimeConfig {
  target: Target;
  binding: ProviderBinding;
}

export interface ResolvedConfig extends RuntimeConfig {
  credential: CredentialReference;
}

/** Services supply their API key without workstation credential metadata. Both compositions
 * retain the same explicit capability binding and live organization/project verification.
 */
export function resolveRuntimeConfig(input: unknown): RuntimeConfig {
  const config = configSchema.partial({ credentials: true }).safeParse(input);
  if (!config.success) throw new Error('Invalid OpenAI runtime configuration.');
  return resolveProfile(config.data.profile);
}

function resolveProfile(profile: z.infer<typeof executionProfileSchema>): RuntimeConfig {
  const binding = resolveCapabilityBinding(profile, requirement);
  const target = targetSchema.safeParse(binding.options);
  if (
    binding.providerId !== PROVIDER ||
    binding.adapterVersion !== ADAPTER_VERSION ||
    !target.success
  ) {
    throw new Error('Unsupported OpenAI binding or target.');
  }
  return { target: target.data, binding };
}

export function resolveConfig(input: unknown): ResolvedConfig {
  const config = configSchema.safeParse(input);
  if (!config.success) {
    throw new Error('Invalid local OpenAI configuration.');
  }
  const runtime = resolveProfile(config.data.profile);
  const credential = Object.entries(config.data.credentials).find(
    ([name]) => name === runtime.binding.credentialRef
  )?.[1];
  if (credential === undefined) throw new Error('Unsupported OpenAI credential reference.');
  return { ...runtime, credential };
}
