import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

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

async function lookupPublicHost(hostname: string): Promise<Awaited<ReturnType<ResolveHost>>> {
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

const inFlightLookups = new Map<string, ReturnType<ResolveHost>>();
function resolvePublicHost(hostname: string): ReturnType<ResolveHost> {
  let lookup = inFlightLookups.get(hostname);
  if (!lookup) {
    lookup = lookupPublicHost(hostname).finally(() => {
      inFlightLookups.delete(hostname);
    });
    inFlightLookups.set(hostname, lookup);
  }
  return lookup;
}

/** Public-origin screening shared by research and supervised browser navigation.
 * This is not a provider egress firewall or protection against remote DNS rebinding.
 */
export async function publicOriginAllowed(
  origin: string,
  resolve: ResolveHost = resolvePublicHost
): Promise<boolean> {
  const hostname = publicHostname(origin);
  if (hostname === null) return false;
  const addresses = await resolve(hostname);
  return (
    addresses.length > 0 && addresses.every((item) => publicAddress(item.address, item.family))
  );
}
