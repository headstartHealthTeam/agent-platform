import { z } from 'zod';

// The expression is anchored and evaluated against strings bounded by the schema.
// eslint-disable-next-line security/detect-unsafe-regex -- bounded capability identifier grammar.
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const PROFILE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export const capabilityIdSchema = z.string().min(3).max(160).regex(CAPABILITY_ID_PATTERN);
export const profileIdSchema = z.string().min(1).max(80).regex(PROFILE_ID_PATTERN);
export const revisionSchema = z.string().min(1).max(200).regex(REVISION_PATTERN);
export const sideEffectClassSchema = z.enum(['read', 'propose', 'write']);

export const targetAssertionSchema = z
  .object({
    key: z.string().min(1).max(100),
    expected: z.union([z.string(), z.number(), z.boolean()]),
  })
  .strict();

export const capabilityRequirementSchema = z
  .object({
    id: capabilityIdSchema,
    sideEffect: sideEffectClassSchema,
    requiredPermissions: z.array(z.string().min(1)).default([]),
    targetAssertions: z.array(targetAssertionSchema).default([]),
    optional: z.boolean().default(false),
  })
  .strict();

const optionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const providerBindingSchema = z
  .object({
    capabilityId: capabilityIdSchema,
    providerId: profileIdSchema,
    adapterVersion: revisionSchema,
    credentialRef: profileIdSchema.optional(),
    options: z.record(z.string(), optionValueSchema).default({}),
  })
  .strict();

export const executionProfileSchema = z
  .object({
    schemaVersion: z.literal('headstart-capability-profile/v1'),
    id: profileIdSchema,
    revision: revisionSchema,
    bindings: z.array(providerBindingSchema),
  })
  .strict()
  .superRefine((profile, context) => {
    const seen = new Set<string>();
    for (const [index, binding] of profile.bindings.entries()) {
      if (seen.has(binding.capabilityId)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate capability binding: ${binding.capabilityId}`,
          path: ['bindings', index, 'capabilityId'],
        });
      }
      seen.add(binding.capabilityId);
    }
  });

export const preflightStatusSchema = z.enum([
  'ready',
  'provider-unavailable',
  'unsupported-version',
  'unauthenticated',
  'insufficient-permission',
  'wrong-target',
  'incomplete-visibility',
  'side-effect-mismatch',
  'transient-failure',
  'terminal-failure',
]);

export const capabilityPreflightResultSchema = z
  .object({
    capabilityId: capabilityIdSchema,
    providerId: profileIdSchema,
    adapterVersion: revisionSchema,
    status: preflightStatusSchema,
    permissions: z.array(z.string()).default([]),
    targetIdentity: z.record(z.string(), optionValueSchema).default({}),
    message: z.string().min(1),
  })
  .strict();

export type CapabilityRequirement = z.infer<typeof capabilityRequirementSchema>;
export type ProviderBinding = z.infer<typeof providerBindingSchema>;
export type ExecutionProfile = z.infer<typeof executionProfileSchema>;
export type CapabilityPreflightResult = z.infer<typeof capabilityPreflightResultSchema>;
export type SideEffectClass = z.infer<typeof sideEffectClassSchema>;
export type PreflightStatus = z.infer<typeof preflightStatusSchema>;
