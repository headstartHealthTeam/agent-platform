import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from 'secretlint/cli';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const configPath = path.resolve(import.meta.dirname, '../../.secretlintrc.json');

const lintFixture = async (
  source: string,
  relativePath = 'fixture.txt'
): Promise<Awaited<ReturnType<typeof run>>> => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-secretlint-fixture-'));
  temporaryDirectories.push(fixtureRoot);
  const fixturePath = path.join(fixtureRoot, relativePath);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, source);

  return run(['**/*'], {
    format: 'stylish',
    secretlintrc: configPath,
    secretlintignore: '.secretlintignore',
    color: false,
    terminalLink: false,
    maskSecrets: true,
    glob: true,
    gitignore: true,
    cwd: fixtureRoot,
    debug: false,
    help: false,
    version: false,
    'no-config': false,
    'no-package': false,
    $schema: false,
    diff: false,
  });
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('repository secret scanning', () => {
  it('rejects a credential-shaped provider token without printing its value', async () => {
    const providerToken = ['ghp_', 'A1b2C3d4', 'E5f6G7h8', 'I9j0K1l2', 'M3n4O5p6', 'Q7r8'].join('');

    const result = await lintFixture(
      `GITHUB_TOKEN=${providerToken}`,
      '.github/workflows/fixture.yml'
    );

    expect(result.exitStatus).toBe(1);
    expect(result.stdout).toContain('@secretlint/secretlint-rule-github');
    expect(result.stdout).not.toContain(providerToken);
    expect(result.stderr).toBeNull();
  });

  it('allows an unmistakable placeholder instead of a credential', async () => {
    const result = await lintFixture('GITHUB_TOKEN=replace-with-your-github-token');

    expect(result).toMatchObject({
      exitStatus: 0,
      stderr: null,
    });
  });
});
