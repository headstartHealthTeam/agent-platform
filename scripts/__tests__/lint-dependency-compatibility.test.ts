import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Linter } from 'eslint';
import importPlugin from 'eslint-plugin-import-x';
import { expect, it } from 'vitest';

it('retains internal-import enforcement with the patched minimatch API', () => {
  const root = mkdtempSync(join(tmpdir(), 'lint-dependency-compatibility-'));
  try {
    const moduleDirectory = join(root, 'node_modules', 'example', 'internal');
    mkdirSync(moduleDirectory, { recursive: true });
    writeFileSync(join(root, 'package.json'), '{"name":"lint-fixture","private":true}');
    writeFileSync(join(moduleDirectory, 'hidden.js'), 'module.exports = true;');
    const linter = new Linter({ cwd: root });
    const source = "import hidden from 'example/internal/hidden.js';";
    const check = (options: { allow?: string[]; forbid?: string[] }): Linter.LintMessage[] =>
      linter.verify(
        source,
        {
          plugins: { 'import-x': importPlugin },
          rules: { 'import-x/no-internal-modules': ['error', options] },
        },
        { filename: join(root, 'entry.js') }
      );

    expect(check({ forbid: ['example/internal/**'] })).toEqual([
      expect.objectContaining({ ruleId: 'import-x/no-internal-modules', severity: 2 }),
    ]);
    expect(check({ forbid: ['example/public/**'] })).toEqual([]);
    expect(check({ allow: ['example/internal/**'] })).toEqual([]);
    expect(check({ allow: ['example/public/**'] })).toEqual([
      expect.objectContaining({
        ruleId: 'import-x/no-internal-modules',
        severity: 2,
        messageId: 'noAllowed',
        message: 'Reaching to "example/internal/hidden.js" is not allowed.',
      }),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
