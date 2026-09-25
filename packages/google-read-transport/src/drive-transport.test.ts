import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GoogleReadTransport,
  type GoogleJsonReader,
  type GoogleReadFetch,
  type GoogleResponseReader,
} from './index.js';

describe('shared Drive and Docs transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    'https://www.googleapis.com/drive/v3/about?fields=user',
    'https://www.googleapis.com/drive/v3/files?q=trashed%3Dfalse',
    'https://www.googleapis.com/drive/v3/files/abc?alt=media',
    'https://www.googleapis.com/drive/v3/files/abc/export?mimeType=application/pdf',
    'https://docs.googleapis.com/v1/documents/abc?includeTabsContent=true',
  ])('uses the same explicit token provider and returns complete bytes: %s', async (url) => {
    const bytes = Buffer.from([0, 255, 3, 127]);
    const original = new Response(bytes);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(original);
    vi.stubGlobal('fetch', fetcher);
    const transport = new GoogleReadTransport({
      getAccessToken: async (): Promise<string> => 'synthetic-token',
    });
    const reader: GoogleResponseReader = transport;
    const response = await reader.readResponse(url, 'abc/key');
    expect(response).toBe(original);
    expect(response.bodyUsed).toBe(false);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(fetcher.mock.calls[0]?.[0]).toBe(url);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: '*/*',
      Authorization: 'Bearer synthetic-token',
      'X-Goog-Drive-Resource-Keys': 'abc/key',
    });
  });
  it('preserves narrow JSON injection without pretending it supplies a binary response', async () => {
    const json = vi.fn(async (): Promise<unknown> => ({ spreadsheetId: 'synthetic' }));
    const fetchImpl = vi.fn<GoogleReadFetch>().mockResolvedValue({ ok: true, json });
    const transport = new GoogleReadTransport(
      { getAccessToken: async (): Promise<string> => 'synthetic-token' },
      { fetchImpl }
    );
    const reader: GoogleJsonReader = transport;
    await expect(
      reader.request('https://sheets.googleapis.com/v4/spreadsheets/synthetic')
    ).resolves.toEqual({ spreadsheetId: 'synthetic' });
    expect(json).toHaveBeenCalledTimes(1);
    await expect(
      transport.readResponse('https://www.googleapis.com/drive/v3/files/a')
    ).rejects.toMatchObject({ kind: 'invalid-response' });
    expect(json).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it.each([429, 503])('retains header-only HTTP %s metadata for raw reads', async (status) => {
    const json = vi.fn(async (): Promise<never> => {
      throw new Error('must not consume private error body');
    });
    const fetchImpl = vi.fn<GoogleReadFetch>().mockResolvedValue({
      ok: false,
      status,
      headers: new Headers({ 'Retry-After': '2.5' }),
      json,
    });
    const transport = new GoogleReadTransport(
      { getAccessToken: async (): Promise<string> => 'synthetic-token' },
      { fetchImpl, readErrorDetails: false }
    );
    await expect(
      transport.readResponse('https://www.googleapis.com/drive/v3/files/a')
    ).rejects.toMatchObject({ status, retryAfterMs: 2500, transient: true });
    expect(json).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([
    'https://www.googleapis.com/drive/v3/files/abc/permissions',
    'https://docs.googleapis.com/v1/documents/abc:batchUpdate',
    'https://evil.example/drive/v3/files/abc',
  ])('rejects non-read operations before acquiring credentials: %s', async (url) => {
    const tokens = { getAccessToken: vi.fn() };
    await expect(new GoogleReadTransport(tokens).readResponse(url)).rejects.toThrow();
    expect(tokens.getAccessToken).not.toHaveBeenCalled();
  });
  it('rejects header injection and POST on a Drive read route', async () => {
    const tokens = { getAccessToken: vi.fn() };
    const transport = new GoogleReadTransport(tokens);
    await expect(
      transport.readResponse('https://www.googleapis.com/drive/v3/files/a', 'a/b\r\nX: value')
    ).rejects.toThrow('resource key');
    await expect(
      transport.request('https://www.googleapis.com/drive/v3/files', {})
    ).rejects.toThrow('allowlist');
    expect(tokens.getAccessToken).not.toHaveBeenCalled();
  });
});
