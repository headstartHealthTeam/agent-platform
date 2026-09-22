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
export async function verifyPortableRuntime(
  target: string,
  sourcePackage: string,
  packageName = '@headstart-health/organic-performance-engine'
): Promise<void> {
  const root = await realpath(target);
  const source = await realpath(sourcePackage);
  const paths = await files(root);
  const repair: string[] = [];
  for (const path of paths) {
    if (!(await lstat(path)).isSymbolicLink()) continue;
    const destination = await realpath(path);
    if (destination === source && path.endsWith(`${sep}${packageName.split('/').join(sep)}`))
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

export async function packageWorkspaceRuntime(input: {
  readonly sourceRoot: string;
  readonly target: string;
  readonly command?: RuntimeCommand;
  readonly packageName: string;
  readonly packageDirectory: string;
  readonly schemaVersion: string;
  readonly buildEntries: readonly string[];
  readonly entrypoints: Readonly<Record<string, string>>;
  readonly extraFileHashes?: Readonly<Record<string, string>>;
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
  const sourcePackage = resolve(root, input.packageDirectory);
  for (const entrypoint of input.buildEntries)
    await readFile(resolve(sourcePackage, 'dist', entrypoint));
  const command = input.command ?? runRuntimeCommand;
  const version = (await command('corepack', ['pnpm', '--version'], root)).trim();
  if (version !== '9.15.0') throw new Error('Packaging requires the repository-pinned pnpm 9.15.0');
  const sourceRevision = (await command('git', ['rev-parse', 'HEAD'], root)).trim();
  const sourceDirty = (await command('git', ['status', '--porcelain'], root)).trim().length > 0;
  await command(
    'corepack',
    ['pnpm', '--filter', input.packageName, 'deploy', '--prod', target],
    root
  );
  await verifyPortableRuntime(target, sourcePackage, input.packageName);
  const extraHashes = new Map<string, string>();
  for (const [name, path] of Object.entries(input.extraFileHashes ?? {})) {
    extraHashes.set(
      name,
      createHash('sha256')
        .update(await readFile(resolve(target, path)))
        .digest('hex')
    );
  }
  const receipt = {
    schemaVersion: input.schemaVersion,
    package: input.packageName,
    version: '0.1.0',
    sourceRevision,
    sourceDirty,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    pnpmVersion: version,
    lockfileSha256: createHash('sha256')
      .update(await readFile(resolve(root, 'pnpm-lock.yaml')))
      .digest('hex'),
    artifactSha256: await runtimeFingerprint(target),
    ...Object.fromEntries(extraHashes),
    entrypoints: input.entrypoints,
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
