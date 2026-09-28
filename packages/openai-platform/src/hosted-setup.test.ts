import { describe, expect, it } from 'vitest';

import { actionSchema } from './operations.js';

function parseEnvironment(environment: unknown): unknown {
  const action = actionSchema.parse({
    operation: 'sessions.create',
    body: { agent_id: 'synthetic', environment },
  });
  if (action.operation !== 'sessions.create') throw new Error('Expected creation');
  return action.body.environment;
}

describe('hosted environment setup contract', () => {
  it.each([
    {},
    { packages: {}, files: [], env: {}, setup_commands: [] },
    { packages: null, files: null, env: null, setup_commands: null },
    { packages: { npm: null, python: null, system: null } },
    { setup_commands: [{ command: 'pwd', cwd: null }] },
  ])('preserves template inheritance and explicit clearing: %j', (setup) => {
    const environment = {
      type: 'openai_hosted',
      environment_template_id: 'template_synthetic',
      ...setup,
    };
    expect(parseEnvironment(environment)).toEqual(environment);
  });

  it.each([
    { packages: { npm: 'pnpm@9.15.0' } },
    { packages: { unrecognized: ['package'] } },
    { env: { SETTING: 123 } },
    { files: [{ type: 'inline', path: '/workspace/input', data: 'not base64' }] },
    { files: [{ type: 'file_id', path: '/workspace/input' }] },
    { files: [{ type: 'inline', path: '/workspace/../etc/input', data: 'e30=' }] },
    { files: [{ type: 'inline', path: '/elsewhere/input', data: 'e30=' }] },
    { setup_commands: ['node --version'] },
    { setup_commands: [{ command: 'pwd', cwd: 'relative' }] },
  ])('rejects malformed provider configuration: %j', (setup) => {
    expect(() => parseEnvironment({ type: 'openai_hosted', ...setup })).toThrow();
  });

  it('does not attach hosted setup to none or self-hosted execution', () => {
    for (const environment of [
      { type: 'none' },
      { type: 'self_hosted', workspace_directory: '/workspace' },
    ]) {
      expect(
        actionSchema.safeParse({
          operation: 'sessions.create',
          body: {
            agent_id: 'synthetic',
            input: 'synthetic input',
            environment: { ...environment, setup_commands: [{ command: 'pwd' }] },
          },
        }).success
      ).toBe(false);
    }
  });
});
