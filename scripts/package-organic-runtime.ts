import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  readFile,
  readdir,
  realpath,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ENGINE = '@headstart-health/organic-performance-engine';
const COREPACK_ENTRYPOINT = fileURLToPath(
  new URL('./dist/corepack.js', import.meta.resolve('corepack/package.json'))
);
export type RuntimeCommand = (
  command: string,
  args: readonly string[],
  cwd: string
) => Promise<string>;

export const runRuntimeExecutable: RuntimeCommand = (command, args, cwd) => {
  // Only native executables cross this boundary. In particular, never forward dynamic arguments
  // through corepack.cmd: a batch shim's %* introduces another shell-parsing step on Windows.
  const result = spawnSync(command, [...args], {
    cwd,
    timeout: 300_000,
    maxBuffer: 4_000_000,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    // Child output may contain private registry URLs or credentials. Retain only recognized
    // diagnostic codes, separately by stream, instead of printing arbitrary stdout/stderr.
    const codes = (value: unknown): string =>
      [
        ...new Set(
          (typeof value === 'string' ? value : '').match(
            /\b(?:ERR_[A-Z0-9_]+|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOENT|EACCES)\b/g
          ) ?? []
        ),
      ].join(',') || 'none';
    return Promise.reject(
      new Error(
        `Runtime command failed (${command === process.execPath ? 'node' : 'git'}; exit=${String(result.status)}; signal=${result.signal ?? 'none'}; stdout codes=${codes(result.stdout)}; stderr codes=${codes(result.stderr)}; launch codes=${codes(result.error?.message ?? '')})`
      )
    );
  }
  return Promise.resolve(result.stdout);
};
export const runRuntimeCommand: RuntimeCommand = (command, args, cwd) =>
  command === 'corepack'
    ? runRuntimeExecutable(process.execPath, [COREPACK_ENTRYPOINT, ...args], cwd)
    : runRuntimeExecutable(command, args, cwd);
function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}
async function files(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) output.push(...(await files(path)));
    else output.push(path);
  }
  return output.sort();
}

/** Repair pnpm 9's redundant engine self-link, then reject every remaining external link. */
export async function verifyPortableRuntime(target: string, sourcePackage: string): Promise<void> {
  const root = await realpath(target);
  const source = await realpath(sourcePackage);
  const paths = await files(root);
  const repair: string[] = [];
  for (const path of paths) {
    if (!(await lstat(path)).isSymbolicLink()) continue;
    const destination = await realpath(path);
    if (
      destination === source &&
      path.endsWith(`${sep}@headstart-health${sep}organic-performance-engine`)
    )
      repair.push(path);
    else if (!inside(root, destination))
      throw new Error(`Runtime contains an external dependency link: ${relative(root, path)}`);
  }
  for (const path of repair) {
    await unlink(path);
    await symlink(relative(dirname(path), root), path, 'dir');
  }
}

export async function runtimeFingerprint(target: string): Promise<string> {
  const digest = createHash('sha256');
  for (const path of await files(target)) {
    if (path === resolve(target, 'runtime-receipt.json')) continue;
    const name = relative(target, path).split(sep).join('/');
    const content = (await lstat(path)).isSymbolicLink()
      ? `link:${relative(target, await realpath(path))
          .split(sep)
          .join('/')}`
      : createHash('sha256')
          .update(await readFile(path))
          .digest('hex');
    digest.update(`${name}\0${content}\n`);
  }
  return digest.digest('hex');
}

export async function packageOrganicRuntime(input: {
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
  const sourcePackage = resolve(root, 'packages/organic-performance-engine');
  for (const entrypoint of ['cli.js', 'collect-cli.js', 'workbook-cli.js'])
    await readFile(resolve(sourcePackage, 'dist', entrypoint));
  const command = input.command ?? runRuntimeCommand;
  const version = (await command('corepack', ['pnpm', '--version'], root)).trim();
  if (version !== '9.15.0') throw new Error('Packaging requires the repository-pinned pnpm 9.15.0');
  const sourceRevision = (await command('git', ['rev-parse', 'HEAD'], root)).trim();
  const sourceDirty = (await command('git', ['status', '--porcelain'], root)).trim().length > 0;
  await command('corepack', ['pnpm', '--filter', ENGINE, 'deploy', '--prod', target], root);
  await verifyPortableRuntime(target, sourcePackage);
  const template = await readFile(resolve(target, 'templates/headstart-report.v1.json'));
  const receipt = {
    schemaVersion: 'headstart-organic-runtime/v1',
    package: ENGINE,
    version: '0.1.0',
    sourceRevision,
    sourceDirty,
    pnpmVersion: version,
    lockfileSha256: createHash('sha256')
      .update(await readFile(resolve(root, 'pnpm-lock.yaml')))
      .digest('hex'),
    artifactSha256: await runtimeFingerprint(target),
    templateSha256: createHash('sha256').update(template).digest('hex'),
    entrypoints: {
      'headstart-organic-analyze': 'dist/cli.js',
      'headstart-organic-collect': 'dist/collect-cli.js',
      'headstart-organic-workbook-plan': 'dist/workbook-cli.js',
      'headstart-gsc-report': 'node_modules/@headstart-health/google-search-console/dist/cli.js',
    },
  };
  for (const entrypoint of Object.values(receipt.entrypoints)) {
    await readFile(resolve(target, entrypoint));
    await chmod(resolve(target, entrypoint), 0o755);
  }
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
  const receipt = await packageOrganicRuntime({ sourceRoot, target: parsed.values.target });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Runtime packaging failed'}\n`
    );
    process.exitCode = 1;
  });
}
