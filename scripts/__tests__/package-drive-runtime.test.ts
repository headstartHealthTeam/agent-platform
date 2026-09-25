import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageDriveRuntime } from '../package-drive-runtime.js';
import type { RuntimeCommand } from '../runtime-packaging.js';

describe('shared runtime packaging for Drive', () => {
  it('uses the same portable production-dependency artifact and provenance mechanism as reporting', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'drive-package-')));
    try {
      const root = join(directory, 'checkout');
      const source = join(root, 'packages/google-drive-data');
      const target = join(directory, 'artifact');
      await mkdir(join(source, 'dist'), { recursive: true });
      await writeFile(join(root, 'pnpm-lock.yaml'), 'synthetic lock');
      for (const file of ['index.js', 'cli.js'])
        await writeFile(join(source, 'dist', file), '// synthetic');
      const command: RuntimeCommand = async (_command, args) => {
        if (args.includes('--version')) return '9.15.0';
        if (args.includes('rev-parse')) return 'synthetic-revision';
        if (args.includes('status')) return '';
        expect(args).toContain('@headstart-health/google-drive-data');
        await mkdir(join(target, 'dist'), { recursive: true });
        await writeFile(
          join(target, 'package.json'),
          JSON.stringify({ name: '@headstart-health/google-drive-data', version: '2.3.4' })
        );
        await writeFile(join(target, 'dist/cli.js'), '// synthetic');
        await mkdir(join(target, 'node_modules/@headstart-health'), { recursive: true });
        await symlink(
          source,
          join(target, 'node_modules/@headstart-health/google-drive-data'),
          'dir'
        );
        return '';
      };
      const receipt = await packageDriveRuntime({ sourceRoot: root, target, command });
      expect(receipt).toMatchObject({
        package: '@headstart-health/google-drive-data',
        version: '2.3.4',
        sourceDirty: false,
        schemaVersion: 'headstart-drive-runtime/v1',
      });
      expect(await realpath(join(target, 'node_modules/@headstart-health/google-drive-data'))).toBe(
        target
      );
      expect(JSON.parse(await readFile(join(target, 'runtime-receipt.json'), 'utf8'))).toEqual(
        receipt
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
