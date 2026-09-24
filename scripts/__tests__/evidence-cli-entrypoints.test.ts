import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const tsup = fileURLToPath(new URL('./cli-default.js', import.meta.resolve('tsup')));
// --import resolves module specifiers; a Windows filesystem path is an unsupported drive scheme.
const loader = import.meta.resolve('tsx');

function processDiagnostics(result: SpawnSyncReturns<string>): string {
  return JSON.stringify({
    error: result.error?.message,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

describe('installed evidence CLI entrypoints', () => {
  it.each([
    { name: 'document-reading', failure: 'Document inspection failed.' },
    { name: 'google-drive-data', failure: '"code":"drive-runtime-failed"' },
    {
      name: 'headstart-mcp-data',
      failure: 'Absolute --profile, --request and --output paths are required',
    },
  ])(
    'executes the declared $name bin through a link and stays inert when imported',
    async ({ name, failure }) => {
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
          const diagnostics = processDiagnostics(failed);
          expect(failed.error, diagnostics).toBeUndefined();
          expect(failed.status, diagnostics).toBe(1);
          expect(failed.stdout, diagnostics).toBe('');
          expect(failed.stderr, diagnostics).toContain(failure);
        }
        const imported = spawnSync(
          process.execPath,
          [
            ...nodeArgs,
            '--input-type=module',
            '--eval',
            `const entry = await import(${JSON.stringify(pathToFileURL(join(built, entrypoint)).href)}); if (typeof entry.main !== 'function') throw new Error('CLI main export missing');`,
          ],
          options
        );
        const importDiagnostics = processDiagnostics(imported);
        expect(imported.error, importDiagnostics).toBeUndefined();
        expect(imported.status, importDiagnostics).toBe(0);
        expect(imported.stdout, importDiagnostics).toBe('');
        expect(imported.stderr, importDiagnostics).toBe('');
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
          const diagnostics = processDiagnostics(completed);
          expect(completed.error, diagnostics).toBeUndefined();
          expect(completed.status, diagnostics).toBe(0);
          expect(completed.stderr, diagnostics).toBe('');
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
