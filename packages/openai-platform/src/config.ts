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

export interface ResolvedConfig {
  target: Target;
  binding: ProviderBinding;
  credential: CredentialReference;
}

export function resolveConfig(input: unknown): ResolvedConfig {
  const config = configSchema.safeParse(input);
  if (!config.success) {
    throw new Error('Invalid local OpenAI configuration.');
  }
  const binding = resolveCapabilityBinding(config.data.profile, requirement);
  const target = targetSchema.safeParse(binding.options);
  const credential = Object.entries(config.data.credentials).find(
    ([name]) => name === binding.credentialRef
  )?.[1];
  if (
    binding.providerId !== PROVIDER ||
    binding.adapterVersion !== ADAPTER_VERSION ||
    !target.success ||
    credential === undefined
  ) {
    throw new Error('Unsupported OpenAI binding, target, or credential reference.');
  }
  return { target: target.data, binding, credential };
}
