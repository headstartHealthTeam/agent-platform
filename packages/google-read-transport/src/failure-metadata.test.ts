import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleReadError, GoogleReadTransport } from './transport.js';

const URL = 'https://sheets.googleapis.com/v4/spreadsheets/synthetic';
const transport = new GoogleReadTransport({
  getAccessToken: async (): Promise<string> => 'synthetic-token',
});

describe('Google read failure metadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    [401, 'authentication', false],
    [403, 'permission', false],
    [404, 'http', false],
    [429, 'rate-limit', true],
    [500, 'server', true],
    [503, 'server', true],
  ])('classifies HTTP %s without retrying or exposing a body', async (status, kind, transient) => {
    const fetcher = vi.fn(async () => new Response('private response body', { status }));
    vi.stubGlobal('fetch', fetcher);
    await expect(transport.request(URL)).rejects.toMatchObject({
      name: 'GoogleReadError',
      status,
      kind,
      transient,
      retryAfterMs: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(transport.request(URL)).rejects.not.toThrow('private response body');
  });

  it.each([
    ['0', 0],
    ['2.1251', 2126],
    [' 3 ', 3000],
    ['120', 120000],
    ['Wed, 23 Sep 2026 12:00:08 GMT', 8000],
    ['Wed, 23 Sep 2026 11:59:59 GMT', null],
    ['', null],
    ['invalid', null],
    ['9'.repeat(400), null],
  ])('preserves Retry-After %s without imposing workflow wait policy', async (header, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('{}', {
          status: 429,
          headers: { 'retry-after': header },
        })
    );
    await expect(transport.request(URL)).rejects.toMatchObject({ retryAfterMs: expected });
  });

  it.each([
    new TypeError('private network details'),
    new DOMException('private timeout details', 'TimeoutError'),
    new DOMException('private cancellation details', 'AbortError'),
  ])('classifies transient network failures without retaining their cause', async (failure) => {
    vi.stubGlobal('fetch', async () => {
      throw failure;
    });
    await expect(transport.request(URL)).rejects.toMatchObject({
      kind: 'transport',
      status: null,
      retryAfterMs: null,
      transient: true,
    });
    await expect(transport.request(URL)).rejects.not.toHaveProperty('cause');
  });

  it('does not turn an arbitrary failure or invalid JSON into retry permission', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('private implementation detail');
    });
    await expect(transport.request(URL)).rejects.toMatchObject({
      kind: 'transport',
      transient: false,
    });
    vi.stubGlobal('fetch', async () => new Response('invalid'));
    await expect(transport.request(URL)).rejects.toMatchObject({
      kind: 'invalid-response',
      transient: false,
    });
    expect(new GoogleReadError('compatibility')).toMatchObject({
      status: null,
      retryAfterMs: null,
      transient: false,
    });
  });

  it.each([
    new TypeError('private reset while reading'),
    new DOMException('private aborted body', 'AbortError'),
    new DOMException('private timed out body', 'TimeoutError'),
  ])('preserves transient body-consumption failures after successful headers', async (failure) => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller): void {
              controller.error(failure);
            },
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(transport.request(URL)).rejects.toMatchObject({
      name: 'GoogleReadError',
      kind: 'transport',
      transient: true,
      status: null,
      retryAfterMs: null,
      message: 'Google response body could not be read',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps malformed body JSON non-transient with exactly one fetch', async () => {
    const fetcher = vi.fn(async () => new Response('{private invalid JSON', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(transport.request(URL)).rejects.toMatchObject({
      name: 'GoogleReadError',
      kind: 'invalid-response',
      transient: false,
      message: 'Google returned invalid JSON',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
