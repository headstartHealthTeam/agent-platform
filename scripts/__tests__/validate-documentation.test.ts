import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateDocumentationRepository } from '../validate-documentation.js';

const temporaryDirectories: string[] = [];

const writeFile = (repositoryRoot: string, relativePath: string, source: string): void => {
  const file = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
};

const createRepositoryFixture = (): string => {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-docs-fixture-'));
  temporaryDirectories.push(repositoryRoot);

  writeFile(repositoryRoot, 'README.md', '[Documentation](docs/README.md)');
  writeFile(repositoryRoot, 'AGENTS.md', '[Documentation](docs/README.md)');
  writeFile(
    repositoryRoot,
    'docs/README.md',
    [
      '[Authoring](workflow-authoring-guide.md)',
      '[Testing](../standards/testing.md)',
      '[Example package](../packages/example/README.md)',
    ].join('\n')
  );
  writeFile(repositoryRoot, 'docs/workflow-authoring-guide.md', '[Hub](README.md)');
  writeFile(repositoryRoot, 'standards/testing.md', '[Hub](../docs/README.md)');
  writeFile(repositoryRoot, 'packages/example/README.md', '[Hub](../../docs/README.md)');
  return repositoryRoot;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('validateDocumentationRepository', () => {
  it('accepts a connected documentation graph with valid local links', () => {
    expect(validateDocumentationRepository(createRepositoryFixture())).toEqual([]);
  });

  it('reports broken local links with their source line', () => {
    const repositoryRoot = createRepositoryFixture();
    writeFile(
      repositoryRoot,
      'docs/workflow-authoring-guide.md',
      ['[Hub](README.md)', '[Missing](missing.md)'].join('\n')
    );

    expect(validateDocumentationRepository(repositoryRoot)).toContainEqual({
      file: 'docs/workflow-authoring-guide.md',
      message: 'Line 2 has a broken local link: missing.md',
    });
  });

  it('accepts valid same-file and cross-file Markdown heading anchors', () => {
    const repositoryRoot = createRepositoryFixture();
    writeFile(
      repositoryRoot,
      'docs/workflow-authoring-guide.md',
      [
        '# Workflow Authoring Guide',
        '[Choose](#choose-a-workflow-shape)',
        '## Choose A Workflow Shape',
        '[Testing](../standards/testing.md#quality-gates)',
      ].join('\n')
    );
    writeFile(repositoryRoot, 'standards/testing.md', '# Testing\n\n## Quality Gates');

    expect(validateDocumentationRepository(repositoryRoot)).toEqual([]);
  });

  it('reports broken Markdown heading anchors with their source line', () => {
    const repositoryRoot = createRepositoryFixture();
    writeFile(
      repositoryRoot,
      'docs/workflow-authoring-guide.md',
      ['# Workflow Authoring Guide', '[Missing](#missing-heading)'].join('\n')
    );

    expect(validateDocumentationRepository(repositoryRoot)).toContainEqual({
      file: 'docs/workflow-authoring-guide.md',
      message: 'Line 2 has a broken Markdown heading anchor: #missing-heading',
    });
  });

  it('reports canonical documents omitted from the documentation hub', () => {
    const repositoryRoot = createRepositoryFixture();
    writeFile(repositoryRoot, 'standards/security.md', '[Hub](../docs/README.md)');

    expect(validateDocumentationRepository(repositoryRoot)).toContainEqual({
      file: 'docs/README.md',
      message: 'Documentation hub must index standards/security.md.',
    });
  });

  it('requires scoped READMEs to link back to the documentation hub', () => {
    const repositoryRoot = createRepositoryFixture();
    writeFile(repositoryRoot, 'apps/runner/README.md', 'No navigation link.');
    writeFile(
      repositoryRoot,
      'docs/README.md',
      `${fs.readFileSync(path.join(repositoryRoot, 'docs/README.md'), 'utf8')}\n[Runner](../apps/runner/README.md)`
    );

    expect(validateDocumentationRepository(repositoryRoot)).toContainEqual({
      file: 'apps/runner/README.md',
      message: 'Scoped README must link back to docs/README.md.',
    });
  });

  it('rejects local links that escape the repository', () => {
    const repositoryRoot = createRepositoryFixture();
    writeFile(repositoryRoot, 'docs/workflow-authoring-guide.md', '[Outside](../../outside.md)');

    expect(validateDocumentationRepository(repositoryRoot)).toContainEqual({
      file: 'docs/workflow-authoring-guide.md',
      message: 'Line 1 links outside the repository: ../../outside.md',
    });
  });
});
