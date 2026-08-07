import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  loadWorkflowPackage,
  validateWorkflowInput,
  validateWorkflowOutput,
} from './workflow-package.js';

const temporaryDirectories: string[] = [];

const writeFixture = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-workflow-'));
  temporaryDirectories.push(directory);
  fs.mkdirSync(path.join(directory, 'prompts'));
  fs.mkdirSync(path.join(directory, 'schemas'));
  fs.writeFileSync(
    path.join(directory, 'workflow.yaml'),
    `apiVersion: headstart.health/v1alpha1
kind: ManagedAgentWorkflow
metadata:
  id: synthetic-example
  displayName: Synthetic example
  version: 0.1.0
  description: Synthetic workflow fixture.
  lifecycle: draft
  owners:
    business:
      name: Example owner
      team: Example team
    technical:
      name: Example steward
      team: Engineering
spec:
  execution:
    entrypoint: prompts/run.md
    sandbox: read-only
    networkAccess: disabled
    timeoutSeconds: 60
    model:
      id: configured-at-deployment
  skills:
    source:
      repository: headstartHealthTeam/agent-platform
      revision: workspace
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
    mode: read-only
    approvalRequired: false
  retry:
    maxAttempts: 1
    initialBackoffSeconds: 5
  observability:
    dataClassification: internal
    retentionDays: 30
    emitCodexEvents: true
`
  );
  fs.writeFileSync(path.join(directory, 'prompts', 'run.md'), 'Return the synthetic subject.');
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('workflow package runtime', () => {
  it('loads a complete package and validates its input and output contracts', () => {
    const workflow = loadWorkflowPackage(writeFixture());

    expect(workflow.prompt).toContain('synthetic subject');
    expect(validateWorkflowInput(workflow, { subject: 'Example' }).valid).toBe(true);
    expect(validateWorkflowInput(workflow, {}).valid).toBe(false);
    expect(validateWorkflowOutput(workflow, { summary: 'Example' }).valid).toBe(true);
  });

  it('fails when a referenced file does not exist', () => {
    const directory = writeFixture();
    fs.rmSync(path.join(directory, 'prompts', 'run.md'));

    expect(() => loadWorkflowPackage(directory)).toThrow(/does not exist/);
  });

  it.skipIf(process.platform === 'win32')(
    'fails when a referenced symlink resolves outside the workflow package',
    () => {
      const directory = writeFixture();
      const outsideFile = path.join(os.tmpdir(), `headstart-outside-${String(Date.now())}.md`);
      temporaryDirectories.push(outsideFile);
      fs.writeFileSync(outsideFile, 'Outside workflow instructions.');
      fs.rmSync(path.join(directory, 'prompts', 'run.md'));
      fs.symlinkSync(outsideFile, path.join(directory, 'prompts', 'run.md'));

      expect(() => loadWorkflowPackage(directory)).toThrow(/resolves outside package directory/);
    }
  );
});
