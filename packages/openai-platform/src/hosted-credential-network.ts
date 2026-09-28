import { isIP } from 'node:net';

import { z } from 'zod';

const exactHostname = z.hostname().refine((domain) => {
  if (!domain.includes('.') || domain.includes('*') || domain.endsWith('.')) return false;
  // URL normalization recognizes abbreviated, octal and hexadecimal IPv4 literals too.
  try {
    return isIP(new URL(`https://${domain}`).hostname) === 0;
  } catch {
    return false;
  }
});

/** Shared by credential files and renewable runtime bindings. This limits destinations, not
 * operations on an allowed provider; it is not a complete exfiltration-prevention boundary.
 */
export function exactCredentialHosts(network: unknown): string[] {
  return z
    .object({ access: z.literal('restricted'), allowed_domains: z.array(exactHostname).min(1) })
    .parse(network).allowed_domains;
}
