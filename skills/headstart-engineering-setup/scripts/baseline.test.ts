import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const assets = fileURLToPath(new URL('../assets/node-typescript/', import.meta.url));
let fixture = '';

function write(relative: string, contents: string): void {
  const target = path.join(fixture, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function environment(): NodeJS.ProcessEnv {
  // Git hooks export repository-local variables. Never let fixture commands inherit their target.
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))
    ),
    GIT_CONFIG_GLOBAL: path.join(fixture, 'empty-git-config'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function run(
  command: string,
  arguments_: string[],
  extraEnvironment: NodeJS.ProcessEnv = {}
): { status: number | null; output: string } {
  const result = spawnSync(command, arguments_, {
    cwd: fixture,
    env: { ...environment(), ...extraEnvironment },
    encoding: 'utf8',
    timeout: 90_000,
  });
  if (result.error) {
    throw result.error;
  }
  return { status: result.status, output: result.stdout + result.stderr };
}

function nodeCli(module: string, arguments_: string[]): { status: number | null; output: string } {
  return run(process.execPath, [path.join(root, 'node_modules', module), ...arguments_]);
}

function expectSuccess(result: { status: number | null; output: string }): void {
  expect(result.status, result.output).toBe(0);
}

function addProgram(): void {
  write(
    'src/parse-count.ts',
    `export function parseCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Expected a nonnegative integer');
  }
  return value;
}
`
  );
  write(
    'tests/parse-count.test.ts',
    `import { expect, it } from 'vitest';

import { parseCount } from '../src/parse-count.js';

it('accepts counts and rejects malformed input', () => {
  expect(parseCount(0)).toBe(0);
  expect(parseCount(3)).toBe(3);
  for (const value of ['1', -1, 1.5]) {
    expect(() => parseCount(value)).toThrow('Expected a nonnegative integer');
  }
});
`
  );
}

beforeEach(() => {
  fixture = mkdtempSync(path.join(tmpdir(), 'headstart-engineering-baseline-'));
  cpSync(assets, fixture, { recursive: true });
  symlinkSync(
    path.join(root, 'node_modules'),
    path.join(fixture, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  write('empty-git-config', '');
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe('bundled TypeScript baseline', () => {
  it('retains the platform strict compiler baseline', () => {
    const platform: unknown = JSON.parse(
      readFileSync(path.join(root, 'tsconfig.base.json'), 'utf8')
    );
    const example: unknown = JSON.parse(readFileSync(path.join(fixture, 'tsconfig.json'), 'utf8'));
    if (platform === null || typeof platform !== 'object') {
      throw new Error('Missing platform compiler configuration');
    }
    expect(example).toMatchObject(platform);
  });

  it('type-checks, lints, tests, measures, formats, and builds a real consumer', () => {
    addProgram();
    expectSuccess(nodeCli('prettier/bin/prettier.cjs', ['--write', '.']));
    expectSuccess(nodeCli('typescript/bin/tsc', ['--noEmit']));
    expectSuccess(nodeCli('eslint/bin/eslint.js', ['.', '--max-warnings', '0']));
    expectSuccess(nodeCli('vitest/vitest.mjs', ['run', '--coverage']));
    expectSuccess(nodeCli('typescript/bin/tsc', ['-p', 'tsconfig.build.json']));
    expect(existsSync(path.join(fixture, 'dist/parse-count.js'))).toBe(true);
    expect(existsSync(path.join(fixture, 'dist/parse-count.d.ts'))).toBe(true);
    expectSuccess(nodeCli('prettier/bin/prettier.cjs', ['--check', '.']));
  }, 90_000);

  it('rejects unsafe assertions, promises, and excessive complexity in source, scripts, TSX, and tests', async () => {
    const samples = [
      ['src/unsafe.ts', 'export const value: any = 1;', '@typescript-eslint/no-explicit-any'],
      ['scripts/floating.ts', 'Promise.resolve(1);', '@typescript-eslint/no-floating-promises'],
      ['src/view.tsx', 'export const value: any = 1;', '@typescript-eslint/no-explicit-any'],
      [
        'tests/unsafe.test.ts',
        'export const value: any = 1;',
        '@typescript-eslint/no-explicit-any',
      ],
      [
        'src/assertion.ts',
        'export function convert(value: unknown): string { return value as unknown as string; }',
        'no-restricted-syntax',
      ],
      [
        'src/never.ts',
        'export function convert(value: unknown): never { return value as never; }',
        'no-restricted-syntax',
      ],
      [
        'src/nonnull.ts',
        'export function first(values: string[]): string { return values[0]!; }',
        '@typescript-eslint/no-non-null-assertion',
      ],
      [
        'src/complex.ts',
        'export function complex(value: number): number { if (value > 0) { if (value > 1) { if (value > 2) { if (value > 3) { if (value > 4) { if (value > 5) { return 1; } } } } } } return 0; }',
        'sonarjs/cognitive-complexity',
      ],
    ];
    const eslint = new ESLint({
      cwd: fixture,
      overrideConfigFile: path.join(fixture, 'eslint.config.mjs'),
    });
    for (const [relative, source, rule] of samples) {
      if (!relative || !source || !rule) {
        throw new Error('Incomplete lint regression fixture');
      }
      write(relative, source);
      const results = await eslint.lintFiles([path.join(fixture, relative)]);
      expect(
        results.flatMap((result) => result.messages.map((message) => message.ruleId)),
        relative
      ).toContain(rule);
    }
  }, 60_000);

  it('rejects unchecked indexed access and malformed assignments', () => {
    write(
      'src/unsafe.ts',
      'export const count: number = "bad";\nexport const first: number = [1][9];\n'
    );
    const result = nodeCli('typescript/bin/tsc', ['--noEmit']);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('TS2322');
    expect(result.output).toContain('undefined');
  });

  it('fails coverage for unimported production modules and scripts', () => {
    addProgram();
    for (const relative of ['src/uncovered.tsx', 'scripts/uncovered.ts']) {
      write(
        relative,
        Array.from(
          { length: 8 },
          (_, index) =>
            `export function uncovered${String(index)}(value: number): number { return value > 0 ? value : -value; }`
        ).join('\n')
      );
    }
    const result = nodeCli('vitest/vitest.mjs', ['run', '--coverage']);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain('does not meet');
    const coverage = readFileSync(path.join(fixture, 'coverage/coverage-summary.json'), 'utf8');
    expect(coverage).toContain('uncovered.tsx');
    expect(coverage).toContain('uncovered.ts');
  }, 30_000);

  it('fails on formatting drift', () => {
    write('src/unformatted.ts', 'export const count=1');
    expect(nodeCli('prettier/bin/prettier.cjs', ['--check', '.']).status).not.toBe(0);
  });

  it('installs and exercises pre-commit and full pre-push without touching parent Git configuration', () => {
    addProgram();
    expectSuccess(run('git', ['init', '--initial-branch=main']));
    expectSuccess(nodeCli('husky/bin.js', []));
    expect(run('git', ['config', '--local', '--get', 'core.hooksPath']).output.trim()).toBe(
      '.husky/_'
    );
    expectSuccess(nodeCli('prettier/bin/prettier.cjs', ['--write', '.']));
    write('src/unsafe.ts', 'export const count: any = 1;');
    expectSuccess(run('git', ['add', '.']));
    const commit = [
      '-c',
      'user.name=Engineering Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'Synthetic fixture',
    ];
    const rejected = run('git', commit);
    expect(rejected.status).not.toBe(0);
    expect(rejected.output).toContain('no-explicit-any');
    rmSync(path.join(fixture, 'src/unsafe.ts'));
    expectSuccess(run('git', ['add', '.']));
    expectSuccess(run('git', commit));
    expectSuccess(run('git', ['hook', 'run', 'pre-push']));
    write('src/type-error.ts', "export const count: number = 'bad';\n");
    const dirty = run('git', ['hook', 'run', 'pre-push']);
    expect(dirty.status).not.toBe(0);
    expect(dirty.output).toContain('working changes');
    expectSuccess(run('git', ['add', '.']));
    expectSuccess(run('git', commit));
    const invalid = run('git', ['hook', 'run', 'pre-push']);
    expect(invalid.status).not.toBe(0);
    expect(invalid.output).toContain('TS2322');
  }, 120_000);

  it('keeps the CI aggregate fail-closed for every non-success lane', () => {
    const workflow: unknown = parse(
      readFileSync(path.join(assets, '.github/workflows/qa.yml'), 'utf8')
    );
    expect(workflow).toMatchObject({
      on: { pull_request: { branches: ['main'] }, push: { branches: ['main'] } },
      permissions: { contents: 'read' },
      jobs: { required: { if: '${{ always() }}', needs: ['quality', 'dependency-audit'] } },
    });
    if (workflow === null || typeof workflow !== 'object' || !('jobs' in workflow)) {
      throw new Error('Missing CI jobs');
    }
    const jobs = workflow.jobs;
    if (jobs === null || typeof jobs !== 'object' || !('required' in jobs)) {
      throw new Error('Missing required job');
    }
    const required = jobs.required;
    if (
      required === null ||
      typeof required !== 'object' ||
      !('steps' in required) ||
      !Array.isArray(required.steps)
    ) {
      throw new Error('Missing aggregate steps');
    }
    const step: unknown = required.steps[0];
    if (
      step === null ||
      typeof step !== 'object' ||
      !('run' in step) ||
      typeof step.run !== 'string'
    ) {
      throw new Error('Missing aggregate command');
    }
    for (const status of ['success', 'failure', 'cancelled', 'skipped']) {
      for (const lane of ['QUALITY_RESULT', 'AUDIT_RESULT']) {
        const result = run('bash', ['-c', step.run], {
          QUALITY_RESULT: 'success',
          AUDIT_RESULT: 'success',
          [lane]: status,
        });
        expect(result.status).toBe(status === 'success' ? 0 : 1);
      }
    }
  });
});
