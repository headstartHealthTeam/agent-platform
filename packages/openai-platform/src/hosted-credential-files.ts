import { isIP } from 'node:net';
import { posix } from 'node:path';

import type { AgentHostedCredentialFile } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Action } from './operations.js';

const privatePath = z
  .string()
  .max(1024)
  .refine(
    (path) =>
      path.startsWith('/workspace/') &&
      posix.normalize(path) === path &&
      !path.endsWith('/') &&
      !/[\\\p{Cc}]/u.test(path) &&
      path !== '/workspace/outputs' &&
      !path.startsWith('/workspace/outputs/')
  );
export const credentialFilePaths = z.array(privatePath).max(50);
const filesSchema = z
  .array(z.object({ path: privatePath, content: z.string().min(1) }).strict())
  .max(50);
const exactHostname = z.hostname().refine((domain) => {
  if (!domain.includes('.') || domain.includes('*') || domain.endsWith('.')) return false;
  // URL normalization also recognizes abbreviated, octal and hexadecimal IPv4 literals.
  try {
    return isIP(new URL(`https://${domain}`).hostname) === 0;
  } catch {
    return false;
  }
});

function persistentGoogleCredential(content: string): boolean {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) return true;
  try {
    const value: unknown = JSON.parse(content);
    if (value === null || typeof value !== 'object') return false;
    return (
      'private_key' in value ||
      'refresh_token' in value ||
      ('type' in value && ['service_account', 'authorized_user'].includes(String(value.type)))
    );
  } catch {
    return false;
  }
}

/** Secrets join the SDK request only at the execution boundary; profiles declare paths only. */
export function bindHostedCredentialFiles(
  action: Extract<Action, { operation: 'sessions.create' }>,
  paths: string[] | undefined,
  files: readonly AgentHostedCredentialFile[] | undefined
): void {
  if (!paths?.length && !files?.length) return;
  const provided = filesSchema.safeParse(files);
  if (
    !provided.success ||
    !paths?.length ||
    new Set(paths).size !== paths.length ||
    provided.data.length !== paths.length ||
    new Set(provided.data.map((file) => file.path)).size !== paths.length ||
    provided.data.some((file) => !paths.includes(file.path))
  )
    throw new Error('Hosted credential-file binding mismatch');
  // Domain restrictions do not stop uploads to an allowed provider. Google signing/refresh
  // credentials stay with a trusted issuer; the runtime uses a renewable token provider instead.
  if (provided.data.some((file) => persistentGoogleCredential(file.content)))
    throw new Error('Persistent Google credentials must not enter a hosted sandbox');
  const environment = action.body.environment;
  if (environment.type !== 'openai_hosted')
    throw new Error('Credential files require a hosted environment');
  if (
    environment.network?.access !== 'restricted' ||
    !environment.network.allowed_domains?.length ||
    environment.network.allowed_domains.some((domain) => !exactHostname.safeParse(domain).success)
  )
    throw new Error('Credential files require an explicit restricted exact-host allowlist');
  if (environment.environment_template_id && environment.files === undefined)
    throw new Error('Template credential files require an explicit complete input-file list');
  const existing = environment.files ?? [];
  if (existing.some((file) => paths.includes(file.path)))
    throw new Error('Hosted credential-file path collision');
  const combined = [
    ...existing,
    ...provided.data.map((file) => ({
      type: 'inline' as const,
      path: file.path,
      data: Buffer.from(file.content).toString('base64'),
    })),
  ];
  let inlineBytes = 0;
  for (const file of combined) {
    if (file.type !== 'inline') continue;
    const size = Buffer.byteLength(file.data, 'base64');
    if (size > 5 * 1024 * 1024) throw new Error('Hosted input-file capacity exceeded');
    inlineBytes += size;
  }
  if (combined.length > 50 || inlineBytes > 10 * 1024 * 1024)
    throw new Error('Hosted input-file capacity exceeded');
  environment.files = combined;
}
