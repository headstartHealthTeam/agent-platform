import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const tsup = fileURLToPath(new URL('./cli-default.js', import.meta.resolve('tsup')));
const loader = fileURLToPath(import.meta.resolve('tsx'));

describe('installed evidence CLI entrypoints', () => {
  it.each(['document-reading', 'google-drive-data', 'headstart-mcp-data'])(
    'executes the declared %s bin through a link and stays inert when imported',
    async (name) => {
      const directory = await mkdtemp(join(tmpdir(), 'evidence bin space & fixture-'));
      try {
        const source = join(repository, 'packages', name);
        const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) as {
          bin: Record<string, string>;
        };
        const [bin] = Object.entries(manifest.bin);
        if (!bin) throw new Error('Missing declared evidence command');
        const [command, entrypoint] = bin;
        const built = join(directory, 'package');
        execFileSync(
          process.execPath,
          [
            tsup,
            'src/cli.ts',
            '--format',
            'esm',
            '--target',
            'node22',
            '--out-dir',
            join(built, 'dist'),
          ],
          { cwd: source, timeout: 30_000, stdio: 'pipe' }
        );
        await writeFile(join(built, 'package.json'), '{"type":"module"}');
        await symlink(
          join(source, 'node_modules'),
          join(built, 'node_modules'),
          process.platform === 'win32' ? 'junction' : 'dir'
        );
        const linkedPackage = join(directory, 'linked-package');
        // A Windows package-directory junction requires no file-symlink privilege and exercises
        // the same linked path passed to Node by a package-manager .cmd shim.
        await symlink(built, linkedPackage, process.platform === 'win32' ? 'junction' : 'dir');
        let linkedBin = join(linkedPackage, entrypoint);
        if (process.platform !== 'win32') {
          await mkdir(join(directory, '.bin'));
          linkedBin = join(directory, '.bin', command);
          await symlink(join(linkedPackage, entrypoint), linkedBin, 'file');
        }
        const options = { cwd: source, timeout: 30_000, encoding: 'utf8' as const };
        const nodeArgs = ['--conditions=development', '--import', loader];
        for (const entry of [join(built, entrypoint), linkedBin]) {
          const failed = spawnSync(process.execPath, [...nodeArgs, entry], options);
          expect(failed.error).toBeUndefined();
          expect(failed.status).toBe(1);
          expect(failed.stdout).toBe('');
          expect(failed.stderr.trim()).not.toBe('');
        }
        const imported = spawnSync(
          process.execPath,
          [
            ...nodeArgs,
            '--input-type=module',
            '--eval',
            `await import(${JSON.stringify(pathToFileURL(join(built, entrypoint)).href)})`,
          ],
          options
        );
        expect(imported.error).toBeUndefined();
        expect(imported.status).toBe(0);
        expect(imported.stdout).toBe('');
        expect(imported.stderr).toBe('');
        if (name === 'document-reading') {
          const file = join(directory, 'original.txt');
          const output = join(directory, 'evidence');
          await writeFile(file, 'Complete synthetic original evidence');
          const completed = spawnSync(
            process.execPath,
            [
              ...nodeArgs,
              linkedBin,
              '--file',
              file,
              '--mime',
              'text/plain',
              '--mode',
              'text',
              '--output',
              output,
            ],
            options
          );
          expect(completed.error).toBeUndefined();
          expect(completed.status).toBe(0);
          expect(completed.stderr).toBe('');
          expect(JSON.parse(completed.stdout)).toEqual({ resultFile: join(output, 'result.json') });
          expect(await readFile(join(output, 'result.json'), 'utf8')).toContain(
            'Complete synthetic original evidence'
          );
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    // Build plus several native processes; Windows filesystem/process startup is slower.
    process.platform === 'win32' ? 180_000 : 120_000
  );
});
