import { mkdtemp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  packageOrganicRuntime,
  runtimeFingerprint,
  verifyPortableRuntime,
  type RuntimeCommand,
} from '../package-organic-runtime.js';

async function setup(): Promise<{ root: string; target: string; command: RuntimeCommand }> {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'organic-runtime-test-')));
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
  it('repairs only the known pnpm self-link and records honest portable provenance', async () => {
    const x = await setup();
    const receipt = await packageOrganicRuntime({
      sourceRoot: x.root,
      target: x.target,
      command: x.command,
    });
    expect(receipt).toMatchObject({
      sourceRevision: 'synthetic-revision',
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
});
