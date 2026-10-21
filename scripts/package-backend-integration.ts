import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { credentialingReleaseDefinition } from './package-credentialing-runtime.js';
import { runRuntimeCommand, type RuntimeCommand } from './runtime-packaging.js';

/** Copy only application integration artifacts. No evidence reader, parser, skill tree,
 * agent executor or its dependency tree is installed in the application container.
 */
export async function packageBackendIntegration(
  sourceRoot: string,
  target: string,
  command: RuntimeCommand = runRuntimeCommand
): Promise<Readonly<Record<string, unknown>>> {
  if (!isAbsolute(target)) throw new Error('Absolute output directory required');
  if ((await command('git', ['status', '--porcelain'], sourceRoot)).trim())
    throw new Error('Release source must be clean');
  await mkdir(target);
  const release = await credentialingReleaseDefinition(sourceRoot, command);
  const files = {
    'operator-module.cjs': await readFile(
      resolve(sourceRoot, 'packages/openai-platform/dist/operator/operator-module.cjs')
    ),
    'artifact-worker.cjs': await readFile(
      resolve(sourceRoot, 'workflows/provider-credentialing/dist/artifact-worker.cjs')
    ),
    'prepared-definition.json': Buffer.from(`${JSON.stringify(release.artifact, null, 2)}\n`),
  };
  const digests = new Map<string, string>();
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(resolve(target, name), bytes, { flag: 'wx' });
    digests.set(name, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  }
  const manifest = {
    schemaVersion: 'headstart-backend-integration/v1',
    sourceRevision: release.sourceRevision,
    runtimeRevision: release.artifact.definition.runtimeRevision,
    files: Object.fromEntries(digests),
  };
  await writeFile(resolve(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
  });
  return manifest;
}
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { target: { type: 'string' } }, strict: true });
  if (!values.target) throw new Error('--target required');
  const manifest = await packageBackendIntegration(
    fileURLToPath(new URL('..', import.meta.url)),
    values.target
  );
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('Backend integration packaging failed.\n');
    process.exitCode = 1;
  });
}
