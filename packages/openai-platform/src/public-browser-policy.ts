import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import type {
  AgentBrowserRequest,
  AgentPublicBrowserDecision,
} from '@headstart-health/workflow-contracts';

type ResolveHost = (hostname: string) => Promise<{ address: string; family: number }[]>;
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  blocked.addSubnet(address, prefix, 'ipv6');

function publicAddress(address: string, family: number): boolean {
  if (family === 4 && isIP(address) === 4) return !blocked.check(address, 'ipv4');
  return (
    family === 6 &&
    isIP(address) === 6 &&
    globalV6.check(address, 'ipv6') &&
    !blocked.check(address, 'ipv6')
  );
}

function publicHostname(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      url.hostname.endsWith('.') ||
      !url.hostname.includes('.') ||
      url.hostname.startsWith('[') ||
      isIP(url.hostname) !== 0 ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|onion)$/.test(url.hostname) ||
      url.hostname.endsWith('.home.arpa')
    )
      return null;
    return url.hostname;
  } catch {
    return null;
  }
}

async function resolvePublicHost(hostname: string): Promise<Awaited<ReturnType<ResolveHost>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Lookup timeout'));
        }, 5000);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** No payer/domain allowlist or Ops click. This screens an origin-access handshake, NOT HTTP
 * methods, website actions or DNS rebinding in the provider browser. The separately isolated
 * credential-free environment is essential; this function is not an egress firewall.
 */
export async function publicBrowserDecision(
  request: AgentBrowserRequest,
  resolve: ResolveHost = resolvePublicHost
): Promise<AgentPublicBrowserDecision> {
  if (request.request.type === 'browser_authentication')
    return {
      requestFingerprint: request.fingerprint,
      response: { type: 'browser_authentication', action: 'cancel' },
      reason: 'sign-in-out-of-scope',
    };
  const hostname = publicHostname(request.request.origin);
  let allowed = false;
  if (hostname !== null) {
    let addresses: Awaited<ReturnType<ResolveHost>>;
    try {
      addresses = await resolve(hostname);
    } catch {
      // Keep the original request pending. A transient DNS failure is not an Ops question.
      throw new Error('Public-origin lookup unavailable; no browser response submitted.');
    }
    allowed =
      addresses.length > 0 && addresses.every((item) => publicAddress(item.address, item.family));
  }
  return {
    requestFingerprint: request.fingerprint,
    response: { type: 'browser_origin_access', decision: allowed ? 'approve' : 'deny' },
    reason: allowed ? 'public-origin' : 'non-public-origin',
  };
}
