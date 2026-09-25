import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, symlink, unlink } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
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
  packageName: string
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
