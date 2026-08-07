import { z } from 'zod';

// Both expressions are anchored and operate on bounded strings; the security rule cannot infer that.
// eslint-disable-next-line security/detect-unsafe-regex -- bounded slug grammar has no ambiguous repetition.
const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line security/detect-unsafe-regex -- bounded semver grammar has no ambiguous repetition.
const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
/* eslint-disable security/detect-unsafe-regex -- anchored revision grammar runs on strings bounded to 200 characters. */
const PINNED_REVISION_PATTERN =
  /^(?:[a-f0-9]{40}|(?:[a-z0-9][a-z0-9._/-]*-)?v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
/* eslint-enable security/detect-unsafe-regex */

export const workflowIdentifierSchema = z.string().min(1).max(80).regex(IDENTIFIER_PATTERN);
export const workflowVersionSchema = z.string().min(5).max(80).regex(SEMANTIC_VERSION_PATTERN);
const relativeFileSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/') && !value.includes('..'), {
    message: 'must be a repository-relative path without parent traversal',
  });

const ownerSchema = z
  .object({
    name: z.string().min(1),
    team: z.string().min(1),
    contact: z.string().min(1).optional(),
  })
  .strict();

const toolPolicySchema = z
  .object({
    mcpServers: z
      .array(
        z
          .object({
            name: workflowIdentifierSchema,
            required: z.boolean(),
            allowedTools: z.array(z.string().min(1)).min(1),
          })
          .strict()
      )
      .default([]),
    cliCommands: z
      .array(
        z
          .object({
            executable: z.string().min(1),
            allowedSubcommands: z.array(z.string().min(1)).min(1),
          })
          .strict()
      )
      .default([]),
  })
  .strict();

const manualTriggerSchema = z
  .object({
    type: z.literal('manual'),
  })
  .strict();

const scheduleTriggerSchema = z
  .object({
    type: z.literal('schedule'),
    expression: z.string().min(1),
    timezone: z.string().min(1),
  })
  .strict();

const eventTriggerSchema = z
  .object({
    type: z.literal('event'),
    source: workflowIdentifierSchema,
    eventType: z.string().min(1),
  })
  .strict();

const sideEffectPolicySchema = z
  .object({
    mode: z.enum(['read-only', 'propose-only', 'approved-write']),
    approvalRequired: z.boolean(),
  })
  .strict()
  .superRefine((policy, context) => {
    const requiresApproval = policy.mode !== 'read-only';
    if (policy.approvalRequired !== requiresApproval) {
      context.addIssue({
        code: 'custom',
        message: `${policy.mode} requires approvalRequired=${String(requiresApproval)}`,
        path: ['approvalRequired'],
      });
    }
  });

const skillSourceSchema = z
  .object({
    repository: z.string().min(1),
    revision: z.string().min(1).max(200),
  })
  .strict();

const workflowManifestBaseSchema = z
  .object({
    apiVersion: z.literal('headstart.health/v1alpha1'),
    kind: z.literal('ManagedAgentWorkflow'),
    metadata: z
      .object({
        id: workflowIdentifierSchema,
        displayName: z.string().min(1),
        version: workflowVersionSchema,
        description: z.string().min(1),
        lifecycle: z.enum(['draft', 'active', 'paused', 'retired']),
        owners: z
          .object({
            business: ownerSchema,
            technical: ownerSchema,
            backup: ownerSchema.optional(),
          })
          .strict(),
      })
      .strict(),
    spec: z
      .object({
        execution: z
          .object({
            entrypoint: relativeFileSchema,
            sandbox: z.enum(['read-only', 'workspace-write']),
            networkAccess: z.enum(['disabled', 'allowlisted']),
            timeoutSeconds: z.number().int().min(30).max(28_800),
            model: z
              .object({
                id: z.string().min(1),
                reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),
              })
              .strict(),
          })
          .strict(),
        skills: z
          .object({
            source: skillSourceSchema,
            required: z.array(workflowIdentifierSchema).min(1),
          })
          .strict(),
        identity: z
          .object({
            serviceProfile: workflowIdentifierSchema,
            requiredSecrets: z.array(workflowIdentifierSchema).default([]),
          })
          .strict(),
        workspace: z
          .object({
            repositories: z
              .array(
                z
                  .object({
                    name: workflowIdentifierSchema,
                    repository: z.string().min(1),
                    revision: z.string().min(1).max(200),
                    access: z.enum(['read-only', 'workspace-write']),
                  })
                  .strict()
              )
              .default([]),
          })
          .strict(),
        tools: toolPolicySchema,
        triggers: z
          .array(
            z.discriminatedUnion('type', [
              manualTriggerSchema,
              scheduleTriggerSchema,
              eventTriggerSchema,
            ])
          )
          .min(1),
        contracts: z
          .object({
            inputSchema: relativeFileSchema,
            outputSchema: relativeFileSchema,
          })
          .strict(),
        sideEffects: sideEffectPolicySchema,
        retry: z
          .object({
            maxAttempts: z.number().int().min(1).max(10),
            initialBackoffSeconds: z.number().int().min(1).max(3_600),
          })
          .strict(),
        observability: z
          .object({
            dataClassification: z.enum(['public', 'internal', 'confidential', 'phi']),
            retentionDays: z.number().int().min(1).max(2_555),
            emitCodexEvents: z.boolean(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

type WorkflowManifestBase = z.infer<typeof workflowManifestBaseSchema>;

const validateNonDraftOwners = (manifest: WorkflowManifestBase, context: z.RefinementCtx): void => {
  if (!manifest.metadata.owners.backup) {
    context.addIssue({
      code: 'custom',
      message: 'non-draft workflows must declare a backup owner',
      path: ['metadata', 'owners', 'backup'],
    });
  }

  for (const [role, owner] of Object.entries(manifest.metadata.owners)) {
    if (!owner?.contact) {
      context.addIssue({
        code: 'custom',
        message: `non-draft workflows must declare an actionable contact for the ${role} owner`,
        path: ['metadata', 'owners', role, 'contact'],
      });
    }
  }
};

const validateNonDraftRevisions = (
  manifest: WorkflowManifestBase,
  context: z.RefinementCtx
): void => {
  if (!PINNED_REVISION_PATTERN.test(manifest.spec.skills.source.revision)) {
    context.addIssue({
      code: 'custom',
      message: 'non-draft workflows must pin the skill source to a full commit or semantic tag',
      path: ['spec', 'skills', 'source', 'revision'],
    });
  }

  for (const [index, repository] of manifest.spec.workspace.repositories.entries()) {
    if (!PINNED_REVISION_PATTERN.test(repository.revision)) {
      context.addIssue({
        code: 'custom',
        message: 'non-draft workflows must pin workspace repositories to immutable revisions',
        path: ['spec', 'workspace', 'repositories', index, 'revision'],
      });
    }
  }
};

const validateNonDraftManifest = (
  manifest: WorkflowManifestBase,
  context: z.RefinementCtx
): void => {
  validateNonDraftOwners(manifest, context);
  validateNonDraftRevisions(manifest, context);
  if (manifest.spec.execution.model.id === 'configured-at-deployment') {
    context.addIssue({
      code: 'custom',
      message: 'non-draft workflows must declare an exact model identifier',
      path: ['spec', 'execution', 'model', 'id'],
    });
  }
};

const validateObservability = (manifest: WorkflowManifestBase, context: z.RefinementCtx): void => {
  if (
    manifest.spec.observability.dataClassification === 'phi' &&
    manifest.spec.observability.emitCodexEvents
  ) {
    context.addIssue({
      code: 'custom',
      message: 'PHI workflows must disable raw Codex event emission',
      path: ['spec', 'observability', 'emitCodexEvents'],
    });
  }
};

export const workflowManifestSchema = workflowManifestBaseSchema.superRefine(
  (manifest, context) => {
    if (manifest.metadata.lifecycle !== 'draft') {
      validateNonDraftManifest(manifest, context);
    }
    validateObservability(manifest, context);
  }
);

export type WorkflowManifest = z.infer<typeof workflowManifestSchema>;

export const parseWorkflowManifest = (value: unknown): WorkflowManifest =>
  workflowManifestSchema.parse(value);
