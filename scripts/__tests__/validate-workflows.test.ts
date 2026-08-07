import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { validateWorkflowRepository } from '../validate-workflows.js';

const temporaryDirectories: string[] = [];

const checkedInRepositoryRoot = (): string =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const copyRepositoryFixture = (): string => {
  const source = checkedInRepositoryRoot();
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-workflows-fixture-'));
  temporaryDirectories.push(destination);
  fs.copyFileSync(path.join(source, 'README.md'), path.join(destination, 'README.md'));
  fs.cpSync(path.join(source, 'skills'), path.join(destination, 'skills'), { recursive: true });
  fs.cpSync(path.join(source, 'workflows'), path.join(destination, 'workflows'), {
    recursive: true,
  });
  return destination;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('validateWorkflowRepository', () => {
  it('accepts the checked-in managed workflow packages', () => {
    expect(validateWorkflowRepository(checkedInRepositoryRoot())).toEqual([]);
  });

  it('reports a missing workflows directory', () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-workflows-empty-'));
    temporaryDirectories.push(repositoryRoot);

    expect(validateWorkflowRepository(repositoryRoot)).toEqual([
      { file: 'workflows', message: 'workflows directory does not exist.' },
    ]);
  });

  it('reports incomplete package metadata, prompts, and required skills together', () => {
    const repositoryRoot = copyRepositoryFixture();
    const workflowRoot = path.join(repositoryRoot, 'workflows', 'synthetic-read-only-reference');
    fs.rmSync(path.join(workflowRoot, 'package.json'));
    fs.rmSync(path.join(workflowRoot, 'README.md'));
    fs.writeFileSync(path.join(workflowRoot, 'prompts', 'run.md'), '   ');
    fs.rmSync(path.join(repositoryRoot, 'skills', 'headstart-document-review'), {
      recursive: true,
    });

    const messages = validateWorkflowRepository(repositoryRoot).map((issue) => issue.message);

    expect(messages).toEqual(
      expect.arrayContaining([
        'Managed workflow requires package.json.',
        'Managed workflow requires README.md.',
        'Workflow entrypoint prompt must not be empty.',
        'Required skill does not exist: headstart-document-review.',
      ])
    );
  });

  it('requires contract fixtures and workflow evaluation definitions', () => {
    const repositoryRoot = copyRepositoryFixture();
    const workflowRoot = path.join(repositoryRoot, 'workflows', 'synthetic-read-only-reference');
    fs.rmSync(path.join(workflowRoot, 'fixtures', 'input.valid.json'));
    fs.rmSync(path.join(workflowRoot, 'fixtures', 'output.valid.json'));
    fs.rmSync(path.join(workflowRoot, 'evals', 'evals.json'));

    expect(validateWorkflowRepository(repositoryRoot)).toEqual(
      expect.arrayContaining([
        {
          file: 'workflows/synthetic-read-only-reference/fixtures/input.valid.json',
          message: 'Managed workflow requires this JSON file.',
        },
        {
          file: 'workflows/synthetic-read-only-reference/fixtures/output.valid.json',
          message: 'Managed workflow requires this JSON file.',
        },
        {
          file: 'workflows/synthetic-read-only-reference/evals/evals.json',
          message: 'Managed workflow requires this JSON file.',
        },
      ])
    );
  });

  it('validates fixture schemas and evaluation boundary coverage', () => {
    const repositoryRoot = copyRepositoryFixture();
    const workflowRoot = path.join(repositoryRoot, 'workflows', 'synthetic-read-only-reference');
    fs.writeFileSync(path.join(workflowRoot, 'fixtures', 'input.valid.json'), '{}');
    fs.writeFileSync(
      path.join(workflowRoot, 'evals', 'evals.json'),
      JSON.stringify({
        workflow: 'synthetic-read-only-reference',
        cases: [
          {
            name: 'first happy path',
            category: 'happy-path',
            input: { documentExcerpt: 'Synthetic input.' },
            expectedOutcome: 'success',
            expectedBehaviors: ['Returns a result.'],
          },
          {
            name: 'second happy path',
            category: 'happy-path',
            input: {},
            expectedOutcome: 'success',
            expectedBehaviors: ['Returns a result.'],
          },
        ],
      })
    );

    const messages = validateWorkflowRepository(repositoryRoot).map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Input fixture does not satisfy the workflow schema:/),
        expect.stringMatching(/^Evaluation case second happy path has invalid input:/),
        'Managed workflow evaluations require a boundary case.',
      ])
    );
  });

  it('blocks active workflow packages until runtime capability materialization is enforced', () => {
    const repositoryRoot = copyRepositoryFixture();
    const manifestFile = path.join(
      repositoryRoot,
      'workflows',
      'synthetic-read-only-reference',
      'workflow.yaml'
    );
    const manifest = fs
      .readFileSync(manifestFile, 'utf8')
      .replace('lifecycle: draft', 'lifecycle: active')
      .replace(
        'name: Example business owner\n      team: Example team',
        'name: Example business owner\n      team: Example team\n      contact: example-business-owner'
      )
      .replace(
        'name: Example technical steward\n      team: Engineering',
        [
          'name: Example technical steward',
          '      team: Engineering',
          '      contact: example-technical-owner',
          '    backup:',
          '      name: Example backup owner',
          '      team: Engineering',
          '      contact: example-backup-owner',
        ].join('\n')
      )
      .replace('id: configured-at-deployment', 'id: gpt-example')
      .replace('revision: workspace', `revision: ${'a'.repeat(40)}`);
    fs.writeFileSync(manifestFile, manifest);

    expect(validateWorkflowRepository(repositoryRoot)).toContainEqual({
      file: 'workflows/synthetic-read-only-reference/workflow.yaml',
      message:
        'Active managed workflows are blocked until isolated workspace, skill, tool, and environment materialization is enforced.',
    });
  });

  it('reconciles workflow directories with the root README inventory', () => {
    const repositoryRoot = copyRepositoryFixture();
    const readmeFile = path.join(repositoryRoot, 'README.md');
    const readme = fs.readFileSync(readmeFile, 'utf8');
    fs.writeFileSync(
      readmeFile,
      readme.replace(
        /^\| .*synthetic-read-only-reference.*$/m,
        '| `documented-but-missing` | Missing fixture |'
      )
    );

    const messages = validateWorkflowRepository(repositoryRoot).map((issue) => issue.message);

    expect(messages).toContain(
      'Managed Workflows table is missing: synthetic-read-only-reference.'
    );
    expect(messages).toContain(
      'Managed Workflows table references an unknown workflow: documented-but-missing.'
    );
  });

  it('reports unexpected files in the workflows root', () => {
    const repositoryRoot = copyRepositoryFixture();
    fs.writeFileSync(path.join(repositoryRoot, 'workflows', 'unexpected.txt'), 'Synthetic file.');

    expect(validateWorkflowRepository(repositoryRoot)).toContainEqual({
      file: 'workflows/unexpected.txt',
      message: 'Unexpected file in workflows root.',
    });
  });
});
