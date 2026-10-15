import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

import { packageIntakeRuntime } from '../package-intake-runtime.js';
import { runtimeFingerprint, type RuntimeCommand } from '../runtime-packaging.js';

const temporary: string[] = [];
async function setup(): Promise<{
  root: string;
  target: string;
  command: RuntimeCommand;
  calls: string[][];
}> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'intake-runtime-test-')));
  temporary.push(directory);
  const root = join(directory, 'source');
  const target = join(directory, 'artifact');
  const packageRoot = join(root, 'packages/intake-sla-engine');
  await mkdir(join(packageRoot, 'dist/self-tests'), { recursive: true });
  const manifest = {
    name: '@headstart-health/intake-sla-engine',
    version: '0.1.0',
    files: ['dist', 'docs', 'README.md'],
    dependencies: { '@headstart-health/test-provider': 'workspace:*', external: '1.0.0' },
  };
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      packageManager: 'pnpm@9.15.0',
      pnpm: { overrides: { external: '1.0.0' } },
      scripts: { prepare: 'must-not-copy' },
    })
  );
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(packageRoot, 'README.md'), 'synthetic package');
  await mkdir(join(packageRoot, 'docs'));
  await writeFile(join(packageRoot, 'docs/local-setup.md'), 'synthetic setup contract');
  const provider = join(root, 'packages/test-provider');
  await mkdir(join(provider, 'dist'), { recursive: true });
  await writeFile(
    join(provider, 'package.json'),
    JSON.stringify({ name: '@headstart-health/test-provider', files: ['dist', 'README.md'] })
  );
  await writeFile(join(provider, 'README.md'), 'synthetic provider');
  await writeFile(join(provider, 'dist/index.js'), '// synthetic');
  await writeFile(
    join(root, 'pnpm-lock.yaml'),
    stringify({
      lockfileVersion: '9.0',
      importers: {
        '.': { devDependencies: { unrelated: { specifier: '1', version: '1' } } },
        'packages/intake-sla-engine': {
          dependencies: {
            '@headstart-health/test-provider': {
              specifier: 'workspace:*',
              version: 'link:../test-provider',
            },
            external: { specifier: '1.0.0', version: '1.0.0' },
          },
        },
        'packages/test-provider': {},
      },
      packages: { 'external@1.0.0': { resolution: { integrity: 'synthetic-integrity' } } },
      snapshots: { 'external@1.0.0': {} },
    })
  );
  for (const name of ['cli.js', 'index.js', 'self-tests/self-test-config.js'])
    await writeFile(join(packageRoot, 'dist', name), '// synthetic');
  const calls: string[][] = [];
  const command: RuntimeCommand = async (executable, args) => {
    calls.push([executable, ...args]);
    if (args.includes('--version')) return '9.15.0';
    if (args.includes('rev-parse')) return 'synthetic-revision';
    if (args.includes('status')) return '';
    await mkdir(join(target, 'node_modules/@headstart-health'), { recursive: true });
    await symlink(target, join(target, 'node_modules/@headstart-health/intake-sla-engine'), 'dir');
    return '';
  };
  return { root, target, command, calls };
}
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true });
});
describe('standalone Intake dependency closure', () => {
  it('packages production dependencies, repairs only its self-link and fingerprints the full artifact', async () => {
    const input = await setup();
    const result = await packageIntakeRuntime({
      sourceRoot: input.root,
      target: input.target,
      command: input.command,
    });
    expect(result).toMatchObject({
      schemaVersion: 'headstart-intake-runtime/v1',
      sourceRevision: 'synthetic-revision',
      sourceDirty: false,
    });
    expect(input.calls.at(-1)).toEqual([
      'corepack',
      'pnpm',
      'install',
      '--prod',
      '--offline',
      '--frozen-lockfile',
    ]);
    expect(
      await realpath(join(input.target, 'node_modules/@headstart-health/intake-sla-engine'))
    ).toBe(input.target);
    expect(JSON.parse(await readFile(join(input.target, 'runtime-receipt.json'), 'utf8'))).toEqual(
      result
    );
    expect(await runtimeFingerprint(input.target)).toBe(result['artifactSha256']);
    expect(await readFile(join(input.target, 'docs/local-setup.md'), 'utf8')).toBe(
      'synthetic setup contract'
    );
    expect(result['workspacePackages']).toEqual([
      '@headstart-health/intake-sla-engine',
      '@headstart-health/test-provider',
    ]);
    expect(JSON.parse(await readFile(join(input.target, 'package.json'), 'utf8'))).toMatchObject({
      pnpm: { overrides: { external: '1.0.0' } },
    });
    expect(await readFile(join(input.target, 'package.json'), 'utf8')).not.toContain(
      'must-not-copy'
    );
    const lock: unknown = parse(await readFile(join(input.target, 'pnpm-lock.yaml'), 'utf8'));
    expect(lock).toEqual({
      lockfileVersion: '9.0',
      importers: {
        '.': {
          dependencies: {
            '@headstart-health/test-provider': {
              specifier: 'workspace:*',
              version: 'link:packages/test-provider',
            },
            external: { specifier: '1.0.0', version: '1.0.0' },
          },
        },
        'packages/test-provider': {},
      },
      packages: { 'external@1.0.0': { resolution: { integrity: 'synthetic-integrity' } } },
      snapshots: { 'external@1.0.0': {} },
    });
    await expect(
      packageIntakeRuntime({ sourceRoot: input.root, target: input.target })
    ).rejects.toThrow('exists');
  });
  it('rejects relative/in-checkout targets and mismatched package managers before deployment', async () => {
    const input = await setup();
    for (const target of ['relative', join(input.root, 'artifact')])
      await expect(packageIntakeRuntime({ sourceRoot: input.root, target })).rejects.toThrow();
    await expect(
      packageIntakeRuntime({
        sourceRoot: input.root,
        target: input.target,
        command: async (): Promise<string> => 'wrong',
      })
    ).rejects.toThrow('9.15.0');
  });
});
