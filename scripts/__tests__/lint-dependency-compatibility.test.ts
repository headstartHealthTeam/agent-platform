import { Linter } from 'eslint';
import importPlugin from 'eslint-plugin-import-x';
import { expect, it } from 'vitest';

it('retains internal-import enforcement with the patched minimatch API', () => {
  const linter = new Linter();
  const source = "import hidden from 'example/internal/hidden.js';";
  const check = (options: { allow?: string[]; forbid?: string[] }): Linter.LintMessage[] =>
    linter.verify(source, {
      plugins: { 'import-x': importPlugin },
      rules: { 'import-x/no-internal-modules': ['error', options] },
    });

  expect(check({ forbid: ['example/internal/**'] })).toEqual([
    expect.objectContaining({ ruleId: 'import-x/no-internal-modules', severity: 2 }),
  ]);
  expect(check({ forbid: ['example/public/**'] })).toEqual([]);
  expect(check({ allow: ['example/internal/**'] })).toEqual([]);
});
