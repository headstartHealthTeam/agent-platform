import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGoogleAdcTokenProvider, GoogleReaderError } from './bound-adc.js';
import type { GoogleBoundAdcOptions } from './bound-adc.js';

afterEach(() => {
  vi.unstubAllGlobals();
});
function binding(overrides: Partial<GoogleBoundAdcOptions> = {}): GoogleBoundAdcOptions {
  const directory = path.join(os.tmpdir(), 'synthetic-private-google');
  const clientFile = path.join(os.tmpdir(), 'synthetic-approved-client.json');
  return {
    configDir: directory,
    clientIdFile: clientFile,
    expectedEmail: 'operator@example.invalid',
    env: {
      PATH: 'synthetic-bin',
      OPENAI_API_KEY: 'synthetic-unrelated',
      GOOGLE_APPLICATION_CREDENTIALS: 'synthetic-wrong',
      CLOUDSDK_AUTH_ACCESS_TOKEN: 'synthetic-override',
      CLOUDSDK_CORE_LOG_HTTP: 'true',
    },
    lstat: async (file) => ({
      mode: file === directory ? 0o700 : 0o600,
      isDirectory: () => file === directory,
      isFile: () => file !== directory,
      isSymbolicLink: () => false,
    }),
    readFile: async (file) =>
      JSON.stringify(
        file === clientFile
          ? { installed: { client_id: 'synthetic-client' } }
          : {
              type: 'authorized_user',
              client_id: 'synthetic-client',
              refresh_token: 'synthetic-refresh',
              account: 'operator@example.invalid',
            }
      ),
    execFile: async () => ({ stdout: 'synthetic-access\n' }),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ email: 'operator@example.invalid', verified_email: true }),
    }),
    ...overrides,
  };
}
describe('explicit private Google ADC identity binding', () => {
  it('captures identity and dependencies once while preserving the original environment reference', async () => {
    let time = 0;
    const env = { PATH: 'before' };
    const options = { ...binding({ env, now: () => time }) };
    const execFile = vi.fn(options.execFile);
    options.execFile = execFile;
    const provider = createGoogleAdcTokenProvider(options);
    options.configDir = path.join(os.tmpdir(), 'changed-binding');
    options.expectedEmail = 'changed@example.invalid';
    options.clientIdFile = path.join(os.tmpdir(), 'changed-client.json');
    options.readFile = async (): Promise<never> => {
      throw new Error('Changed file reader');
    };
    options.execFile = async (): Promise<never> => {
      throw new Error('Changed command');
    };
    options.fetchImpl = async (): Promise<never> => {
      throw new Error('Changed fetch');
    };
    options.lstat = async (): Promise<never> => {
      throw new Error('Changed stat');
    };
    options.env = { PATH: 'replacement environment' };
    env.PATH = 'first refresh';
    await expect(provider()).resolves.toBe('synthetic-access');
    time = 40 * 60 * 1000;
    env.PATH = 'expired refresh';
    await expect(provider()).resolves.toBe('synthetic-access');
    expect(execFile.mock.calls.map((call) => call[2].env['PATH'])).toEqual([
      'first refresh',
      'expired refresh',
    ]);
    expect(execFile.mock.calls.map((call) => call[2].env['CLOUDSDK_CONFIG'])).toEqual([
      path.join(os.tmpdir(), 'synthetic-private-google'),
      path.join(os.tmpdir(), 'synthetic-private-google'),
    ]);
  });
  it('coalesces refreshes, keeps credentials child-only and verifies identity before caching', async () => {
    let time = 0;
    const options = binding({ now: () => time });
    const execFile = vi.fn(options.execFile),
      fetchImpl = vi.fn(options.fetchImpl);
    const provider = createGoogleAdcTokenProvider({ ...options, execFile, fetchImpl });
    expect(execFile).not.toHaveBeenCalled();
    expect(await Promise.all([provider(), provider()])).toEqual([
      'synthetic-access',
      'synthetic-access',
    ]);
    expect(execFile).toHaveBeenCalledExactlyOnceWith(
      'gcloud',
      ['auth', 'application-default', 'print-access-token'],
      {
        env: { PATH: 'synthetic-bin', CLOUDSDK_CONFIG: options.configDir },
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      }
    );
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: 'Bearer synthetic-access' },
      })
    );
    expect(fetchImpl.mock.calls.at(0)?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(options.env?.['OPENAI_API_KEY']).toBe('synthetic-unrelated');
    time = 39 * 60 * 1000;
    await provider();
    expect(execFile).toHaveBeenCalledTimes(1);
    time = 40 * 60 * 1000;
    await provider();
    expect(execFile).toHaveBeenCalledTimes(2);
  });
  it('rejects relative paths and invalid email before any IO', () => {
    for (const override of [
      { configDir: 'relative' },
      { clientIdFile: 'relative' },
      { expectedEmail: '' },
      { expectedEmail: 'bad address' },
    ])
      expect(() => createGoogleAdcTokenProvider(binding(override))).toThrow(
        'GOOGLE_READER_BINDING_REQUIRED'
      );
  });
  it('requires private regular credential files and a private non-symlink directory', async () => {
    for (const scenario of ['mode', 'symlink', 'directory', 'file']) {
      const options = binding(),
        execFile = vi.fn(options.execFile);
      const provider = createGoogleAdcTokenProvider({
        ...options,
        execFile,
        lstat: async (file) => ({
          ...(await options.lstat(file)),
          ...(scenario === 'mode' ? { mode: 0o644 } : {}),
          ...(scenario === 'symlink' ? { isSymbolicLink: (): boolean => true } : {}),
          ...(scenario === 'directory' ? { isDirectory: (): boolean => false } : {}),
          ...(scenario === 'file' ? { isFile: (): boolean => false } : {}),
        }),
      });
      await expect(provider()).rejects.toMatchObject({
        code: 'GOOGLE_READER_PRIVATE_BINDING_REQUIRED',
      });
      expect(execFile).not.toHaveBeenCalled();
    }
  });
  it('binds the authorized-user client, optional account and token endpoint without auth fallback', async () => {
    const invalid = [
      { type: 'service_account' },
      { client_id: 'wrong' },
      { refresh_token: '' },
      { token_uri: 'https://wrong.example.invalid' },
      { account: 'wrong@example.invalid' },
    ];
    for (const override of invalid) {
      const options = binding(),
        execFile = vi.fn(options.execFile);
      const provider = createGoogleAdcTokenProvider({
        ...options,
        execFile,
        readFile: async (file, encoding) =>
          file === options.clientIdFile
            ? options.readFile(file, encoding)
            : JSON.stringify({
                type: 'authorized_user',
                client_id: 'synthetic-client',
                refresh_token: 'synthetic-refresh',
                ...override,
              }),
      });
      await expect(provider()).rejects.toMatchObject({
        code: 'GOOGLE_READER_CLIENT_OR_ACCOUNT_MISMATCH',
      });
      expect(execFile).not.toHaveBeenCalled();
    }
    const options = binding();
    const provider = createGoogleAdcTokenProvider({
      ...options,
      readFile: async (file, encoding) =>
        file === options.clientIdFile
          ? options.readFile(file, encoding)
          : JSON.stringify({
              type: 'authorized_user',
              client_id: 'synthetic-client',
              refresh_token: 'synthetic-refresh',
              token_uri: 'https://oauth2.googleapis.com/token',
              account: 'OPERATOR@EXAMPLE.INVALID',
            }),
    });
    await expect(provider()).resolves.toBe('synthetic-access');
  });
  it('sanitizes malformed credentials, token output and unverified or unavailable identity', async () => {
    const scenarios: Partial<GoogleBoundAdcOptions>[] = [
      { readFile: async () => 'not json synthetic-sensitive' },
      { readFile: async () => 'null' },
      {
        execFile: async (): Promise<never> => {
          throw new Error('synthetic-sensitive command output');
        },
      },
      { execFile: async () => ({ stdout: 'warning\nsynthetic-sensitive' }) },
      { execFile: async () => ({ stdout: '' }) },
      {
        fetchImpl: async () => ({
          ok: false,
          status: 403,
          json: async () => ({ private: 'synthetic-sensitive' }),
        }),
      },
      {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ email: 'wrong@example.invalid', verified_email: true }),
        }),
      },
      {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ email: 'operator@example.invalid', verified_email: false }),
        }),
      },
      { fetchImpl: async () => ({ ok: true, json: async () => ({ verified_email: true }) }) },
      {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ email: 7, verified_email: true }),
        }),
      },
    ];
    for (const scenario of scenarios) {
      try {
        await createGoogleAdcTokenProvider(binding(scenario))();
        throw new Error('Expected synthetic rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(GoogleReaderError);
        expect(JSON.stringify(error)).not.toMatch(
          /synthetic-sensitive|synthetic-refresh|synthetic-access/
        );
      }
    }
  });
  it('clears failed refreshes, retries on a later explicit call and supports the default fetch', async () => {
    const options = binding();
    let calls = 0;
    const provider = createGoogleAdcTokenProvider({
      ...options,
      execFile: async () => {
        if (++calls === 1) throw new Error('synthetic failure');
        return { stdout: 'synthetic-access' };
      },
    });
    await expect(provider()).rejects.toMatchObject({
      code: 'GOOGLE_READER_CREDENTIAL_UNAVAILABLE',
    });
    await expect(provider()).resolves.toBe('synthetic-access');
    expect(calls).toBe(2);
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ verified_email: true, email: options.expectedEmail }))
    );
    vi.stubGlobal('fetch', fetchImpl);
    const defaultOptions = {
      configDir: options.configDir,
      clientIdFile: options.clientIdFile,
      expectedEmail: options.expectedEmail,
      execFile: options.execFile,
      readFile: options.readFile,
      lstat: options.lstat,
    };
    const defaultProvider = createGoogleAdcTokenProvider(defaultOptions);
    const replacement = vi.fn();
    vi.stubGlobal('fetch', replacement);
    await expect(defaultProvider()).resolves.toBe('synthetic-access');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
  });
});
