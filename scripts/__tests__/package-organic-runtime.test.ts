import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  packageOrganicRuntime,
  runRuntimeCommand,
  runRuntimeExecutable,
  runtimeFingerprint,
  verifyPortableRuntime,
  type RuntimeCommand,
} from '../package-organic-runtime.js';

const temporaryRoots: string[] = [];
async function setup(): Promise<{ root: string; target: string; command: RuntimeCommand }> {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'organic-runtime-test-')));
  temporaryRoots.push(temporary);
  const root = join(temporary, 'source');
  const target = join(temporary, 'artifact');
  await mkdir(join(root, 'packages/organic-performance-engine/dist'), { recursive: true });
  await writeFile(join(root, 'pnpm-lock.yaml'), 'synthetic-lock');
  for (const name of ['cli.js', 'collect-cli.js', 'workbook-cli.js'])
    await writeFile(join(root, 'packages/organic-performance-engine/dist', name), '// synthetic');
  const command: RuntimeCommand = async (_command, args) => {
    if (args.includes('--version')) return '9.15.0';
    if (args.includes('rev-parse')) return 'synthetic-revision';
    if (args.includes('status')) return '?? uncommitted';
    await mkdir(join(target, 'dist'), { recursive: true });
    await writeFile(
      join(target, 'package.json'),
      JSON.stringify({ name: '@headstart-health/organic-performance-engine', version: '3.2.1' })
    );
    for (const name of ['cli.js', 'collect-cli.js', 'workbook-cli.js'])
      await writeFile(join(target, 'dist', name), '// synthetic');
    await mkdir(join(target, 'templates'), { recursive: true });
    await writeFile(join(target, 'templates/headstart-report.v1.json'), '{"synthetic":true}');
    await mkdir(join(target, 'node_modules/@headstart-health/google-search-console/dist'), {
      recursive: true,
    });
    await writeFile(
      join(target, 'node_modules/@headstart-health/google-search-console/dist/cli.js'),
      '// synthetic'
    );
    await symlink(
      join(root, 'packages/organic-performance-engine'),
      join(target, 'node_modules/@headstart-health/organic-performance-engine'),
      'dir'
    );
    return '';
  };
  return { root, target, command };
}
describe('standalone organic runtime packaging', () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });
  it('runs the actual pinned Corepack entrypoint without a PATH shim or live provider', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'organic corepack shim space & fixture-'));
    temporaryRoots.push(directory);
    const marker = join(directory, 'shim-executed.txt');
    // Deliberately unusable PATH shims must never be consulted by the production launcher.
    await writeFile(
      join(directory, 'corepack.cmd'),
      `@echo shim-executed > "${marker}"\r\nexit /b 9\r\n`
    );
    await writeFile(join(directory, 'corepack'), '#!/bin/sh\nexit 9\n', { mode: 0o755 });
    vi.stubEnv('PATH', directory);
    const packageManifest = JSON.parse(
      await readFile(fileURLToPath(import.meta.resolve('corepack/package.json')), 'utf8')
    ) as { version: string; bin: { corepack: string } };
    const rootManifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { devDependencies: { corepack: string } };
    expect(packageManifest.version).toBe(rootManifest.devDependencies.corepack);
    expect(packageManifest.bin.corepack).toBe('./dist/corepack.js');
    expect((await runRuntimeCommand('corepack', ['--version'], directory)).trim()).toBe(
      packageManifest.version
    );
    await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('preserves Node argv boundaries and private failure output without a command interpreter', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'organic launcher space & fixture-'));
    temporaryRoots.push(directory);
    const script = join(directory, 'corepack-fixture.cjs');
    await writeFile(
      script,
      `#!/usr/bin/env node
if (process.argv[2] === 'fail') {
  process.stdout.write('ERR_PNPM_FETCH_403 private-registry-credential');
  process.stderr.write('ENOTFOUND private-provider-credential');
  process.exitCode = 1;
} else process.stdout.write(JSON.stringify(process.argv.slice(2)));
`
    );
    const args = [
      'pnpm',
      '--filter',
      '@headstart-health/organic-performance-engine',
      'deploy',
      '--prod',
      'C:\\path with spaces & (parentheses)\\target',
      'literal %PATH% !value! ^ caret',
      'quote" & echo not-a-command',
    ];
    expect(
      JSON.parse(await runRuntimeExecutable(process.execPath, [script, ...args], directory))
    ).toEqual(args);
    await expect(
      runRuntimeExecutable(process.execPath, [script, 'fail'], directory)
    ).rejects.toThrow(/stdout codes=ERR_PNPM_FETCH_403; stderr codes=ENOTFOUND/);
    await expect(
      runRuntimeExecutable(process.execPath, [script, 'fail'], directory)
    ).rejects.not.toThrow(/private-/);
    await expect(runRuntimeCommand('missing-organic-command', [], directory)).rejects.toThrow(
      /launch codes=ENOENT/
    );
  });
  it('repairs only the known pnpm self-link and records honest portable provenance', async () => {
    const x = await setup();
    const receipt = await packageOrganicRuntime({
      sourceRoot: x.root,
      target: x.target,
      command: x.command,
    });
    expect(receipt).toMatchObject({
      sourceRevision: 'synthetic-revision',
      version: '3.2.1',
      sourceDirty: true,
      pnpmVersion: '9.15.0',
    });
    expect(
      await realpath(join(x.target, 'node_modules/@headstart-health/organic-performance-engine'))
    ).toBe(x.target);
    const saved: unknown = JSON.parse(
      await readFile(join(x.target, 'runtime-receipt.json'), 'utf8')
    );
    expect(saved).toEqual(receipt);
    expect(await runtimeFingerprint(x.target)).toBe(receipt['artifactSha256']);
    await writeFile(join(x.target, 'dist/cli.js'), 'changed');
    expect(await runtimeFingerprint(x.target)).not.toBe(receipt['artifactSha256']);
    await expect(
      packageOrganicRuntime({ sourceRoot: x.root, target: x.target, command: x.command })
    ).rejects.toThrow(/exists/);
  });
  it('rejects unsafe targets and a mismatched package manager', async () => {
    const x = await setup();
    await expect(packageOrganicRuntime({ sourceRoot: x.root, target: 'relative' })).rejects.toThrow(
      /absolute/
    );
    await expect(
      packageOrganicRuntime({ sourceRoot: x.root, target: join(x.root, 'artifact') })
    ).rejects.toThrow(/outside/);
    await expect(
      packageOrganicRuntime({
        sourceRoot: x.root,
        target: x.target,
        command: async (): Promise<string> => '9.12.0',
      })
    ).rejects.toThrow(/9.15.0/);
  });
  it('fails closed on arbitrary external dependency links', async () => {
    const x = await setup();
    await x.command('corepack', [], x.root);
    await symlink(x.root, join(x.target, 'external'), 'dir');
    await expect(
      verifyPortableRuntime(x.target, join(x.root, 'packages/organic-performance-engine'))
    ).rejects.toThrow(/external dependency/);
  });
  it.each([
    { name: 'different-package', version: '1.2.3' },
    { name: '@headstart-health/organic-performance-engine' },
    { name: '@headstart-health/organic-performance-engine', version: ' ' },
    { name: '@headstart-health/organic-performance-engine', version: 123 },
    null,
  ])('refuses a receipt for invalid deployed manifest %j', async (manifest) => {
    const x = await setup();
    const command: RuntimeCommand = async (executable, args, cwd) => {
      const result = await x.command(executable, args, cwd);
      if (args.includes('deploy'))
        await writeFile(join(x.target, 'package.json'), JSON.stringify(manifest));
      return result;
    };
    await expect(
      packageOrganicRuntime({ sourceRoot: x.root, target: x.target, command })
    ).rejects.toThrow('Runtime manifest');
    await expect(readFile(join(x.target, 'runtime-receipt.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
