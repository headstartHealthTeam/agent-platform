import { createHash } from 'node:crypto';
import { chmod, lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { assembleRuntimeWorkspace } from './runtime-assembly.js';
import {
  runRuntimeCommand,
  runtimeFingerprint,
  verifyPortableRuntime,
  type RuntimeCommand,
} from './runtime-packaging.js';

const ENGINE = '@headstart-health/intake-sla-engine';
function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}
/** Same dependency-closure packaging as Organic; private configuration and workbook vendor stay external. */
export async function packageIntakeRuntime(input: {
  readonly sourceRoot: string;
  readonly target: string;
  readonly command?: RuntimeCommand;
}): Promise<Readonly<Record<string, unknown>>> {
  const root = await realpath(input.sourceRoot);
  if (!isAbsolute(input.target)) throw new Error('Runtime target must be absolute');
  const target = resolve(input.target);
  const parent = await realpath(dirname(target));
  if (inside(root, parent) || inside(target, root) || parent !== dirname(target))
    throw new Error('Runtime target must be outside the source checkout and use a resolved parent');
  try {
    await lstat(target);
    throw new Error('Runtime target already exists');
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  const sourcePackage = resolve(root, 'packages/intake-sla-engine');
  for (const entrypoint of ['cli.js', 'index.js', 'self-tests/self-test-config.js'])
    await readFile(resolve(sourcePackage, 'dist', entrypoint));
  const command = input.command ?? runRuntimeCommand;
  const version = (await command('corepack', ['pnpm', '--version'], root)).trim();
  if (version !== '9.15.0') throw new Error('Packaging requires the repository-pinned pnpm 9.15.0');
  const sourceRevision = (await command('git', ['rev-parse', 'HEAD'], root)).trim();
  const sourceDirty = (await command('git', ['status', '--porcelain'], root)).trim().length > 0;
  const workspacePackages = await assembleRuntimeWorkspace({
    sourceRoot: root,
    target,
    engine: ENGINE,
  });
  await command(
    'corepack',
    ['pnpm', 'install', '--prod', '--offline', '--frozen-lockfile'],
    target
  );
  await verifyPortableRuntime(target, sourcePackage, ENGINE);
  await readFile(resolve(target, 'dist/self-tests/self-test-config.js'));
  await chmod(resolve(target, 'dist/cli.js'), 0o755);
  const receipt = {
    schemaVersion: 'headstart-intake-runtime/v1',
    package: ENGINE,
    version: '0.1.0',
    sourceRevision,
    sourceDirty,
    workspacePackages,
    pnpmVersion: version,
    lockfileSha256: createHash('sha256')
      .update(await readFile(resolve(root, 'pnpm-lock.yaml')))
      .digest('hex'),
    artifactSha256: await runtimeFingerprint(target),
    entrypoints: { 'headstart-intake-sla': 'dist/cli.js' },
  };
  await writeFile(
    resolve(target, 'runtime-receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { flag: 'wx' }
  );
  return receipt;
}
async function main(): Promise<void> {
  const parsed = parseArgs({ options: { target: { type: 'string' } }, strict: true });
  if (!parsed.values.target) throw new Error('--target is required');
  const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
  process.stdout.write(
    `${JSON.stringify(await packageIntakeRuntime({ sourceRoot, target: parsed.values.target }), null, 2)}\n`
  );
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Runtime packaging failed'}\n`
    );
    process.exitCode = 1;
  });
}
