import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { runRuntimeCommand, type RuntimeCommand } from './runtime-packaging.js';

const receiptSchema = z
  .object({
    schemaVersion: z.literal('headstart-security-preflight/v1'),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    lockfileSha256: z.string().regex(/^[a-f0-9]{64}$/),
    completedAt: z.iso.datetime(),
    threshold: z.literal('moderate'),
    production: z.literal('passed'),
    allDependencies: z.literal('passed'),
  })
  .strict();
export type SecurityPreflightReceipt = z.infer<typeof receiptSchema>;
export const SECURITY_PREFLIGHT_MAX_AGE_MS = 15 * 60 * 1000;

async function sourceIdentity(
  root: string,
  command: RuntimeCommand
): Promise<{
  sourceRevision: string;
  lockfileSha256: string;
}> {
  const sourceRevision = (await command('git', ['rev-parse', 'HEAD'], root)).trim();
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error('Invalid source revision');
  if ((await command('git', ['status', '--porcelain'], root)).trim())
    throw new Error('Security preflight requires a clean source checkout');
  const lockfileSha256 = createHash('sha256')
    .update(await readFile(resolve(root, 'pnpm-lock.yaml')))
    .digest('hex');
  return { sourceRevision, lockfileSha256 };
}

/** Refresh only the network-dependent audit; deterministic QA remains a separate complete gate. */
export async function securityPreflight(
  root: string,
  expectedSource: string,
  command: RuntimeCommand = runRuntimeCommand,
  now: () => Date = () => new Date()
): Promise<SecurityPreflightReceipt> {
  const before = await sourceIdentity(root, command);
  if (before.sourceRevision !== expectedSource) throw new Error('Unexpected release source');
  const failures: string[] = [];
  // Attempt both inventories even when production fails, so remediation is assessed together.
  for (const [scope, args] of [
    ['production', ['pnpm', 'audit', '--prod', '--audit-level', 'moderate']],
    ['all dependencies', ['pnpm', 'audit', '--audit-level', 'moderate']],
  ] as const) {
    try {
      await command('corepack', args, root);
    } catch {
      failures.push(scope);
    }
  }
  if (failures.length)
    throw new Error(
      `Security audit failed (${failures.join(', ')}). Inspect pnpm audit at this exact source; no passing receipt was issued.`
    );
  const after = await sourceIdentity(root, command);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Source changed during audit');
  return {
    schemaVersion: 'headstart-security-preflight/v1',
    ...after,
    completedAt: now().toISOString(),
    threshold: 'moderate',
    production: 'passed',
    allDependencies: 'passed',
  };
}

/** A receipt is local evidence, not a signed attestation or a substitute for live GitHub checks. */
export async function verifySecurityPreflight(
  value: unknown,
  root: string,
  expectedSource: string,
  command: RuntimeCommand = runRuntimeCommand,
  now: () => Date = () => new Date()
): Promise<SecurityPreflightReceipt> {
  const receipt = receiptSchema.parse(value);
  const current = await sourceIdentity(root, command);
  const age = now().getTime() - Date.parse(receipt.completedAt);
  if (
    current.sourceRevision !== expectedSource ||
    receipt.sourceRevision !== expectedSource ||
    receipt.lockfileSha256 !== current.lockfileSha256 ||
    age < 0 ||
    age > SECURITY_PREFLIGHT_MAX_AGE_MS
  )
    throw new Error('Security preflight is stale or belongs to different source bytes');
  return receipt;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'expected-source': { type: 'string' },
      output: { type: 'string' },
      verify: { type: 'string' },
    },
    strict: true,
  });
  if (!values['expected-source'] || Boolean(values.output) === Boolean(values.verify))
    throw new Error('Provide --expected-source and exactly one of --output or --verify');
  const root = fileURLToPath(new URL('..', import.meta.url));
  if (values.verify) {
    await verifySecurityPreflight(
      JSON.parse(await readFile(values.verify, 'utf8')),
      root,
      values['expected-source']
    );
  } else if (values.output) {
    const receipt = await securityPreflight(root, values['expected-source']);
    await writeFile(values.output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  }
  process.stdout.write('Fresh exact-source security preflight verified.\n');
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(
      'Security preflight failed. Verify clean expected source and run both documented audit commands; no merge is authorized.\n'
    );
    process.exitCode = 1;
  });
}
