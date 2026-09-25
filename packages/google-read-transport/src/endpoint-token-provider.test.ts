import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleEndpointTokenProvider } from './endpoint-token-provider.js';
import { GoogleReadError } from './transport.js';

const endpoint = 'https://identity.example.com/google/token';
const config = { endpoint, authorizationEnvironmentVariable: 'SYNTHETIC_GOOGLE_AUTH' };
const scope = 'https://www.googleapis.com/auth/drive.readonly';
const token = 'invented-google-token';
const tokenResponse = (overrides: Record<string, unknown> = {}): Response =>
  Response.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: 300,
    scope,
    ...overrides,
  });
const provider = (): GoogleEndpointTokenProvider =>
  new GoogleEndpointTokenProvider(config, [scope]);

describe('renewable deployment-owned Google tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubEnv(config.authorizationEnvironmentVariable, 'synthetic-full-header-placeholder');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses an exact endpoint with unchanged authorization, caches and renews in one provider', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => tokenResponse());
    vi.stubGlobal('fetch', fetcher);
    const tokens = provider();
    expect(await tokens.getAccessToken()).toBe(token);
    expect(await tokens.getAccessToken()).toBe(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(endpoint);
    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect({ ...request, signal: undefined }).toEqual({
      method: 'GET',
      headers: {
        Authorization: 'synthetic-full-header-placeholder',
        Accept: 'application/json',
      },
      redirect: 'error',
      cache: 'no-store',
      signal: undefined,
    });
    vi.setSystemTime(Date.now() + 269_999);
    expect(await tokens.getAccessToken()).toBe(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    fetcher.mockResolvedValueOnce(tokenResponse({ access_token: 'invented-renewed-token' }));
    expect(await tokens.getAccessToken()).toBe('invented-renewed-token');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refresh and permits retry after a failure', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('secret body and endpoint'))
      .mockImplementation(async () => tokenResponse());
    vi.stubGlobal('fetch', fetcher);
    const tokens = provider();
    const failures = await Promise.allSettled([tokens.getAccessToken(), tokens.getAccessToken()]);
    expect(failures).toEqual([
      {
        status: 'rejected',
        reason: new GoogleReadError(
          'Configured Google token endpoint could not supply an access token'
        ),
      },
      {
        status: 'rejected',
        reason: new GoogleReadError(
          'Configured Google token endpoint could not supply an access token'
        ),
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await Promise.all([tokens.getAccessToken(), tokens.getAccessToken()])).toEqual([
      token,
      token,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not return expired cached credentials when renewal fails or the clock moves backwards', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse());
    vi.stubGlobal('fetch', fetcher);
    const tokens = provider();
    await tokens.getAccessToken();
    vi.setSystemTime(Date.now() - 1);
    fetcher.mockRejectedValue(new Error('unavailable'));
    await expect(tokens.getAccessToken()).rejects.toThrow('could not supply');
    vi.setSystemTime(Date.now() + 360_001);
    await expect(tokens.getAccessToken()).rejects.toThrow('could not supply');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    'http://identity.example.com/google/token',
    'https://user@identity.example.com/google/token',
    'https://identity.example.com/google/token?secret=value',
    'https://identity.example.com/google/token#fragment',
    'https://identity.example.com/google/token?',
    'https://identity.example.com/google/token#',
    ' https://identity.example.com/google/token',
    'not a URL',
  ])('rejects noncanonical or credential-bearing endpoint configuration', (endpoint) => {
    expect(() => new GoogleEndpointTokenProvider({ ...config, endpoint }, [scope])).toThrow(
      'exact HTTPS'
    );
  });

  it('rejects a URL containing an invented password', () => {
    const credentialUrl = new URL(endpoint);
    credentialUrl.password = 'invented-password';
    expect(
      () => new GoogleEndpointTokenProvider({ ...config, endpoint: credentialUrl.href }, [scope])
    ).toThrow('exact HTTPS');
  });

  it('requires an explicit scope and environment variable name', () => {
    expect(() => new GoogleEndpointTokenProvider(config, [])).toThrow('explicit scopes');
    expect(() => new GoogleEndpointTokenProvider(config, ['bad scope'])).toThrow('explicit scopes');
    expect(() => new GoogleEndpointTokenProvider(config, [''])).toThrow('explicit scopes');
    expect(
      () =>
        new GoogleEndpointTokenProvider(
          { ...config, authorizationEnvironmentVariable: 'BAD=NAME' },
          [scope]
        )
    ).toThrow('exact HTTPS');
  });

  it.each([undefined, '', 'value\r\nheader', 'x'.repeat(8193)])(
    'never calls the endpoint with missing or malformed authorization',
    async (authorization) => {
      vi.stubEnv(config.authorizationEnvironmentVariable, authorization);
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetcher);
      await expect(provider().getAccessToken()).rejects.toThrow('could not supply');
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([
    { expires_in: 0 },
    { expires_in: 3601 },
    { expires_in: 1.5 },
    { expires_in: '300' },
    { access_token: '' },
    { access_token: 'bad\r\nheader' },
    { token_type: 'Other' },
    { scope: `${scope} https://www.googleapis.com/auth/drive` },
    { scope: 'wrong' },
    { refresh_token: 'must-not-deliver-a-renewable-secret' },
  ])(
    'rejects malformed or overprivileged token responses without leaking fields',
    async (overrides) => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(tokenResponse(overrides)));
      await expect(provider().getAccessToken()).rejects.toThrow(
        /^Configured Google token endpoint could not supply an access token$/
      );
    }
  );

  it.each([
    (): Response => new Response('sensitive server details', { status: 500 }),
    (): Response =>
      new Response('sensitive redirect', {
        status: 302,
        headers: { location: 'https://other.example.com/' },
      }),
    (): Response => new Response('not json'),
    (): Response => new Response(null),
    (): Response => new Response('{}', { headers: { 'content-length': '16385' } }),
    (): Response => new Response('x'.repeat(16385)),
  ])('rejects unsuccessful, empty, invalid or oversized responses', async (response) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response()));
    await expect(provider().getAccessToken()).rejects.toThrow(
      /^Configured Google token endpoint could not supply an access token$/
    );
  });

  it('does not extend a token lifetime by response latency', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 10_000);
        return tokenResponse({ expires_in: 1 });
      })
    );
    await expect(provider().getAccessToken()).rejects.toThrow('could not supply');
  });

  it('bounds endpoint requests and sanitizes abort failures', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const aborted = AbortSignal.abort(new Error('synthetic-sensitive-transport-error'));
    timeout.mockReturnValue(aborted);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
        init?.signal?.throwIfAborted();
        return tokenResponse();
      })
    );
    await expect(provider().getAccessToken()).rejects.toThrow('could not supply');
    expect(timeout).toHaveBeenCalledWith(15_000);
    timeout.mockRestore();
  });
});
