import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { validateRepository } from '../validate-skills.js';

const temporaryDirectories: string[] = [];

const makeRepository = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-skills-'));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, 'skills'));
  return root;
};

interface SkillOptions {
  body?: string;
  metadata?: string;
  adapter?: string;
  evaluations?: unknown;
  extraFiles?: Record<string, string>;
}

const addSkill = (root: string, name: string, options: SkillOptions = {}): void => {
  const directory = path.join(root, 'skills', name);
  fs.mkdirSync(path.join(directory, 'evals'), { recursive: true });
  const metadata = options.metadata ? `metadata:\n${options.metadata}\n` : '';
  fs.writeFileSync(
    path.join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Use this skill for a valid fixture workflow.\n${metadata}---\n\n# ${name}\n\n${options.body ?? 'Follow the documented workflow.'}\n`
  );
  fs.writeFileSync(
    path.join(directory, 'evals', 'evals.json'),
    JSON.stringify(
      options.evaluations ?? {
        skill: name,
        cases: [
          {
            name: 'positive',
            prompt: 'Use the fixture workflow.',
            shouldActivate: true,
            expectedBehaviors: ['Runs the workflow'],
          },
          {
            name: 'negative',
            prompt: 'Do unrelated work.',
            shouldActivate: false,
            expectedBehaviors: ['Does not run the workflow'],
          },
        ],
      },
      null,
      2
    )
  );

  if (options.adapter) {
    fs.mkdirSync(path.join(directory, 'agents'));
    fs.writeFileSync(path.join(directory, 'agents', 'openai.yaml'), options.adapter);
  }
  for (const [relativePath, contents] of Object.entries(options.extraFiles ?? {})) {
    const file = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('validateRepository', () => {
  it('accepts the checked-in repository', () => {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

    expect(validateRepository(repositoryRoot)).toEqual([]);
  });

  it('accepts a portable skill with valid adapter and reference', () => {
    const root = makeRepository();
    addSkill(root, 'example-skill', {
      body: 'Read [the guide](references/guide.md).',
      metadata: '  author: headstart-health\n  version: "0.1.0"',
      adapter: `interface:\n  display_name: "Example Skill"\n  short_description: "Run the portable example skill workflow"\n  default_prompt: "Use $example-skill to run the example."\npolicy:\n  allow_implicit_invocation: true\n`,
      extraFiles: { 'references/guide.md': '# Guide\n' },
    });

    expect(validateRepository(root)).toEqual([]);
  });

  it('reports machine paths, missing references, and malformed evaluations', () => {
    const root = makeRepository();
    addSkill(root, 'unsafe-skill', {
      body: 'Read `/Users/example/private/file.md` and [missing](references/missing.md).',
      evaluations: {
        skill: 'wrong-name',
        cases: [
          {
            name: 'only-case',
            prompt: '',
            shouldActivate: true,
            expectedBehaviors: [],
          },
        ],
      },
    });

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(messages).toContain('Contains a machine-specific macOS user path.');
    expect(messages).toContain('Referenced file does not exist: references/missing.md.');
    expect(messages).toContain('Evaluation skill must match SKILL.md name.');
    expect(messages).toContain('At least two evaluation cases are required.');
  });

  it('reports missing and circular dependencies', () => {
    const root = makeRepository();
    addSkill(root, 'first-skill', {
      metadata: '  headstart-requires: second-skill,missing-skill',
    });
    addSkill(root, 'second-skill', {
      metadata: '  headstart-requires: first-skill',
    });

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(messages).toContain('Declared dependency does not exist: missing-skill.');
    expect(messages.some((message) => message.startsWith('Skill dependency cycle:'))).toBe(true);
  });

  it('reports invalid frontmatter and adapter fields', () => {
    const root = makeRepository();
    addSkill(root, 'adapter-skill', {
      metadata: '  version: 1',
      adapter: `interface:\n  display_name: ""\n  short_description: "short"\n  default_prompt: "Run it"\npolicy:\n  allow_implicit_invocation: "yes"\n`,
    });

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(messages).toContain('metadata.version must be a string.');
    expect(messages).toContain('interface.display_name must be a string.');
    expect(messages).toContain('interface.short_description must be 25-64 characters.');
    expect(messages).toContain('interface.default_prompt must mention $adapter-skill.');
    expect(messages).toContain(
      'policy.allow_implicit_invocation must be boolean when policy is present.'
    );
  });

  it('reports a missing skills directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-skills-empty-'));
    temporaryDirectories.push(root);

    expect(validateRepository(root)).toEqual([
      { file: 'skills', message: 'skills directory does not exist.' },
    ]);
  });

  it('reports malformed and missing skill structure', () => {
    const root = makeRepository();
    fs.writeFileSync(path.join(root, 'skills', 'unexpected.txt'), 'unexpected');
    fs.mkdirSync(path.join(root, 'skills', 'missing-entrypoint'));
    const malformedDirectory = path.join(root, 'skills', 'malformed-skill');
    fs.mkdirSync(malformedDirectory);
    fs.writeFileSync(path.join(malformedDirectory, 'SKILL.md'), 'no frontmatter');
    const invalidYamlDirectory = path.join(root, 'skills', 'invalid-yaml');
    fs.mkdirSync(invalidYamlDirectory);
    fs.writeFileSync(path.join(invalidYamlDirectory, 'SKILL.md'), '---\nname: [\n---\nbody');
    const listDirectory = path.join(root, 'skills', 'list-frontmatter');
    fs.mkdirSync(listDirectory);
    fs.writeFileSync(path.join(listDirectory, 'SKILL.md'), '---\n- item\n---\nbody');

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(messages).toContain('Unexpected file in skills root.');
    expect(messages).toContain('Skill directory requires SKILL.md.');
    expect(messages).toContain('SKILL.md must contain YAML frontmatter.');
    expect(
      messages.some((message) => message.startsWith('Skill frontmatter is not valid YAML:'))
    ).toBe(true);
    expect(messages).toContain('Skill frontmatter must be a YAML mapping.');
  });

  it('reports invalid portable frontmatter and sensitive files', () => {
    const root = makeRepository();
    const directory = path.join(root, 'skills', 'frontmatter-skill');
    fs.mkdirSync(path.join(directory, 'evals'), { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'SKILL.md'),
      `---\nname: Wrong_Name\ndescription: ${'x'.repeat(1025)}\ncompatibility: 42\nmetadata:\n  github-source: copied\n  headstart-requires: "frontmatter-skill,frontmatter-skill"\n---\n${'line\n'.repeat(501)}`
    );
    fs.writeFileSync(path.join(directory, '.env'), 'SECRET=value');
    fs.writeFileSync(
      path.join(directory, 'evals', 'evals.json'),
      JSON.stringify({
        skill: 'Wrong_Name',
        cases: [
          {
            name: 'positive',
            prompt: 'Use it',
            shouldActivate: true,
            expectedBehaviors: ['Runs'],
          },
          {
            name: 'negative',
            prompt: 'Skip it',
            shouldActivate: false,
            expectedBehaviors: ['Skips'],
          },
        ],
      })
    );

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(messages).toContain('name must be 1-64 lowercase alphanumeric or hyphen characters.');
    expect(messages).toContain('description must not exceed 1024 characters.');
    expect(messages).toContain('compatibility must be a string when present.');
    expect(messages).toContain(
      'metadata.github-source is installation metadata and must not be committed.'
    );
    expect(messages).toContain('headstart-requires contains duplicates.');
    expect(messages.some((message) => message.includes('maximum is 500'))).toBe(true);
    expect(messages).toContain('Sensitive environment or key file must not be committed.');
  });

  it('reports detailed evaluation and adapter failures', () => {
    const root = makeRepository();
    addSkill(root, 'evaluation-skill', {
      adapter: 'interface: [\n',
      evaluations: {
        skill: 'evaluation-skill',
        cases: [
          'not-an-object',
          {
            name: 'duplicate',
            prompt: '',
            shouldActivate: 'yes',
            expectedBehaviors: [],
          },
          {
            name: 'duplicate',
            prompt: 'Still positive',
            shouldActivate: true,
            expectedBehaviors: [7],
          },
        ],
      },
    });

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(
      messages.some((message) => message.startsWith('OpenAI adapter is not valid YAML:'))
    ).toBe(true);
    expect(messages).toContain('Every evaluation case must be an object.');
    expect(messages).toContain('Every evaluation case needs a prompt.');
    expect(messages).toContain('Every evaluation case needs boolean shouldActivate.');
    expect(messages).toContain('Every evaluation case needs string expectedBehaviors.');
    expect(messages).toContain('Duplicate evaluation case: duplicate.');
    expect(messages).toContain(
      'Evaluation cases must include activating and non-activating prompts.'
    );
  });

  it('reports absent or malformed evaluation files and self-dependency', () => {
    const root = makeRepository();
    addSkill(root, 'missing-evals', { metadata: '  headstart-requires: missing-evals' });
    fs.rmSync(path.join(root, 'skills', 'missing-evals', 'evals', 'evals.json'));
    addSkill(root, 'invalid-evals');
    fs.writeFileSync(path.join(root, 'skills', 'invalid-evals', 'evals', 'evals.json'), '{');
    addSkill(root, 'array-evals');
    fs.writeFileSync(path.join(root, 'skills', 'array-evals', 'evals', 'evals.json'), '[]');

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(messages).toContain('Every skill requires evals/evals.json.');
    expect(
      messages.some((message) => message.startsWith('Evaluation file is not valid JSON:'))
    ).toBe(true);
    expect(messages).toContain('Evaluation file must be a JSON object.');
    expect(messages).toContain('A skill cannot depend on itself.');
  });

  it('keeps the README skill inventory aligned with canonical skill directories', () => {
    const root = makeRepository();
    addSkill(root, 'first-skill');
    addSkill(root, 'second-skill');
    fs.writeFileSync(
      path.join(root, 'README.md'),
      '# Fixture\n\n## Included Skills\n\n| Skill | Purpose |\n| --- | --- |\n| `first-skill` | Included |\n| `retired-skill` | Stale |\n\n## Other\n'
    );

    const messages = validateRepository(root).map((issue) => issue.message);
    expect(messages).toContain('Included Skills table is missing: second-skill.');
    expect(messages).toContain('Included Skills table references an unknown skill: retired-skill.');
  });

  it('reports a missing README skill inventory section when a README exists', () => {
    const root = makeRepository();
    addSkill(root, 'example-skill');
    fs.writeFileSync(path.join(root, 'README.md'), '# Fixture\n');

    expect(validateRepository(root).map((issue) => issue.message)).toContain(
      'README.md requires an Included Skills section.'
    );
  });
});
