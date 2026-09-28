import { posix } from 'node:path';

import type { AgentHostedCredentialFile } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { exactCredentialHosts } from './hosted-credential-network.js';
import { validateHostedInputFiles } from './hosted-setup.js';
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
function persistentGoogleCredential(content: string): boolean {
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) return true;
  try {
    const value: unknown = JSON.parse(content);
    const pending: unknown[] = [value];
    while (pending.length) {
      const entry = pending.pop();
      if (entry === null || typeof entry !== 'object') continue;
      if (
        'private_key' in entry ||
        'refresh_token' in entry ||
        ('type' in entry &&
          [
            'service_account',
            'authorized_user',
            'impersonated_service_account',
            'external_account',
          ].includes(String(entry.type)))
      )
        return true;
      const values: unknown[] = Object.values(entry);
      for (const child of values) pending.push(child);
    }
    return false;
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
  exactCredentialHosts(environment.network);
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
  validateHostedInputFiles(combined);
  environment.files = combined;
}
