import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleReadTransport } from './transport.js';

afterEach(() => {
  vi.unstubAllGlobals();
});
const tokens = { getAccessToken: async (): Promise<string> => 'synthetic-token' };
const url = 'https://sheets.googleapis.com/v4/spreadsheets/synthetic';
describe('explicit Google read transport dependencies', () => {
  it('uses the injected fetch and clock without reading failure bodies or adding retries', async () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const response = new Response('synthetic private error body', {
      status: 429,
      headers: { 'retry-after': new Date(now + 3000).toUTCString() },
    });
    const json = vi.spyOn(response, 'json');
    const fetchImpl = vi.fn(async () => response),
      globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const transport = new GoogleReadTransport(tokens, {
      fetchImpl,
      now: (): number => now,
      readErrorDetails: false,
    });
    await expect(transport.request(url)).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 3000,
      transient: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
  it('retains normal body decoding, default error details and read-only allowlisting', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ spreadsheetId: 'synthetic' }))
    );
    const transport = new GoogleReadTransport(tokens, { fetchImpl });
    expect(await transport.request(url)).toEqual({ spreadsheetId: 'synthetic' });
    await expect(transport.request(`${url}:batchUpdate`, { requests: [] })).rejects.toThrow(
      'read allowlist'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 })
    );
    await expect(transport.request(url)).rejects.toThrow('PERMISSION_DENIED');
  });
});
