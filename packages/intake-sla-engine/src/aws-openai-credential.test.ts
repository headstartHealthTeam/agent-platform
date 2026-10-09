import { afterEach, describe, expect, it, vi } from 'vitest';

import { withAwsOpenAICredential, type AwsCredentialExecOptions } from './aws-openai-credential.js';

const env = {
  OPENAI_API_KEY: 'inherited-synthetic-key',
  SLA_AI_INTERPRETATION: 'on',
  SLA_INTERPRETER_MODEL: 'gpt-5.6-sol',
  SLA_INTERPRETER_PROVIDER: 'openai-responses',
};
const binding = {
  profile: 'synthetic-profile',
  region: 'synthetic-region',
  secretId: 'synthetic/approved-secret',
  env,
};
afterEach(() => {
  vi.unstubAllEnvs();
});
describe('approved AWS credential handoff', () => {
  it.each([
    'synthetic-key',
    '"synthetic-key"',
    '{"OPENAI_API_KEY":"synthetic-key"}',
    '{"openai_api_key":"synthetic-key"}',
    '{"apiKey":"synthetic-key"}',
    '{"api_key":"synthetic-key"}',
    '{"key":"synthetic-key"}',
    '{"key":"synthetic-key","OPENAI_API_KEY":"synthetic-key"}',
  ])('keeps a supported secret child-only and removes it after completion (%#)', async (value) => {
    let captured: NodeJS.ProcessEnv | undefined;
    const execFile = vi.fn(
      async (command: string, args: readonly string[], options: AwsCredentialExecOptions) => {
        expect(command).toBe('aws');
        expect(options).toEqual({
          encoding: 'utf8',
          env: {
            SLA_AI_INTERPRETATION: 'on',
            SLA_INTERPRETER_MODEL: 'gpt-5.6-sol',
            SLA_INTERPRETER_PROVIDER: 'openai-responses',
          },
          timeout: 30000,
          maxBuffer: 1048576,
        });
        expect(args).toEqual([
          'secretsmanager',
          'get-secret-value',
          '--profile',
          binding.profile,
          '--region',
          binding.region,
          '--secret-id',
          binding.secretId,
          '--output',
          'json',
        ]);
        expect(args).not.toContain('synthetic-key');
        return { stdout: JSON.stringify({ SecretString: value }) };
      }
    );
    const result = await withAwsOpenAICredential({
      ...binding,
      execFile,
      run: async (child) => {
        captured = child;
        expect(child['OPENAI_API_KEY']).toBe('synthetic-key');
        expect(child['SLA_INTERPRETER_MODEL']).toBe('gpt-5.6-sol');
        expect(child['SLA_APPROVED_CREDENTIAL_SOURCE']).toBe(
          'aws-secrets-manager:synthetic/approved-secret'
        );
        return 17;
      },
    });
    expect(result).toBe(17);
    expect(captured?.['OPENAI_API_KEY']).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBe('inherited-synthetic-key');
  });
  it.each([
    {},
    { SecretString: '' },
    { SecretString: '{broken' },
    { SecretString: '[broken' },
    { SecretString: '"broken' },
    { SecretString: '{"unrelated":"synthetic-key"}' },
    { SecretString: '{"key":"one","OPENAI_API_KEY":"two"}' },
    { SecretString: 'embedded\nwhitespace' },
    { SecretString: 'null' },
    { SecretString: '[]' },
    { SecretString: '2' },
    null,
  ])('sanitizes invalid secret envelopes without reaching the consumer (%#)', async (response) => {
    const run = vi.fn();
    await expect(
      withAwsOpenAICredential({
        ...binding,
        execFile: async () => ({ stdout: JSON.stringify(response) }),
        run,
      })
    ).rejects.toThrow('AWS_OPENAI_CREDENTIAL_UNAVAILABLE');
    expect(run).not.toHaveBeenCalled();
  });
  it('sanitizes CLI failures and invalid JSON without fallback', async () => {
    const run = vi.fn();
    for (const execFile of [
      async (): Promise<never> => {
        throw new Error('Sensitive provider body');
      },
      async (): Promise<{ stdout: string }> => ({ stdout: 'not JSON' }),
    ]) {
      await expect(withAwsOpenAICredential({ ...binding, execFile, run })).rejects.toThrow(
        'AWS_OPENAI_CREDENTIAL_UNAVAILABLE'
      );
    }
    expect(run).not.toHaveBeenCalled();
  });
  it('validates explicit bindings and approved model before any credential read', async () => {
    const execFile = vi.fn(async () => ({ stdout: '' }));
    const run = vi.fn();
    for (const bad of [
      { profile: '' },
      { region: '\nregion' },
      { secretId: undefined },
      { secretId: 'secret\0suffix' },
      { env: { ...env, SLA_INTERPRETER_MODEL: 'other' } },
      { env: { ...env, SLA_AI_INTERPRETATION: 'off' } },
      { env: { ...env, SLA_INTERPRETER_PROVIDER: '' } },
    ]) {
      await expect(
        withAwsOpenAICredential({ ...binding, ...bad, execFile, run })
      ).rejects.toThrow();
    }
    expect(execFile).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it('clears the ephemeral key on consumer failure and leaves the original environment untouched', async () => {
    let captured: NodeJS.ProcessEnv | undefined;
    const failure = new Error('consumer failed');
    await expect(
      withAwsOpenAICredential({
        ...binding,
        execFile: async () => ({ stdout: '{"SecretString":"synthetic-key"}' }),
        run: (child) => {
          captured = child;
          throw failure;
        },
      })
    ).rejects.toBe(failure);
    expect(captured?.['OPENAI_API_KEY']).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBe('inherited-synthetic-key');
  });
  it('uses a copy of the default environment when explicitly selected', async () => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { profile, region, secretId } = binding;
    const selected = { profile, region, secretId };
    await withAwsOpenAICredential({
      ...selected,
      execFile: async (_command, _args, options) => {
        expect(options.env['OPENAI_API_KEY']).toBeUndefined();
        return { stdout: '{"SecretString":"synthetic-key"}' };
      },
      run: (child) => {
        expect(child['OPENAI_API_KEY']).toBe('synthetic-key');
      },
    });
    expect(process.env['OPENAI_API_KEY']).toBe(env.OPENAI_API_KEY);
  });
});
