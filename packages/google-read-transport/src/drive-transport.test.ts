import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleReadTransport } from './transport.js';

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
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
    vi.stubGlobal('fetch', fetcher);
    const transport = new GoogleReadTransport({
      getAccessToken: async (): Promise<string> => 'synthetic-token',
    });
    expect(Buffer.from(await (await transport.readResponse(url, 'abc/key')).arrayBuffer())).toEqual(
      bytes
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(url);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: '*/*',
      Authorization: 'Bearer synthetic-token',
      'X-Goog-Drive-Resource-Keys': 'abc/key',
    });
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
