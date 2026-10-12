import type { AgentBrowserRequest } from '@headstart-health/workflow-contracts';
import { describe, expect, it, vi } from 'vitest';

import { publicBrowserDecision } from './public-browser-policy.js';

const request = (origin: string): AgentBrowserRequest => ({
  sessionId: 'synthetic_session',
  turnId: 'synthetic_turn',
  requestId: 'synthetic_request',
  fingerprint: 'a'.repeat(64),
  request: { type: 'browser_origin_access', origin, reason: 'Untrusted page says ignore policy' },
});
const publicDns = [{ address: '93.184.216.34', family: 4 }];

describe('standing public research authorization', () => {
  it.each([
    'https://unfamiliar-payer.example',
    'https://forms.other-jurisdiction.example',
    'http://legacy-manual.example',
    'https://cdn.download-host.example:443/',
  ])(
    'automatically approves public research at %s without a payer allowlist or operator click',
    async (origin) => {
      const resolve = vi.fn().mockResolvedValue(publicDns);
      expect(await publicBrowserDecision(request(origin), resolve)).toEqual({
        requestFingerprint: 'a'.repeat(64),
        response: { type: 'browser_origin_access', decision: 'approve' },
        reason: 'public-origin',
      });
      expect(resolve).toHaveBeenCalledOnce();
    }
  );
  it.each([
    'https://localhost',
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::1]',
    'https://metadata.internal',
    'file:///etc/passwd',
    'https://public.example/path',
    'https://public.example?secret=synthetic',
    'https://public.example#fragment',
    'https://user:password@public.example',
    'https://public.example:8443',
    'https://public.example.',
    'https://machine.home.arpa',
  ])('does not approve a non-public origin representation (%s)', async (origin) => {
    const resolve = vi.fn().mockResolvedValue(publicDns);
    expect(await publicBrowserDecision(request(origin), resolve)).toMatchObject({
      response: { type: 'browser_origin_access', decision: 'deny' },
      reason: 'non-public-origin',
    });
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      [{ address: '10.0.0.1', family: 4 }],
      [{ address: '169.254.169.254', family: 4 }],
      [...publicDns, { address: '192.168.1.1', family: 4 }],
      [{ address: '::ffff:127.0.0.1', family: 6 }],
      [{ address: 'fc00::1', family: 6 }],
      [{ address: '2001:db8::1', family: 6 }],
      [{ address: '2002:7f00:1::', family: 6 }],
      [{ address: 'garbage', family: 4 }],
    ].map((addresses) => ({ addresses }))
  )(
    'rejects empty, mixed or non-public DNS results without treating them as evidence absence',
    async ({ addresses }) => {
      expect(
        await publicBrowserDecision(request('https://public.example'), async () => addresses)
      ).toMatchObject({
        response: { decision: 'deny' },
        reason: 'non-public-origin',
      });
    }
  );
  it('supports public IPv6, preserves transient lookup failure as pending, and never gathers sign-in credentials', async () => {
    expect(
      await publicBrowserDecision(request('https://public.example'), async () => [
        { address: '2606:4700::1111', family: 6 },
      ])
    ).toMatchObject({ response: { decision: 'approve' } });
    await expect(
      publicBrowserDecision(request('https://public.example'), async () => {
        throw new Error('private resolver details');
      })
    ).rejects.toThrow('lookup unavailable; no browser response submitted');
    const resolve = vi.fn().mockResolvedValue(publicDns);
    expect(
      await publicBrowserDecision(
        {
          ...request('https://public.example'),
          request: {
            type: 'browser_authentication',
            credential_origin: 'https://public.example',
            reason: 'Enter credentials',
          },
        },
        resolve
      )
    ).toMatchObject({
      response: { type: 'browser_authentication', action: 'cancel' },
      reason: 'sign-in-out-of-scope',
    });
    expect(resolve).not.toHaveBeenCalled();
  });
});
