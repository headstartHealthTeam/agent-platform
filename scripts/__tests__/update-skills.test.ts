import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { withoutRepositoryLocalGitEnvironment } from '../run-python-tests.js';
import { GIT_COMMAND_TIMEOUT, gitWorkflowTestTimeoutForPlatform } from '../test-timeouts.js';
import {
  inspectUpdate,
  isExpectedRemote,
  normalizeRemoteIdentity,
  parseUpdateArgs,
  printUpdatePlan,
  runSkillsUpdate,
} from '../update-skills.js';

const temporaryDirectories: string[] = [];
const gitWorkflowTestTimeout = gitWorkflowTestTimeoutForPlatform(process.platform);

const runGit = (cwd: string, arguments_: string[]): string => {
  const result = spawnSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    env: withoutRepositoryLocalGitEnvironment(process.env),
    timeout: GIT_COMMAND_TIMEOUT,
  });
  if (result.error) {
    throw new Error(
      `Fixture Git command failed: git ${arguments_.join(' ')}\n${result.error.message}`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Fixture Git command failed: git ${arguments_.join(' ')}\n${result.stderr.trim()}`
    );
  }
  return result.stdout.trim();
};

const writeSkill = (repositoryRoot: string, version: string, skillName = 'sample-skill'): void => {
  const skillRoot = path.join(repositoryRoot, 'skills', skillName);
  fs.mkdirSync(path.join(skillRoot, 'evals'), { recursive: true });
  fs.writeFileSync(
    path.join(skillRoot, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: Use when testing skill updates.\n---\n\n# Sample Skill\n\nVersion ${version}.\n`
  );
  fs.writeFileSync(
    path.join(skillRoot, 'evals', 'evals.json'),
    `${JSON.stringify(
      {
        skill: skillName,
        cases: [
          {
            name: 'positive',
            prompt: 'Update the sample skill.',
            shouldActivate: true,
            expectedBehaviors: ['Updates the skill'],
          },
          {
            name: 'near-miss',
            prompt: 'Review unrelated code.',
            shouldActivate: false,
            expectedBehaviors: ['Does not activate'],
          },
        ],
      },
      null,
      2
    )}\n`
  );
};

interface GitFixture {
  bare: string;
  client: string;
  seed: string;
  home: string;
}

const commitAll = (repositoryRoot: string, message: string): void => {
  runGit(repositoryRoot, ['add', '.']);
  runGit(repositoryRoot, ['-c', 'commit.gpgSign=false', 'commit', '-m', message]);
};

const makeGitFixture = (): GitFixture => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-skills-update-'));
  temporaryDirectories.push(root);
  const bare = path.join(root, 'remote.git');
  const seed = path.join(root, 'seed');
  const client = path.join(root, 'client');
  const home = path.join(root, 'home');

  fs.mkdirSync(seed);
  fs.mkdirSync(home);
  runGit(root, ['init', '--bare', bare]);
  runGit(seed, ['init', '-b', 'main']);
  runGit(seed, ['config', 'user.name', 'Synthetic Test User']);
  runGit(seed, ['config', 'user.email', 'synthetic@example.invalid']);
  writeSkill(seed, '1');
  commitAll(seed, 'initial skill');
  runGit(seed, ['remote', 'add', 'origin', bare]);
  runGit(seed, ['push', '-u', 'origin', 'main']);
  runGit(root, ['--git-dir', bare, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  runGit(root, ['clone', bare, client]);
  runGit(client, ['config', 'user.name', 'Synthetic Test User']);
  runGit(client, ['config', 'user.email', 'synthetic@example.invalid']);

  return { bare, client, seed, home };
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('parseUpdateArgs', () => {
  it('defaults to preview and requires an explicit apply flag', () => {
    expect(parseUpdateArgs(['--agent', 'codex'])).toEqual({
      agent: 'codex',
      apply: false,
      scheduled: false,
    });
    expect(
      parseUpdateArgs(['--agent', 'cursor', '--apply', '--expected-commit', 'a'.repeat(40)])
    ).toEqual({
      agent: 'cursor',
      apply: true,
      expectedCommit: 'a'.repeat(40),
      scheduled: false,
    });
    expect(parseUpdateArgs(['--agent', 'claude-code', '--apply', '--scheduled'])).toEqual({
      agent: 'claude-code',
      apply: true,
      scheduled: true,
    });
    expect(parseUpdateArgs(['--', '--agent', 'codex', '--dry-run'])).toEqual({
      agent: 'codex',
      apply: false,
      scheduled: false,
    });
  });

  it('rejects ambiguous modes and unsupported arguments', () => {
    expect(() => parseUpdateArgs(['--agent', 'codex', '--dry-run', '--apply'])).toThrow(
      'Choose either'
    );
    expect(() => parseUpdateArgs(['--agent', 'other'])).toThrow('Unsupported agent host');
    expect(() => parseUpdateArgs(['--agent', 'codex', '--force'])).toThrow('Unknown argument');
    expect(() => parseUpdateArgs(['--agent', 'codex', '--apply'])).toThrow(
      'require --expected-commit'
    );
    expect(() => parseUpdateArgs([])).toThrow('--agent is required');
    expect(() => parseUpdateArgs(['--agent'])).toThrow('requires a value');
    expect(() =>
      parseUpdateArgs(['--agent', 'codex', '--apply', '--expected-commit', 'short'])
    ).toThrow('full Git commit SHA');
    expect(() => parseUpdateArgs(['--agent', 'codex', '--scheduled'])).toThrow('require --apply');
    expect(() =>
      parseUpdateArgs([
        '--agent',
        'codex',
        '--apply',
        '--scheduled',
        '--expected-commit',
        'a'.repeat(40),
      ])
    ).toThrow('cannot use --expected-commit');
  });
});

describe('normalizeRemoteIdentity', () => {
  it('treats common GitHub URL forms as the same repository', () => {
    const expected = 'github.com/headstarthealthteam/agent-platform';
    expect(
      normalizeRemoteIdentity('https://github.com/headstartHealthTeam/agent-platform.git')
    ).toBe(expected);
    expect(normalizeRemoteIdentity('git@github.com:headstartHealthTeam/agent-platform.git')).toBe(
      expected
    );
    expect(normalizeRemoteIdentity('ssh://git@github.com/headstartHealthTeam/agent-platform')).toBe(
      expected
    );
    expect(normalizeRemoteIdentity('https://github.com/headstartHealthTeam/agent-platform/')).toBe(
      expected
    );
    expect(normalizeRemoteIdentity('./agent-skills')).toContain('file:');
    expect(normalizeRemoteIdentity(`file://${path.resolve('/tmp/agent-skills')}`)).toContain(
      'file:'
    );
  });

  it('accepts the canonical remote by default without weakening custom checks', () => {
    expect(isExpectedRemote('https://github.com/headstartHealthTeam/agent-platform.git')).toBe(
      true
    );
    expect(isExpectedRemote('git@github.com:headstartHealthTeam/agent-platform.git')).toBe(true);
    expect(isExpectedRemote('https://github.com/other/agent-platform.git')).toBe(false);
    expect(isExpectedRemote('/tmp/canonical.git', '/tmp/canonical.git')).toBe(true);
  });
});

describe('update plan output', () => {
  it('reports both empty and populated update details', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const basePlan = {
      repositoryRoot: '/repository',
      localCommit: 'a'.repeat(40),
      remoteCommit: 'a'.repeat(40),
      incomingCommits: [],
      changedSkills: [],
      changedFileCount: 0,
      canonicalSkills: ['sample-skill'],
      managedInstallation: true,
      unmanagedExistingSkills: [],
    };

    printUpdatePlan(basePlan);
    printUpdatePlan({
      ...basePlan,
      remoteCommit: 'b'.repeat(40),
      incomingCommits: ['abc123 update sample'],
      changedSkills: ['sample-skill'],
      changedFileCount: 2,
      managedInstallation: false,
      unmanagedExistingSkills: ['sample-skill'],
    });

    expect(log).toHaveBeenCalledWith('Incoming commits: none');
    expect(log).toHaveBeenCalledWith('  abc123 update sample');
    expect(log).toHaveBeenCalledWith('Changed skills: sample-skill');
    expect(log).toHaveBeenCalledWith('Existing unreceipted skill names: sample-skill');
  });
});

describe('skills update workflow', { timeout: gitWorkflowTestTimeout }, () => {
  it('previews and applies a fast-forward update without touching unrelated skills', () => {
    const fixture = makeGitFixture();
    writeSkill(fixture.seed, '2');
    writeSkill(fixture.seed, '1', 'new-skill');
    commitAll(fixture.seed, 'update skill');
    runGit(fixture.seed, ['push', 'origin', 'main']);
    const installedRoot = path.join(fixture.home, '.agents', 'skills');
    const unrelatedSkill = path.join(installedRoot, 'unrelated-local-skill');
    fs.mkdirSync(unrelatedSkill, { recursive: true });
    fs.writeFileSync(path.join(unrelatedSkill, 'SKILL.md'), '# Unrelated\n');

    const preview = inspectUpdate(fixture.client, {
      expectedRemoteIdentity: fixture.bare,
    });
    expect(preview.incomingCommits).toHaveLength(1);
    expect(preview.changedSkills).toEqual(['new-skill', 'sample-skill']);
    expect(runGit(fixture.client, ['rev-parse', 'HEAD'])).toBe(preview.localCommit);

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = runSkillsUpdate(
      fixture.client,
      {
        agent: 'codex',
        apply: true,
        expectedCommit: preview.remoteCommit,
        scheduled: false,
      },
      {
        expectedRemoteIdentity: fixture.bare,
        homeDirectory: fixture.home,
        now: () => new Date('2026-08-06T12:00:00.000Z'),
      }
    );

    expect(result.receipt).toMatchObject({
      agent: 'codex',
      commit: preview.remoteCommit,
      skills: ['new-skill', 'sample-skill'],
    });
    expect(fs.readFileSync(path.join(installedRoot, 'sample-skill', 'SKILL.md'), 'utf8')).toContain(
      'Version 2'
    );
    expect(fs.existsSync(path.join(unrelatedSkill, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(installedRoot, 'new-skill', 'SKILL.md'))).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(installedRoot, '.headstart-agent-skills.json'), 'utf8'))
    ).toMatchObject({
      commit: preview.remoteCommit,
      skills: ['new-skill', 'sample-skill'],
    });

    fs.rmSync(path.join(fixture.seed, 'skills', 'sample-skill'), {
      recursive: true,
      force: true,
    });
    commitAll(fixture.seed, 'retire sample skill');
    runGit(fixture.seed, ['push', 'origin', 'main']);
    const retirementPreview = inspectUpdate(fixture.client, {
      expectedRemoteIdentity: fixture.bare,
    });
    runSkillsUpdate(
      fixture.client,
      {
        agent: 'codex',
        apply: true,
        expectedCommit: retirementPreview.remoteCommit,
        scheduled: false,
      },
      {
        expectedRemoteIdentity: fixture.bare,
        homeDirectory: fixture.home,
        now: () => new Date('2026-08-07T12:00:00.000Z'),
      }
    );

    expect(fs.existsSync(path.join(installedRoot, 'sample-skill'))).toBe(false);
    expect(fs.existsSync(path.join(installedRoot, 'new-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(unrelatedSkill, 'SKILL.md'))).toBe(true);
  });

  it('refuses dirty, ahead, and unexpected checkouts', () => {
    const fixture = makeGitFixture();
    fs.writeFileSync(path.join(fixture.client, 'uncommitted.txt'), 'dirty\n');
    expect(() => inspectUpdate(fixture.client, { expectedRemoteIdentity: fixture.bare })).toThrow(
      'dirty checkout'
    );

    fs.rmSync(path.join(fixture.client, 'uncommitted.txt'));
    fs.writeFileSync(path.join(fixture.client, 'local.txt'), 'ahead\n');
    commitAll(fixture.client, 'local commit');
    expect(() => inspectUpdate(fixture.client, { expectedRemoteIdentity: fixture.bare })).toThrow(
      'is ahead of'
    );
    expect(() => inspectUpdate(fixture.client)).toThrow('unexpected origin');
  });

  it('requires a managed receipt before unattended scheduled updates', () => {
    const fixture = makeGitFixture();

    expect(() =>
      runSkillsUpdate(
        fixture.client,
        { agent: 'codex', apply: true, scheduled: true },
        { expectedRemoteIdentity: fixture.bare, homeDirectory: fixture.home }
      )
    ).toThrow('prior managed installation');
    expect(runGit(fixture.client, ['rev-parse', 'HEAD'])).toBe(
      runGit(fixture.seed, ['rev-parse', 'HEAD'])
    );
  });

  it('rejects invalid incoming source without advancing local main', () => {
    const fixture = makeGitFixture();
    const localCommit = runGit(fixture.client, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(fixture.seed, 'skills', 'sample-skill', 'SKILL.md'), 'invalid\n');
    commitAll(fixture.seed, 'publish invalid skill');
    runGit(fixture.seed, ['push', 'origin', 'main']);

    expect(() =>
      runSkillsUpdate(
        fixture.client,
        { agent: 'codex', apply: false, scheduled: false },
        { expectedRemoteIdentity: fixture.bare, homeDirectory: fixture.home }
      )
    ).toThrow('Refusing invalid source');
    expect(runGit(fixture.client, ['rev-parse', 'HEAD'])).toBe(localCommit);
  });

  it('requires another preview when remote main advances before manual apply', () => {
    const fixture = makeGitFixture();
    const preview = runSkillsUpdate(
      fixture.client,
      { agent: 'codex', apply: false, scheduled: false },
      { expectedRemoteIdentity: fixture.bare, homeDirectory: fixture.home }
    ).plan;
    writeSkill(fixture.seed, '2');
    commitAll(fixture.seed, 'advance after preview');
    runGit(fixture.seed, ['push', 'origin', 'main']);

    expect(() =>
      runSkillsUpdate(
        fixture.client,
        {
          agent: 'codex',
          apply: true,
          expectedCommit: preview.remoteCommit,
          scheduled: false,
        },
        { expectedRemoteIdentity: fixture.bare, homeDirectory: fixture.home }
      )
    ).toThrow('Preview again before applying');
    expect(runGit(fixture.client, ['rev-parse', 'HEAD'])).toBe(preview.localCommit);
  });
});
