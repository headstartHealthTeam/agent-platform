import { describe, expect, it } from 'vitest';

import {
  containsCredentialBytes,
  containsCredentialMaterial,
  credentialContentSha256,
} from './credential-protection.js';

const credential = '{"refresh_token":"synthetic-credential-content"}';
const policy = { contentSha256: [credentialContentSha256(credential)] };
const marker = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');

describe('credential material boundary', () => {
  it('detects exact bytes and nested strings without retaining the secret in its policy', () => {
    expect(containsCredentialBytes(Buffer.from(credential), policy)).toBe(true);
    expect(containsCredentialMaterial({ input: [{ note: credential }] }, policy)).toBe(true);
    expect(containsCredentialMaterial({ [credential]: 'label' }, policy)).toBe(true);
    expect(JSON.stringify(policy)).not.toContain('synthetic-credential-content');
    expect(policy.contentSha256[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it('detects raw, structured, and standard base64 private-key material', () => {
    for (const value of [marker, JSON.stringify({ private_key: `${marker}\nsynthetic` })]) {
      expect(containsCredentialMaterial({ nested: [value] })).toBe(true);
      expect(containsCredentialMaterial(Buffer.from(value))).toBe(true);
      expect(containsCredentialMaterial({ data: Buffer.from(value).toString('base64') })).toBe(
        true
      );
    }
    expect(containsCredentialMaterial(Buffer.from(credential).toString('base64'), policy)).toBe(
      true
    );
  });
  it('does not redact ordinary complete business evidence or public-key material', () => {
    const evidence = {
      note: 'Provider is risk-based; private_key is the field name, not a private key.',
      publicKey: '-----BEGIN PUBLIC KEY-----',
      number: 123,
      missing: null,
      bytes: Buffer.from('complete original evidence'),
      encoding: Buffer.from('ordinary encoded evidence').toString('base64'),
    };
    expect(containsCredentialMaterial(evidence, policy)).toBe(false);
    expect(containsCredentialBytes(Buffer.from('ordinary evidence'), policy)).toBe(false);
  });
  it('handles deeply nested and cyclic structured values without recursion', () => {
    const root: Record<string, unknown> = {};
    let current = root;
    for (let index = 0; index < 20_000; index++) {
      const child: Record<string, unknown> = {};
      current['next'] = child;
      current = child;
    }
    current['cycle'] = root;
    expect(containsCredentialMaterial(root, policy)).toBe(false);
    current['secret'] = credential;
    expect(containsCredentialMaterial(root, policy)).toBe(true);
  });
});
