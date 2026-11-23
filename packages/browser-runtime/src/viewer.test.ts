import { afterEach, describe, expect, it, vi } from 'vitest';

import { watchViewerDecision } from './viewer-renewal.js';
import {
  BrowserlessViewerClient,
  BrowserViewerError,
  type BrowserViewerReceipt,
} from './viewer.js';

const origin = 'https://browser.example';
const token = 'synthetic-viewer-test-value';
const browserId = 'synthetic-browser';
const liveURLId = 'synthetic-view';
const liveURL = `${origin}/live/index.html?i=${liveURLId}&t=900000`;
const signal = (): AbortSignal => new AbortController().signal;
const config = { origin, token, maximumSessionDurationMs: 900_000 };
const client = (): BrowserlessViewerClient => new BrowserlessViewerClient(config);
const openStatus = {
  status: 'open',
  reason: null,
  interactable: false,
  viewerCount: 1,
  expiresAt: 1_000_000,
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('documented watch-only viewer transport', () => {
  it('posts one exact owned browser with server-enforced watch-only settings', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ liveURL, liveURLId }));
    vi.stubGlobal('fetch', request);
    expect(await client().createWatchViewer(browserId, 9_000_000, signal())).toEqual({
      browserId,
      liveURLId,
      liveURL,
      notAfter: 901_000,
    });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] ?? [];
    expect(url).toEqual(new URL(`${origin}/browser/${browserId}/live?token=${token}`));
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
    expect(options?.body).toBe(
      JSON.stringify({
        interactable: false,
        resizable: false,
        showBrowserInterface: true,
        timeout: 900_000,
        type: 'jpeg',
        quality: 70,
      })
    );
  });

  it('caps the request to remaining authorization and retains a known late receipt', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(50_000);
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ liveURL, liveURLId }));
    vi.stubGlobal('fetch', request);
    expect((await client().createWatchViewer(browserId, 2000, signal())).notAfter).toBe(2000);
    expect(request.mock.calls[0]?.[1]?.body).toContain('"timeout":1000');
  });

  it('honors a separately verified short provider-plan limit', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ liveURL, liveURLId }));
    vi.stubGlobal('fetch', request);
    await new BrowserlessViewerClient({
      ...config,
      maximumSessionDurationMs: 120_000,
    }).createWatchViewer(browserId, Date.now() + 900_000, signal());
    expect(request.mock.calls[0]?.[1]?.body).toContain('"timeout":120000');
  });

  it.each([0, NaN, Infinity, -1, 0.5])('rejects an invalid provider duration', (duration) => {
    expect(
      () => new BrowserlessViewerClient({ ...config, maximumSessionDurationMs: duration })
    ).toThrow('invalid_binding');
  });

  it.each([0, NaN, Infinity, -1, 0.5])(
    'refuses invalid or ended authority %s before I/O',
    async (end) => {
      const request = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', request);
      await expect(client().createWatchViewer(browserId, end, signal())).rejects.toMatchObject({
        code: 'authorization_ended',
      });
      expect(request).not.toHaveBeenCalled();
    }
  );

  it.each([
    'http://browser.example',
    'https://browser.example/',
    'https://browser.example?token=x',
    'bad',
  ])('rejects invalid configuration %s', (value) => {
    expect(() => new BrowserlessViewerClient({ ...config, origin: value })).toThrow(
      BrowserViewerError
    );
  });

  it.each(['', 'has whitespace', 'x'.repeat(8193)])('rejects malformed token', (value) => {
    expect(() => new BrowserlessViewerClient({ ...config, token: value })).toThrow(
      'invalid_binding'
    );
  });

  it('rejects foreign routing identifiers and cancelled requests without dispatch', async () => {
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', request);
    await expect(client().status('../other', liveURLId, signal())).rejects.toThrow(
      'invalid_binding'
    );
    await expect(client().close(browserId, 'bad/query', signal())).rejects.toThrow(
      'invalid_binding'
    );
    const cancelled = AbortSignal.abort(new Error('private abort detail'));
    await expect(client().status(browserId, liveURLId, cancelled)).rejects.toThrow('cancelled');
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    `${origin}/other?i=${liveURLId}`,
    `https://different.example/live/index.html?i=${liveURLId}`,
    `${origin}/live/index.html?i=different`,
    `${origin}/live/index.html?i=${liveURLId}&i=${liveURLId}`,
    `${liveURL}&token=unexpected`,
    `${liveURL}&x=${token}`,
    `${liveURL}&x=${token.replace('synthetic', '%73ynthetic')}`,
    `${liveURL}#fragment`,
    `https://user:pass@browser.example/live/index.html?i=${liveURLId}`,
    'not a URL',
  ])('rejects malformed/cross-origin/credential-bearing viewer responses', async (value) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ liveURL: value, liveURLId }));
    vi.stubGlobal('fetch', request);
    const result = client().createWatchViewer(browserId, Date.now() + 500_000, signal());
    await expect(result).rejects.toThrow('dispatch_uncertain');
    await expect(result).rejects.not.toThrow(token);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reads only the exact viewer and preserves end reasons rather than inventing completion', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...openStatus,
        status: 'closed',
        reason: 'userFailed',
        ignoredPrivateField: 'not projected',
      })
    );
    vi.stubGlobal('fetch', request);
    expect(await client().status(browserId, liveURLId, signal())).toEqual({
      ...openStatus,
      status: 'closed',
      reason: 'userFailed',
    });
    expect(request.mock.calls[0]?.[0]).toEqual(
      new URL(`${origin}/browser/${browserId}/live/${liveURLId}?token=${token}`)
    );
  });

  it('requires the documented close acknowledgement', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('private provider body', { status: 404 }))
      .mockResolvedValueOnce(Response.json({ unexpected: true }));
    vi.stubGlobal('fetch', request);
    await expect(client().close(browserId, liveURLId, signal())).resolves.toBeUndefined();
    await expect(client().close(browserId, liveURLId, signal())).rejects.toThrow('unavailable');
    await expect(client().close(browserId, liveURLId, signal())).rejects.toThrow(
      'dispatch_uncertain'
    );
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('rejects an unexpectedly redirected response without following its routing', async () => {
    const response = Response.json({ liveURL, liveURLId });
    Object.defineProperty(response, 'redirected', { value: true });
    const request = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', request);
    await expect(
      client().createWatchViewer(browserId, Date.now() + 500_000, signal())
    ).rejects.toThrow('dispatch_uncertain');
    expect(response.bodyUsed).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'request_rejected'],
    [401, 'access_rejected'],
    [403, 'access_rejected'],
    [404, 'unavailable'],
    [429, 'request_rejected'],
    [500, 'dispatch_uncertain'],
  ])('sanitizes HTTP %s without replay', async (status, code) => {
    if (typeof status !== 'number') throw new Error('Invalid fixture');
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(token, { status }));
    vi.stubGlobal('fetch', request);
    await expect(
      client().createWatchViewer(browserId, Date.now() + 500_000, signal())
    ).rejects.toMatchObject({
      code,
      message: `Browser viewer: ${code}`,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('bounds and validates response bodies without exposing content', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('x'.repeat(16_385)))
      .mockResolvedValueOnce(new Response('{}', { headers: { 'content-length': '16385' } }))
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(new Response('invalid JSON'))
      .mockResolvedValueOnce(Response.json({ liveURLId }))
      .mockResolvedValueOnce(Response.json({ ...openStatus, expiresAt: 'not-a-timestamp' }));
    vi.stubGlobal('fetch', request);
    for (let index = 0; index < 5; index++) {
      await expect(
        client().createWatchViewer(browserId, Date.now() + 500_000, signal())
      ).rejects.toThrow('dispatch_uncertain');
    }
    await expect(client().status(browserId, liveURLId, signal())).rejects.toThrow('read_failed');
  });

  it('waits for actual request settlement after cancellation, retaining uncertain mutation semantics', async () => {
    const controller = new AbortController();
    let finish: (() => void) | undefined;
    let aborted = false;
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            aborted = true;
          });
          finish = (): void => {
            reject(new Error(`private transport ${token}`));
          };
        })
    );
    vi.stubGlobal('fetch', request);
    let settled = false;
    const promise = client().createWatchViewer(browserId, Date.now() + 500_000, controller.signal);
    const observed = promise.catch((error: unknown) => {
      settled = true;
      return error;
    });
    controller.abort();
    await Promise.resolve();
    expect(aborted).toBe(true);
    expect(settled).toBe(false);
    if (!finish) throw new Error('Request was not started');
    finish();
    expect(await observed).toMatchObject({ code: 'dispatch_uncertain' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('composes the caller signal with the documented transport budget', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('transport detail'));
    vi.stubGlobal('fetch', request);
    await expect(client().status(browserId, liveURLId, signal())).rejects.toThrow('read_failed');
    expect(request.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(15_000);
  });
});

describe('watch link renewal scheduling', () => {
  const receipt: BrowserViewerReceipt = { browserId, liveURLId, liveURL, notAfter: 1_000_000 };
  const input = {
    browserId,
    receipt,
    status: openStatus,
    now: 1_000,
    authorizationNotAfter: 2_000_000,
    stopped: false,
    dispatchUncertain: false,
  };
  it('keeps a healthy link and renews before the earlier receipt/provider expiry', () => {
    expect(watchViewerDecision(input)).toBe('keep');
    expect(watchViewerDecision({ ...input, now: 940_000 })).toBe('renew');
    expect(watchViewerDecision({ ...input, status: { ...openStatus, expiresAt: 2_000 } })).toBe(
      'renew'
    );
    expect(
      watchViewerDecision({
        ...input,
        status: { ...openStatus, status: 'expired', reason: 'timeout' },
      })
    ).toBe('renew');
    expect(watchViewerDecision({ ...input, now: 940_000, authorizationNotAfter: 1_000_000 })).toBe(
      'keep'
    );
  });
  it.each([
    { stopped: true },
    { dispatchUncertain: true },
    { browserId: 'other-browser' },
    { status: { ...openStatus, interactable: true } },
    { now: NaN },
    { authorizationNotAfter: NaN },
    { authorizationNotAfter: 1_000 },
    { receipt: { ...receipt, notAfter: NaN } },
    { status: { ...openStatus, expiresAt: NaN } },
    { status: { ...openStatus, status: 'closed', reason: 'closed' } },
  ] as const)('withholds on lost authority or correlation instead of renewing', (change) => {
    expect(watchViewerDecision({ ...input, ...change })).toBe('withhold');
  });
});
