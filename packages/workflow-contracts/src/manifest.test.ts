import { describe, expect, it } from 'vitest';

import { parseWorkflowManifest, type WorkflowManifest } from './manifest.js';

const makeManifest = (): WorkflowManifest => ({
  apiVersion: 'headstart.health/v1alpha1',
  kind: 'ManagedAgentWorkflow',
  metadata: {
    id: 'synthetic-read-only-example',
    displayName: 'Synthetic read-only example',
    version: '0.1.0',
    description: 'Exercises the managed workflow contract with synthetic inputs.',
    lifecycle: 'draft',
    owners: {
      business: {
        name: 'Example owner',
        team: 'Example team',
        contact: 'example-business-owner',
      },
      technical: {
        name: 'Example steward',
        team: 'Engineering',
        contact: 'example-technical-owner',
      },
      backup: {
        name: 'Example backup',
        team: 'Engineering',
        contact: 'example-backup-owner',
      },
    },
  },
  spec: {
    execution: {
      entrypoint: 'prompts/run.md',
      sandbox: 'read-only',
      networkAccess: 'disabled',
      timeoutSeconds: 300,
      model: { id: 'configured-at-deployment' },
    },
    skills: {
      source: { repository: 'headstartHealthTeam/agent-skills', revision: 'workspace' },
      required: ['headstart-document-review'],
    },
    identity: { serviceProfile: 'synthetic-none', requiredSecrets: [] },
    workspace: { repositories: [] },
    tools: { mcpServers: [], cliCommands: [] },
    triggers: [{ type: 'manual' }],
    contracts: {
      inputSchema: 'schemas/input.schema.json',
      outputSchema: 'schemas/output.schema.json',
    },
    sideEffects: { mode: 'read-only', approvalRequired: false },
    retry: { maxAttempts: 1, initialBackoffSeconds: 5 },
    observability: {
      dataClassification: 'internal',
      retentionDays: 30,
      emitCodexEvents: true,
    },
  },
});

describe('workflowManifestSchema', () => {
  it('accepts a complete draft workflow', () => {
    expect(parseWorkflowManifest(makeManifest()).metadata.id).toBe('synthetic-read-only-example');
  });

  it('rejects non-draft workflows without an immutable skill revision', () => {
    const manifest = makeManifest();
    manifest.metadata.lifecycle = 'active';
    manifest.spec.execution.model.id = 'gpt-example';

    expect(() => parseWorkflowManifest(manifest)).toThrow(/pin the skill source/);
  });

  it('requires an exact model for non-draft workflows', () => {
    const manifest = makeManifest();
    manifest.metadata.lifecycle = 'active';
    manifest.spec.skills.source.revision = 'a'.repeat(40);

    expect(() => parseWorkflowManifest(manifest)).toThrow(/exact model identifier/);
  });

  it('requires a backup owner for non-draft workflows', () => {
    const manifest = makeManifest();
    manifest.metadata.lifecycle = 'active';
    manifest.spec.execution.model.id = 'gpt-example';
    manifest.spec.skills.source.revision = 'a'.repeat(40);
    delete manifest.metadata.owners.backup;

    expect(() => parseWorkflowManifest(manifest)).toThrow(/backup owner/);
  });

  it('requires actionable owner contacts for non-draft workflows', () => {
    const manifest = makeManifest();
    manifest.metadata.lifecycle = 'active';
    manifest.spec.execution.model.id = 'gpt-example';
    manifest.spec.skills.source.revision = 'a'.repeat(40);
    delete manifest.metadata.owners.technical.contact;

    expect(() => parseWorkflowManifest(manifest)).toThrow(/actionable contact for the technical/);
  });

  it.each(['v1.2.3', 'agent-skills-v1.2.3', 'v1.2.3-rc.1'])(
    'accepts immutable semantic tag revision %s',
    (revision) => {
      const manifest = makeManifest();
      manifest.metadata.lifecycle = 'active';
      manifest.spec.execution.model.id = 'gpt-example';
      manifest.spec.skills.source.revision = revision;

      expect(parseWorkflowManifest(manifest).spec.skills.source.revision).toBe(revision);
    }
  );

  it('requires approval for workflows that can produce external writes', () => {
    const manifest = makeManifest();
    manifest.spec.sideEffects = { mode: 'approved-write', approvalRequired: false };

    expect(() => parseWorkflowManifest(manifest)).toThrow(/requires approvalRequired=true/);
  });

  it('prohibits raw Codex event emission for PHI workflows', () => {
    const manifest = makeManifest();
    manifest.spec.observability.dataClassification = 'phi';

    expect(() => parseWorkflowManifest(manifest)).toThrow(/disable raw Codex event emission/);
  });
});
