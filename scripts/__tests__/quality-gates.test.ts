import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const directories: string[] = [];
interface PackageManifest {
  scripts?: Record<string, string>;
}
const manifest = (directory: string): PackageManifest =>
  JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')) as PackageManifest;

function lintCommands(): string[] {
  const roots = [root];
  for (const scope of ['apps', 'packages', 'workflows']) {
    for (const entry of fs.readdirSync(path.join(root, scope), { withFileTypes: true })) {
      const directory = path.join(root, scope, entry.name);
      if (entry.isDirectory() && fs.existsSync(path.join(directory, 'package.json'))) {
        roots.push(directory);
      }
    }
  }
  return roots.flatMap((directory) => {
    const lint = manifest(directory).scripts?.['lint'];
    return lint === undefined ? [] : [lint];
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('canonical typed lint quality gates', () => {
  it('keeps per-file caches out of every lint gate while retaining dependency-aware Turbo caching', () => {
    const commands = lintCommands();
    expect(commands.length).toBeGreaterThan(1);
    for (const command of commands) {
      expect(command).toMatch(/^eslint\s/);
      expect(command).toContain('--no-cache');
      expect(command).not.toMatch(/(?:^|\s)--cache(?:[\s=]|$)/);
      expect(command).not.toContain('--cache-strategy');
      expect(command).not.toContain('--cache-location');
    }
    const turbo = JSON.parse(fs.readFileSync(path.join(root, 'turbo.json'), 'utf8')) as {
      tasks: { lint: { dependsOn: string[]; inputs: string[]; cache?: boolean } };
    };
    expect(turbo.tasks.lint.dependsOn).toEqual(expect.arrayContaining(['^lint', '^build']));
    expect(turbo.tasks.lint.inputs).toEqual(
      expect.arrayContaining(['$TURBO_DEFAULT$', '^$TURBO_DEFAULT$'])
    );
    expect(turbo.tasks.lint.cache).not.toBe(false);
    const scripts = manifest(root).scripts;
    expect(scripts?.['qa:commit']).toContain('npm run lint');
    expect(scripts?.['qa']).toContain('npm run lint');
    for (const [hook, command] of [
      ['pre-commit', 'qa:commit'],
      ['pre-push', 'qa'],
      ['pre-merge-commit', 'qa'],
    ]) {
      if (hook === undefined || command === undefined) throw new Error('Invalid hook fixture');
      expect(fs.readFileSync(path.join(root, '.husky', hook), 'utf8')).toContain(
        `run_pnpm ${command}\n`
      );
    }
  });

  it('catches an imported type change in an unchanged consumer even after a successful cached lint', () => {
    const directory = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-typed-lint-'))
    );
    directories.push(directory);
    const consumer = path.join(directory, 'consumer.ts');
    const contract = path.join(directory, 'contract.ts');
    const original =
      "import type { Report } from './contract.js';\nexport function version(report: Report): string { return report['sourceConfiguration']; }\n";
    fs.writeFileSync(consumer, original);
    fs.writeFileSync(contract, 'export interface Report { readonly [key: string]: string; }\n');
    fs.writeFileSync(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['*.ts'],
      })
    );
    fs.writeFileSync(
      path.join(directory, 'eslint.config.mjs'),
      `
import tseslint from ${JSON.stringify(import.meta.resolve('typescript-eslint'))};
export default [{
  files: ['**/*.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { project: './tsconfig.json', tsconfigRootDir: ${JSON.stringify(directory)} },
  },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: { '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }] },
}];
`
    );
    const executable = path.join(
      path.dirname(fileURLToPath(import.meta.resolve('eslint/package.json'))),
      'bin/eslint.js'
    );
    const run = (cacheArgs: string[]): ReturnType<typeof spawnSync> =>
      spawnSync(
        process.execPath,
        [
          executable,
          '--config',
          path.join(directory, 'eslint.config.mjs'),
          '--max-warnings',
          '0',
          ...cacheArgs,
          consumer,
        ],
        { cwd: directory, encoding: 'utf8', timeout: 15_000 }
      );
    const cachedArgs = [
      '--cache',
      '--cache-strategy',
      'content',
      '--cache-location',
      path.join(directory, '.eslintcache'),
    ];
    expect(run(cachedArgs).status).toBe(0);
    fs.writeFileSync(
      contract,
      'export interface Report { readonly sourceConfiguration: string; }\n'
    );
    // This is the exact false-negative mechanism: only the imported type changed.
    expect(run(cachedArgs).status).toBe(0);
    expect(fs.readFileSync(consumer, 'utf8')).toBe(original);
    const cacheFlag = manifest(root)
      .scripts?.['lint']?.split(' ')
      .find((value) => value === '--no-cache');
    if (cacheFlag === undefined) throw new Error('Canonical lint must disable its per-file cache');
    const fresh = run([cacheFlag]);
    expect(fresh.status, `${String(fresh.stdout)}\n${String(fresh.stderr)}`).toBe(1);
    expect(String(fresh.stdout)).toContain('@typescript-eslint/dot-notation');
  }, 30_000);
});
