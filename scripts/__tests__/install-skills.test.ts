import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createInstallPlan,
  installSkills,
  parseInstallArgs,
  resolveInstallRoot,
  type InstallOptions,
} from '../install-skills.js';

const temporaryDirectories: string[] = [];

const makeSourceRepository = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-installer-'));
  temporaryDirectories.push(root);
  for (const skillName of ['first-skill', 'second-skill']) {
    const directory = path.join(root, 'skills', skillName);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `# ${skillName}\n`);
  }
  return root;
};

const options = (overrides: Partial<InstallOptions> = {}): InstallOptions => ({
  agent: 'codex',
  scope: 'user',
  projectDirectory: '/workspace',
  skillNames: [],
  all: true,
  dryRun: true,
  force: false,
  ...overrides,
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('parseInstallArgs', () => {
  it('parses a user-scoped selected skill install', () => {
    expect(
      parseInstallArgs(
        [
          '--',
          '--agent',
          'claude-code',
          '--scope',
          'user',
          '--skill',
          'deep-pr-review',
          '--dry-run',
        ],
        '/workspace'
      )
    ).toEqual({
      agent: 'claude-code',
      scope: 'user',
      projectDirectory: '/workspace',
      skillNames: ['deep-pr-review'],
      all: false,
      dryRun: true,
      force: false,
    });
  });

  it('rejects ambiguous selection and unsupported hosts', () => {
    expect(() => parseInstallArgs(['--agent', 'other', '--scope', 'user', '--all'])).toThrow(
      'Unsupported agent host'
    );
    expect(() =>
      parseInstallArgs(['--agent', 'codex', '--scope', 'user', '--all', '--skill', 'first-skill'])
    ).toThrow('Choose exactly one');
    expect(() => parseInstallArgs(['--agent', 'codex', '--scope', 'invalid', '--all'])).toThrow(
      'Unsupported install scope'
    );
    expect(() => parseInstallArgs(['--agent', 'codex', '--scope', 'user'])).toThrow(
      'Choose exactly one'
    );
    expect(() => parseInstallArgs(['--agent'])).toThrow('requires a value');
    expect(() => parseInstallArgs(['--unknown'])).toThrow('Unknown argument');
  });

  it('parses project directories, replacement approval, and duplicate skill selection', () => {
    expect(
      parseInstallArgs(
        [
          '--agent',
          'cursor',
          '--scope',
          'project',
          '--project-dir',
          './fixture',
          '--skill',
          'first-skill',
          '--skill',
          'first-skill',
          '--force',
        ],
        '/workspace'
      )
    ).toEqual({
      agent: 'cursor',
      scope: 'project',
      projectDirectory: path.resolve('./fixture'),
      skillNames: ['first-skill'],
      all: false,
      dryRun: false,
      force: true,
    });
  });
});

describe('resolveInstallRoot', () => {
  it('uses shared project skills for Codex and Cursor', () => {
    expect(resolveInstallRoot('codex', 'project', '/repo', '/home')).toBe(
      path.join('/repo', '.agents', 'skills')
    );
    expect(resolveInstallRoot('cursor', 'project', '/repo', '/home')).toBe(
      path.join('/repo', '.agents', 'skills')
    );
  });

  it('uses host-specific user directories', () => {
    expect(resolveInstallRoot('codex', 'user', '/repo', '/home')).toBe(
      path.join('/home', '.agents', 'skills')
    );
    expect(resolveInstallRoot('claude-code', 'user', '/repo', '/home')).toBe(
      path.join('/home', '.claude', 'skills')
    );
    expect(resolveInstallRoot('cursor', 'user', '/repo', '/home')).toBe(
      path.join('/home', '.cursor', 'skills')
    );
  });
});

describe('skill installation', () => {
  it('plans all skills in deterministic order', () => {
    const root = makeSourceRepository();
    const plan = createInstallPlan(root, options(), '/home');

    expect(plan.map((operation) => operation.skillName)).toEqual(['first-skill', 'second-skill']);
    expect(plan[0]?.destination).toBe(path.join('/home', '.agents', 'skills', 'first-skill'));
    expect(() =>
      createInstallPlan(root, options({ all: false, skillNames: ['missing-skill'] }), '/home')
    ).toThrow('Unknown skill');
  });

  it('copies a selected skill and refuses an unapproved replacement', () => {
    const root = makeSourceRepository();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-installer-home-'));
    temporaryDirectories.push(home);
    const installOptions = options({
      skillNames: ['first-skill'],
      all: false,
      dryRun: false,
    });
    const firstPlan = createInstallPlan(root, installOptions, home);
    installSkills(firstPlan, installOptions);

    const installedFile = path.join(home, '.agents', 'skills', 'first-skill', 'SKILL.md');
    expect(fs.readFileSync(installedFile, 'utf8')).toContain('first-skill');

    const replacementPlan = createInstallPlan(root, installOptions, home);
    expect(() => {
      installSkills(replacementPlan, { ...installOptions, dryRun: true });
    }).not.toThrow();
    expect(() => {
      installSkills(replacementPlan, installOptions);
    }).toThrow('already exists');

    fs.writeFileSync(path.join(root, 'skills', 'first-skill', 'SKILL.md'), '# replaced\n');
    installSkills(createInstallPlan(root, installOptions, home), {
      ...installOptions,
      force: true,
    });
    expect(fs.readFileSync(installedFile, 'utf8')).toBe('# replaced\n');
    expect(
      fs
        .readdirSync(path.dirname(path.dirname(installedFile)))
        .some((entry) => entry.includes('.backup-'))
    ).toBe(false);
  });
});
