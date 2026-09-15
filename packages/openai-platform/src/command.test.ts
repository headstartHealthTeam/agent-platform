import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCommand } from './command.js';
import { readCredential } from './credential.js';
import { OpenAIPlatform } from './platform.js';

vi.mock('./credential.js', () => ({
  readCredential: vi.fn().mockResolvedValue('synthetic-credential'),
}));
vi.mock('./source.js', () => ({
  inspectWorkflow: vi.fn().mockReturnValue({ deploymentReady: false }),
  gitReader: vi.fn().mockReturnValue(() => ''),
  bundleSkills: vi.fn().mockReturnValue({
    revision: 'a'.repeat(40),
    digest: 'synthetic',
    skills: [{ name: 'synthetic' }],
    files: [],
  }),
}));
const temporary: string[] = [];
function inputs(): { config: string; request: string; directory: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'openai-command-'));
  temporary.push(directory);
  const config = path.join(directory, 'config.json');
  const request = path.join(directory, 'request.json');
  writeFileSync(
    config,
    JSON.stringify({
      profile: {
        schemaVersion: 'headstart-capability-profile/v1',
        id: 'synthetic',
        revision: 'v1',
        bindings: [
          {
            capabilityId: 'openai.agents.read',
            providerId: 'openai-sdk',
            adapterVersion: '0.1.0',
            credentialRef: 'synthetic',
            options: { organizationId: 'org-synthetic', projectId: 'proj_synthetic' },
          },
        ],
      },
      credentials: {
        synthetic: {
          account: 'headstarthealth.1password.com',
          expectedEmail: 'synthetic@example.com',
          vault: 'synthetic',
          item: 'synthetic',
        },
      },
    })
  );
  writeFileSync(
    request,
    JSON.stringify({ operation: 'agents.create', body: { model: 'synthetic-model' } })
  );
  return { config, request, directory };
}
beforeEach(() => {
  vi.stubEnv('HEADSTART_OPENAI_CONFIG', undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  for (const directory of temporary.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
describe('CLI contract', () => {
  it('supports help and rejects incomplete or unknown commands', async () => {
    expect(await runCommand([])).toHaveProperty('help');
    expect(await runCommand(['--help'])).toHaveProperty('help');
    await expect(runCommand(['unknown'])).rejects.toThrow('headstart-openai');
    await expect(runCommand(['read'])).rejects.toThrow('headstart-openai');
  });
  it('plans offline and requires the explicit apply approval argument', async () => {
    const { config, request } = inputs();
    expect(await runCommand(['plan', '--config', config, '--request', request])).toMatchObject({
      operation: 'agents.create',
      billable: false,
    });
    await expect(runCommand(['apply', '--config', config, '--request', request])).rejects.toThrow(
      'approval'
    );
    await expect(runCommand(['plan', '--config', config])).rejects.toThrow('Invalid');
    await expect(runCommand(['plan', '--config', 'nonexistent.json'])).rejects.toThrow(
      'Unable to read JSON'
    );
  });
  it('uses a private environment path while giving explicit config precedence', async () => {
    const { config, request } = inputs();
    vi.stubEnv('HEADSTART_OPENAI_CONFIG', config);
    expect(await runCommand(['plan', '--request', request])).toHaveProperty(
      'operation',
      'agents.create'
    );
    await expect(runCommand(['preflight', '--config', 'nonexistent.json'])).rejects.toThrow(
      'Unable to read JSON'
    );
    await expect(runCommand(['preflight', '--config', ''])).rejects.toThrow(
      'HEADSTART_OPENAI_CONFIG'
    );
    vi.stubEnv('HEADSTART_OPENAI_CONFIG', 'nonexistent.json');
    expect(await runCommand(['plan', '--config', config, '--request', request])).toHaveProperty(
      'operation',
      'agents.create'
    );
    await expect(runCommand(['preflight'])).rejects.toThrow('Unable to read JSON');
    vi.stubEnv('HEADSTART_OPENAI_CONFIG', '  ');
    await expect(runCommand(['preflight'])).rejects.toThrow('HEADSTART_OPENAI_CONFIG');
    expect(readCredential).not.toHaveBeenCalled();
  });
  it('keeps default output minimal and passes content/billing choices explicitly', async () => {
    const { config, request } = inputs();
    vi.spyOn(OpenAIPlatform.prototype, 'preflight').mockResolvedValue({
      projectId: 'proj_synthetic',
      agentsRead: true,
    });
    vi.spyOn(OpenAIPlatform.prototype, 'read').mockResolvedValue({
      data: { id: 'synthetic', instructions: 'private' },
      fingerprint: 'hash',
    });
    const apply = vi.spyOn(OpenAIPlatform.prototype, 'apply').mockResolvedValue({
      data: { id: 'synthetic', instructions: 'private' },
      fingerprint: 'hash',
    });
    expect(await runCommand(['preflight', '--config', config])).toHaveProperty('agentsRead', true);
    expect(await runCommand(['read', '--config', config, '--request', request])).toEqual({
      data: { id: 'synthetic' },
      fingerprint: 'hash',
    });
    expect(
      await runCommand(['read', '--config', config, '--request', request, '--include-content'])
    ).toHaveProperty('data.instructions', 'private');
    await runCommand([
      'apply',
      '--config',
      config,
      '--request',
      request,
      '--approve',
      'digest',
      '--allow-billable',
    ]);
    expect(apply).toHaveBeenCalledWith(expect.anything(), {
      apply: true,
      digest: 'digest',
      allowBillable: true,
    });
    await runCommand(['apply', '--config', config, '--request', request, '--approve', 'digest']);
    expect(apply).toHaveBeenLastCalledWith(expect.anything(), {
      apply: true,
      digest: 'digest',
      allowBillable: false,
    });
  });
  it('inspects workflows without credentials and writes bundles without overwriting', async () => {
    const { directory } = inputs();
    expect(await runCommand(['workflow', directory])).toEqual({ deploymentReady: false });
    const output = path.join(directory, 'bundle.json');
    expect(
      await runCommand(['bundle-skill', directory, 'a'.repeat(40), 'synthetic', '--output', output])
    ).toHaveProperty('skills', ['synthetic']);
    await expect(
      runCommand(['bundle-skill', directory, 'a'.repeat(40), 'synthetic', '--output', output])
    ).rejects.toThrow();
    await expect(runCommand(['bundle-skill'])).rejects.toThrow('headstart-openai');
  });
});
