import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleReadTransport } from './transport.js';
import type { GoogleReadResponse } from './transport.js';

afterEach(() => {
  vi.unstubAllGlobals();
});
const tokens = { getAccessToken: async (): Promise<string> => 'synthetic-token' };
const url = 'https://sheets.googleapis.com/v4/spreadsheets/synthetic';
describe('explicit Google read transport dependencies', () => {
  it('performs consumer pacing before timeout creation and still makes only one request', async () => {
    const order: string[] = [];
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      order.push('timeout');
      return new AbortController().signal;
    });
    try {
      const transport = new GoogleReadTransport(
        {
          getAccessToken: (): Promise<string> => {
            order.push('token');
            return Promise.resolve('synthetic');
          },
        },
        {
          beforeFetch: (): Promise<void> => {
            order.push('pace');
            return Promise.resolve();
          },
          fetchImpl: (): Promise<GoogleReadResponse> => {
            order.push('fetch');
            return Promise.resolve({
              ok: true,
              json: (): Promise<unknown> => Promise.resolve({ synthetic: true }),
            });
          },
        }
      );
      expect(await transport.request(url)).toEqual({ synthetic: true });
      expect(order).toEqual(['token', 'pace', 'timeout', 'fetch']);
    } finally {
      timeout.mockRestore();
    }
  });
  it.each(['AbortError', 'TimeoutError'])(
    'sanitizes plain %s provider failures without losing their classification',
    async (name) => {
      const failure = { name, privateDetail: 'synthetic private content' };
      const reject = (): Promise<never> => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- Synthetic provider can reject with a non-Error object; preserve its supported name without its payload.
        return Promise.reject(failure);
      };
      for (const fetchImpl of [
        reject,
        (): Promise<GoogleReadResponse> => Promise.resolve({ ok: true, json: reject }),
      ]) {
        const transport = new GoogleReadTransport(tokens, { fetchImpl });
        const result = transport.request(url);
        await expect(result).rejects.toMatchObject({ kind: 'transport', transient: true });
        await expect(result).rejects.not.toHaveProperty('privateDetail');
        await expect(result).rejects.not.toHaveProperty('cause');
      }
    }
  );
  it('accepts minimal injected HTTP responses without requiring irrelevant error bodies', async () => {
    const transport = new GoogleReadTransport(tokens, {
      readErrorDetails: false,
      fetchImpl: async (): Promise<GoogleReadResponse> => ({ ok: false, status: 429 }),
    });
    await expect(transport.request(url)).rejects.toMatchObject({
      status: 429,
      retryAfterMs: null,
      transient: true,
    });
    const missingBody = new GoogleReadTransport(tokens, {
      fetchImpl: async (): Promise<GoogleReadResponse> => ({ ok: true }),
    });
    await expect(missingBody.request(url)).rejects.toMatchObject({
      kind: 'transport',
      transient: true,
    });
    const noStatus = new GoogleReadTransport(tokens, {
      fetchImpl: async (): Promise<GoogleReadResponse> => ({ ok: false }),
    });
    await expect(noStatus.request(url)).rejects.toMatchObject({ status: null, transient: false });
  });
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
