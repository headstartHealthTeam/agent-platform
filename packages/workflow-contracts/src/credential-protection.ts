import { createHash } from 'node:crypto';

/** Non-secret, launch-bound evidence. Retain before dispatch and preserve through rotation. */
export interface AgentCredentialProtection {
  contentSha256: string[];
}

export function credentialContentSha256(value: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

const privateKeyMarker = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/;

/** Exact credential copies and unambiguous private keys, not a business-data redactor.
 * Encoded/transformed/excerpted secrets are not exhaustively detectable by this guard.
 */
export function containsCredentialBytes(
  value: Uint8Array | string,
  protection?: AgentCredentialProtection
): boolean {
  return (
    protection?.contentSha256.includes(credentialContentSha256(value)) === true ||
    privateKeyMarker.test(typeof value === 'string' ? value : Buffer.from(value).toString('utf8'))
  );
}

function protectedString(value: string, protection?: AgentCredentialProtection): boolean {
  if (containsCredentialBytes(value, protection)) return true;
  // Recognize one canonical base64 wrapper, as used by file/function transports. Do not treat
  // arbitrary prose or recursively transformed model output as an encoding protocol.
  if (value.length < 16 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64') === value && containsCredentialBytes(decoded, protection);
}

/** Inspect structured function input/output before it reaches application persistence.
 * Iteration avoids recursion limits; cycles are visited once. Property names are included.
 */
export function containsCredentialMaterial(
  value: unknown,
  protection?: AgentCredentialProtection
): boolean {
  const pending: unknown[] = [value];
  const seen = new WeakSet();
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string' && protectedString(current, protection)) return true;
    if (typeof current !== 'object' || current === null || seen.has(current)) continue;
    seen.add(current);
    if (current instanceof Uint8Array) {
      if (containsCredentialBytes(current, protection)) return true;
    } else {
      for (const [key, entry] of Object.entries(current)) pending.push(key, entry);
    }
  }
  return false;
}
