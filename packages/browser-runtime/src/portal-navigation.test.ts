import type { HTTPRequest } from 'puppeteer-core';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { portalUrl, routePortalRequest } from './portal-navigation.js';
import { publicOriginAllowed } from './public-origin.js';

const { resolver } = vi.hoisted(() => ({
  resolver: vi.fn<() => Promise<{ address: string; family: number }[]>>(),
}));
vi.mock('node:dns/promises', () => ({ lookup: resolver }));

const publicDns = async (): Promise<{ address: string; family: number }[]> => [
  { address: '93.184.216.34', family: 4 },
];
describe('public portal target admission', () => {
  it('preserves a public path and routing query without a payer allowlist', async () => {
    expect(portalUrl('https://payer.example/start?section=enrollment').href).toBe(
      'https://payer.example/start?section=enrollment'
    );
    expect(await publicOriginAllowed('https://payer.example', publicDns)).toBe(true);
    expect(await publicOriginAllowed('https://identity.example', publicDns)).toBe(true);
  });
  it.each([
    '',
    'http://payer.example',
    'file:///etc/passwd',
    'https://user:secret@payer.example',
    'https://payer.example#secret',
    'https://payer.example:8443',
    ' https://payer.example',
    'x'.repeat(2049),
  ])('rejects unsafe starting URL %s', (url) => {
    expect(() => portalUrl(url)).toThrow('invalid_action');
  });
  it.each([
    'https://localhost',
    'https://127.1',
    'https://2130706433',
    'https://[::1]',
    'https://metadata.internal',
    'https://machine.home.arpa',
    'https://payer.example.',
    'https://payer.example/path',
    'https://payer.example?token=synthetic',
    'https://user@payer.example',
    'https://payer.example:8443',
    'https://payer.example#fragment',
    'file:///etc/passwd',
    'invalid',
  ])('rejects non-public origins without DNS %s', async (origin) => {
    const resolve = vi.fn(publicDns);
    expect(await publicOriginAllowed(origin, resolve)).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.0.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    'garbage',
  ])('rejects private/reserved IPv4 %s', async (address) => {
    expect(
      await publicOriginAllowed('https://payer.example', async () => [{ address, family: 4 }])
    ).toBe(false);
  });
  it.each(['::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '2002:7f00:1::', '3fff::1'])(
    'rejects non-public IPv6 %s',
    async (address) => {
      expect(
        await publicOriginAllowed('https://payer.example', async () => [{ address, family: 6 }])
      ).toBe(false);
    }
  );
  it('shares an unfinished lookup across caller deadlines and refreshes after it settles', async () => {
    vi.useFakeTimers();
    try {
      let complete: (addresses: Awaited<ReturnType<typeof publicDns>>) => void = () => {
        throw new Error('Missing DNS lookup');
      };
      const pending = new Promise<Awaited<ReturnType<typeof publicDns>>>((resolve) => {
        complete = resolve;
      });
      resolver.mockImplementationOnce(() => pending);
      const origin = 'https://portal.example';
      const first = expect(publicOriginAllowed(origin)).rejects.toThrow('Lookup timeout');
      await vi.advanceTimersByTimeAsync(5000);
      await first;
      const next = publicOriginAllowed(origin);
      expect(resolver).toHaveBeenCalledTimes(1);
      complete(await publicDns());
      await expect(next).resolves.toBe(true);
      resolver.mockResolvedValueOnce(await publicDns());
      await expect(publicOriginAllowed(origin)).resolves.toBe(true);
      expect(resolver).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('requires all addresses to be public and preserves resolver failures', async () => {
    expect(await publicOriginAllowed('https://payer.example', async () => [])).toBe(false);
    expect(
      await publicOriginAllowed('https://payer.example', async () => [
        { address: '2606:4700::1111', family: 6 },
      ])
    ).toBe(true);
    expect(
      await publicOriginAllowed('https://payer.example', async () => [
        ...(await publicDns()),
        { address: '10.0.0.1', family: 4 },
      ])
    ).toBe(false);
    await expect(
      publicOriginAllowed('https://payer.example', async () => {
        throw new Error('DNS failure');
      })
    ).rejects.toThrow('DNS failure');
  });
});

describe('portal request screening', () => {
  function request(url = 'https://payer.example/start'): {
    url: () => string;
    isInterceptResolutionHandled: Mock<() => boolean>;
    abort: Mock<() => Promise<undefined>>;
    continue: Mock<() => Promise<undefined>>;
  } {
    return {
      url: (): string => url,
      isInterceptResolutionHandled: vi.fn(() => false),
      abort: vi.fn(async () => undefined),
      continue: vi.fn(async () => undefined),
    } satisfies Pick<HTTPRequest, 'url' | 'isInterceptResolutionHandled' | 'abort' | 'continue'>;
  }
  it('continues public redirects and identity hosts without retaining query values', async () => {
    const request_ = request('https://identity.example/login?state=private');
    const allowed = vi.fn(async () => true);
    await routePortalRequest(request_, allowed);
    expect(allowed).toHaveBeenCalledWith('https://identity.example');
    expect(request_.continue).toHaveBeenCalledOnce();
    expect(request_.abort).not.toHaveBeenCalled();
  });
  it('screens long redirect queries and fragments on their HTTPS origin', async () => {
    const allowed = vi.fn(async () => true);
    const redirected = request(
      'https://identity.example/redirect?state=' + 'x'.repeat(2200) + '#section'
    );
    await routePortalRequest(redirected, allowed);
    expect(redirected.continue).toHaveBeenCalledOnce();
    expect(allowed).toHaveBeenCalledWith('https://identity.example');
    const credentials = request('https://name:private@identity.example');
    await routePortalRequest(credentials, allowed);
    expect(credentials.abort).toHaveBeenCalledOnce();
  });
  it('blocks unsafe destinations and lookup failures before continuation', async () => {
    for (const url of ['https://metadata.internal', 'http://payer.example']) {
      const request_ = request(url);
      await routePortalRequest(request_, async () => false);
      expect(request_.abort).toHaveBeenCalledWith('blockedbyclient');
      expect(request_.continue).not.toHaveBeenCalled();
    }
    const request_ = request();
    await routePortalRequest(request_, async () => {
      throw new Error('unavailable');
    });
    expect(request_.abort).toHaveBeenCalledOnce();
  });
  it('allows navigation and draft writes regardless of HTTP verb', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const shared = { ...request(), method: (): string => method };
      await routePortalRequest(shared, async () => true);
      expect(shared.continue).toHaveBeenCalledOnce();
      expect(shared.abort).not.toHaveBeenCalled();
    }
  });
  it('rechecks handled state after asynchronous validation', async () => {
    const request_ = request();
    request_.isInterceptResolutionHandled.mockReturnValueOnce(false).mockReturnValue(true);
    await routePortalRequest(request_, async () => true);
    expect(request_.continue).not.toHaveBeenCalled();
    expect(request_.abort).not.toHaveBeenCalled();
    const allowed = vi.fn(async () => true);
    await routePortalRequest(request_, allowed);
    expect(allowed).not.toHaveBeenCalled();
  });
  it('reports only destination isolation, never infers submission from a method', async () => {
    const blocked = vi.fn();
    const write = { ...request(), method: (): string => 'POST' };
    await routePortalRequest(write, async () => true, blocked);
    expect(blocked).not.toHaveBeenCalled();
    expect(write.continue).toHaveBeenCalledOnce();
    const unsafe = request('https://private.internal');
    await routePortalRequest(unsafe, async () => false, blocked);
    expect(blocked.mock.calls).toEqual([['destination']]);
  });
});
