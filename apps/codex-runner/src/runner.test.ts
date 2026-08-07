import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { WorkflowRunRequest } from '@headstart-health/workflow-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CodexTurnExecutor } from './executor.js';
import { ManagedWorkflowRunner, type ManagedWorkflowSource } from './runner.js';

const temporaryDirectories: string[] = [];
const REPOSITORY_COMMIT = 'a'.repeat(40);

const makeWorkflowPackage = (sideEffectMode = 'read-only'): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-runner-'));
  temporaryDirectories.push(directory);
  fs.mkdirSync(path.join(directory, 'prompts'));
  fs.mkdirSync(path.join(directory, 'schemas'));
  fs.writeFileSync(
    path.join(directory, 'workflow.yaml'),
    `apiVersion: headstart.health/v1alpha1
kind: ManagedAgentWorkflow
metadata:
  id: synthetic-runner-example
  displayName: Synthetic runner example
  version: 1.0.0
  description: Synthetic runner fixture.
  lifecycle: active
  owners:
    business:
      name: Example owner
      team: Example team
      contact: example-business-owner
    technical:
      name: Example steward
      team: Engineering
      contact: example-technical-owner
    backup:
      name: Example backup
      team: Engineering
      contact: example-backup-owner
spec:
  execution:
    entrypoint: prompts/run.md
    sandbox: read-only
    networkAccess: disabled
    timeoutSeconds: 60
    model:
      id: gpt-example
  skills:
    source:
      repository: headstartHealthTeam/agent-platform
      revision: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    required:
      - headstart-document-review
  identity:
    serviceProfile: synthetic-none
    requiredSecrets: []
  workspace:
    repositories: []
  tools:
    mcpServers: []
    cliCommands: []
  triggers:
    - type: manual
  contracts:
    inputSchema: schemas/input.schema.json
    outputSchema: schemas/output.schema.json
  sideEffects:
    mode: ${sideEffectMode}
    approvalRequired: ${String(sideEffectMode !== 'read-only')}
  retry:
    maxAttempts: 1
    initialBackoffSeconds: 5
  observability:
    dataClassification: internal
    retentionDays: 30
    emitCodexEvents: true
`
  );
  fs.writeFileSync(path.join(directory, 'prompts', 'run.md'), 'Summarize the subject.');
  fs.writeFileSync(
    path.join(directory, 'schemas', 'input.schema.json'),
    JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { subject: { type: 'string' } },
      required: ['subject'],
      additionalProperties: false,
    })
  );
  fs.writeFileSync(
    path.join(directory, 'schemas', 'output.schema.json'),
    JSON.stringify({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
      additionalProperties: false,
    })
  );
  return directory;
};

const makeRequest = (input: unknown = { subject: 'Synthetic subject' }): WorkflowRunRequest => ({
  runId: '9c3a3491-b6af-4778-b546-c46f8088dd68',
  workflow: {
    id: 'synthetic-runner-example',
    version: '1.0.0',
    repositoryCommit: REPOSITORY_COMMIT,
  },
  trigger: {
    type: 'manual',
    idempotencyKey: 'synthetic-run-001',
    requestedBy: 'synthetic-reviewer',
  },
  requestedAt: '2026-08-07T12:00:00.000Z',
  input,
});

const makeSource = (
  packageDirectory: string,
  repositoryCommit = REPOSITORY_COMMIT
): ManagedWorkflowSource => ({ packageDirectory, repositoryCommit });

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('ManagedWorkflowRunner', () => {
  it('validates input, invokes Codex, and validates structured output', async () => {
    const execute = vi.fn().mockResolvedValue({
      threadId: 'synthetic-thread',
      finalResponse: '{"summary":"Synthetic summary"}',
      usage: null,
    });
    const runner = new ManagedWorkflowRunner({ execute } satisfies CodexTurnExecutor);
    const packageDirectory = makeWorkflowPackage();

    const result = await runner.run(makeSource(packageDirectory), packageDirectory, makeRequest());

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sandbox: 'read-only',
        networkAccess: 'disabled',
        emitEvents: true,
      })
    );
    expect(result.runId).toBe(makeRequest().runId);
    expect(result.output).toEqual({ summary: 'Synthetic summary' });
  });

  it('rejects invalid input before invoking Codex', async () => {
    const execute = vi.fn();
    const runner = new ManagedWorkflowRunner({ execute } satisfies CodexTurnExecutor);
    const packageDirectory = makeWorkflowPackage();

    await expect(
      runner.run(makeSource(packageDirectory), packageDirectory, makeRequest({}))
    ).rejects.toThrow(/Workflow input is invalid/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects write-capable workflows until the approval executor exists', async () => {
    const execute = vi.fn();
    const runner = new ManagedWorkflowRunner({ execute } satisfies CodexTurnExecutor);
    const packageDirectory = makeWorkflowPackage('propose-only');

    await expect(
      runner.run(makeSource(packageDirectory), packageDirectory, makeRequest())
    ).rejects.toThrow(/Approval-backed external actions are not implemented/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects malformed structured output', async () => {
    const execute = vi.fn().mockResolvedValue({
      threadId: 'synthetic-thread',
      finalResponse: 'not-json',
      usage: null,
    });
    const runner = new ManagedWorkflowRunner({ execute } satisfies CodexTurnExecutor);
    const packageDirectory = makeWorkflowPackage();

    await expect(
      runner.run(makeSource(packageDirectory), packageDirectory, makeRequest())
    ).rejects.toThrow(/not valid JSON/);
  });

  it('rejects a run request before loading execution policy when its contract is invalid', async () => {
    const execute = vi.fn();
    const runner = new ManagedWorkflowRunner({ execute } satisfies CodexTurnExecutor);
    const packageDirectory = makeWorkflowPackage();

    await expect(
      runner.run(makeSource(packageDirectory), packageDirectory, { runId: 'not-a-uuid' })
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a run request for a different materialized repository commit', async () => {
    const execute = vi.fn();
    const runner = new ManagedWorkflowRunner({ execute } satisfies CodexTurnExecutor);
    const packageDirectory = makeWorkflowPackage();

    await expect(
      runner.run(makeSource(packageDirectory, 'b'.repeat(40)), packageDirectory, makeRequest())
    ).rejects.toThrow(/materialized workflow repository commit/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a trigger type that the workflow does not declare', async () => {
    const execute = vi.fn();
    const runner = new ManagedWorkflowRunner({ execute } satisfies CodexTurnExecutor);
    const packageDirectory = makeWorkflowPackage();
    const request = makeRequest();
    request.trigger.type = 'schedule';

    await expect(
      runner.run(makeSource(packageDirectory), packageDirectory, request)
    ).rejects.toThrow(/does not declare the schedule trigger/);
    expect(execute).not.toHaveBeenCalled();
  });
});
