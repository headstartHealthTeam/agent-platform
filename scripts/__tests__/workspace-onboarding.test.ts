import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportGitSnapshot } from '../git-snapshot.js';
import { withoutRepositoryLocalGitEnvironment } from '../run-python-tests.js';
import { gitWorkflowTestTimeoutForPlatform } from '../test-timeouts.js';
import { parseWorkspaceArgs, runWorkspace } from '../workspace-cli.js';
import {
  applyFiles,
  atomicWrite,
  digest,
  planFiles,
  readRegularFile,
  templateDiff,
  templatePlanToken,
  withWorkspaceLock,
} from '../workspace-files.js';
import { runWorkspaceGit, type WorkspaceGit } from '../workspace-git.js';
import { applyHostRouting, installedHosts, planHostRouting } from '../workspace-hosts.js';
import { readKnowledge, searchKnowledge } from '../workspace-knowledge.js';
import { installWorkspaceRuntime, workspaceSource } from '../workspace-runtime.js';

const revision = 'a'.repeat(40);
const temporaryDirectories: string[] = [];
const fixture = (): string => {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-onboarding-'))
  );
  temporaryDirectories.push(directory);
  return directory;
};
const write = (root: string, file: string, content: string): void => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const read = (root: string, file: string): string => fs.readFileSync(path.join(root, file), 'utf8');

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('ownership-aware template upgrades', () => {
  it('upgrades the original receipt format and rejects changes after a reviewed preview', () => {
    const root = fixture();
    const templates = new Map([['guide.md', 'new guidance']]);
    write(root, 'guide.md', 'old guidance');
    write(
      root,
      '.headstart/receipt.json',
      JSON.stringify({
        version: 1,
        sourceRevision: revision,
        files: [{ path: 'guide.md', sha256: digest('old guidance') }],
      })
    );
    const options = { upgrade: true, templates };
    const token = templatePlanToken(root, revision, options);
    write(root, 'guide.md', 'newer operator guidance');
    expect(() => applyFiles(root, revision, options, token)).toThrow('no files were changed');
    write(root, 'guide.md', 'old guidance');
    applyFiles(root, revision, options, token);
    expect(read(root, '.headstart/receipt.json')).toContain('"version": 2');
    expect(read(root, 'guide.md')).toBe('new guidance');
  });
  it('previews a real change, pins the reviewed plan and preserves local edits', () => {
    const root = fixture();
    const original = new Map([
      ['AGENTS.md', 'old\n'],
      ['Headstart/index.md', 'index\n'],
    ]);
    applyFiles(root, revision, { templates: original });
    write(root, 'Headstart/index.md', 'our knowledge\n');
    const templates = new Map([
      ['AGENTS.md', 'new\n'],
      ['Headstart/index.md', 'index\n'],
    ]);
    const options = { upgrade: true, templates };
    expect(planFiles(root, options).map((item) => item.action)).toEqual(['update', 'preserve']);
    expect(templateDiff(root, 'AGENTS.md', 'new\n')).toContain('-old\n+new');
    const token = templatePlanToken(root, revision, options);
    expect(() => applyFiles(root, revision, options, 'stale')).toThrow('expected-plan');
    expect(read(root, 'AGENTS.md')).toBe('old\n');
    applyFiles(root, revision, options, token);
    expect(read(root, 'AGENTS.md')).toBe('new\n');
    expect(read(root, 'Headstart/index.md')).toBe('our knowledge\n');
    expect(planFiles(root, options).map((item) => item.action)).toEqual(['unchanged', 'preserve']);
  });

  it('requires an explicit keep-local choice when both template and user content changed', () => {
    const root = fixture();
    applyFiles(root, revision, { templates: new Map([['AGENTS.md', 'old']]) });
    write(root, 'AGENTS.md', 'custom');
    const options = { upgrade: true, templates: new Map([['AGENTS.md', 'new']]) };
    expect(planFiles(root, options).at(0)?.action).toBe('conflict');
    expect(() =>
      applyFiles(root, revision, options, templatePlanToken(root, revision, options))
    ).toThrow('no files were changed');
    const keep = { ...options, keepLocal: ['AGENTS.md'] };
    applyFiles(root, revision, keep, templatePlanToken(root, revision, keep));
    expect(read(root, 'AGENTS.md')).toBe('custom');
    expect(planFiles(root, options).at(0)?.action).toBe('preserve');
    expect(() => planFiles(root, { ...options, keepLocal: ['unowned.md'] })).toThrow('owned');
  });

  it('records completed writes before a later failure and never claims an identical operator file', () => {
    const root = fixture();
    write(root, 'existing.md', 'existing');
    const originalWrite = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, content, options) => {
      if (file.toString().endsWith('second.md')) throw new Error('fixture disk failure');
      originalWrite(file, content, options);
    });
    const templates = new Map([
      ['existing.md', 'existing'],
      ['first.md', 'first'],
      ['second.md', 'second'],
    ]);
    expect(() => applyFiles(root, revision, { templates })).toThrow('disk failure');
    const receipt = read(root, '.headstart/receipt.json');
    expect(receipt).toContain('first.md');
    expect(receipt).not.toContain('existing.md');
    expect(receipt).not.toContain('second.md');
    vi.restoreAllMocks();
    applyFiles(root, revision, { templates });
    write(root, 'first.md', 'our edit');
    expect(planFiles(root, { templates }).find((item) => item.path === 'first.md')?.action).toBe(
      'preserve'
    );
  });

  it('rejects stale writes and retains the operation error alongside cleanup errors', () => {
    const root = fixture();
    const target = path.join(root, 'file.md');
    write(root, 'file.md', 'newer');
    expect(() => {
      atomicWrite(target, 'overwrite', 'older');
    }).toThrow('changed');
    const originalClose = fs.closeSync;
    const close = vi.spyOn(fs, 'closeSync').mockImplementation((descriptor) => {
      originalClose(descriptor);
      throw new Error('close fixture failure');
    });
    expect(() =>
      withWorkspaceLock(root, () => {
        throw new Error('original operation failure');
      })
    ).toThrow(AggregateError);
    expect(fs.existsSync(path.join(root, '.headstart/operation.lock'))).toBe(false);
    close.mockRestore();
    const unlink = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('unlink fixture failure');
    });
    try {
      withWorkspaceLock(root, () => {
        throw new Error('preserve me');
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      if (error instanceof AggregateError) expect(error.cause).toEqual(new Error('preserve me'));
    }
    unlink.mockRestore();
  });
});

describe('scoped agent instruction routing', () => {
  it('selects the effective Codex override and preserves all unrelated user instructions', () => {
    const root = path.join(fixture(), 'workspace');
    const home = fixture();
    write(home, '.codex/AGENTS.md', 'fallback');
    write(home, '.codex/AGENTS.override.md', 'existing override\n');
    write(home, '.claude/CLAUDE.md', 'existing Claude\n');
    const plans = planHostRouting(root, ['codex', 'claude-code'], home);
    expect(plans.at(0)?.file).toBe(path.join(home, '.codex/AGENTS.override.md'));
    expect(fs.existsSync(root)).toBe(false);
    applyHostRouting(root, plans);
    expect(read(home, '.codex/AGENTS.md')).toBe('fallback');
    expect(read(home, '.codex/AGENTS.override.md')).toMatch(/^existing override\n/);
    expect(read(home, '.claude/CLAUDE.md')).toMatch(/^existing Claude\n/);
    expect(installedHosts(root)).toEqual(['codex', 'claude-code']);
    expect(
      planHostRouting(root, ['codex', 'claude-code'], home).every(
        (plan) => plan.action === 'unchanged'
      )
    ).toBe(true);
    const current = read(home, '.codex/AGENTS.override.md');
    write(
      home,
      '.codex/AGENTS.override.md',
      current.replace('Before task work', 'User customization')
    );
    const conflict = planHostRouting(root, ['codex'], home);
    expect(conflict.at(0)?.action).toBe('conflict');
    expect(() => {
      applyHostRouting(root, conflict);
    }).toThrow('edited');
    expect(read(home, '.codex/AGENTS.override.md')).toContain('User customization');
  });

  it('creates routing in an empty profile and rejects concurrent edits or malformed markers', () => {
    const root = path.join(fixture(), 'workspace');
    const home = fixture();
    const plans = planHostRouting(root, ['codex'], home);
    expect(plans.at(0)?.action).toBe('create');
    write(home, '.codex/AGENTS.md', 'concurrent personal edit');
    expect(() => {
      applyHostRouting(root, plans);
    }).toThrow('changed');
    const next = planHostRouting(root, ['codex'], home);
    applyHostRouting(root, next);
    const content = read(home, '.codex/AGENTS.md');
    write(home, '.codex/AGENTS.md', content.replace(':end -->', ':broken -->'));
    expect(() => planHostRouting(root, ['codex'], home)).toThrow('Malformed');
  });
});

describe('bounded knowledge access', () => {
  it('searches approved Markdown scopes and reads the complete original page', () => {
    const root = fixture();
    write(
      root,
      'Headstart/wiki/architecture.md',
      '# Architecture\nOur useful architecture decision\nEvidence and caveats\n'
    );
    write(root, 'Headstart/raw/private.md', 'useful architecture');
    write(root, 'backend/code.md', 'useful architecture');
    expect(searchKnowledge(root, 'useful architecture')).toEqual([
      {
        page: path.join('wiki', 'architecture.md'),
        line: 2,
        excerpt: 'Our useful architecture decision',
      },
    ]);
    expect(readKnowledge(root, 'wiki/architecture.md')).toContain('Evidence and caveats');
    expect(() => readKnowledge(root, '../backend/code.md')).toThrow('escapes');
    expect(() => readKnowledge(root, 'secret.txt')).toThrow('Markdown');
    expect(() => searchKnowledge(root, ' ')).toThrow('non-empty');
    write(root, 'Headstart/wiki/many.md', 'bounded term\n'.repeat(70));
    expect(searchKnowledge(root, 'bounded term')).toHaveLength(50);
  });
});

interface OnboardingFixture {
  root: string;
  home: string;
  seed: string;
  git: WorkspaceGit;
  install: (root: string) => void;
}
const sourceFixture = (): OnboardingFixture => {
  const base = fixture();
  const root = path.join(base, 'workspace');
  const home = path.join(base, 'home');
  const seed = path.join(base, 'seed');
  const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  fs.mkdirSync(seed);
  fs.mkdirSync(home);
  fs.cpSync(path.join(checkout, 'scripts'), path.join(seed, 'scripts'), { recursive: true });
  write(seed, 'package.json', '{"type":"module"}\n');
  write(seed, '.gitignore', 'node_modules\n');
  write(seed, 'AGENTS.md', '# Synthetic repository\nRepository marker: orchard.\n');
  write(
    seed,
    'skills/example/SKILL.md',
    '---\nname: example\ndescription: Use when exercising synthetic onboarding.\n---\n# Example\n'
  );
  write(
    seed,
    'skills/example/evals/evals.json',
    JSON.stringify({
      skill: 'example',
      cases: [
        {
          name: 'positive',
          prompt: 'Exercise onboarding.',
          shouldActivate: true,
          expectedBehaviors: ['Reads the workspace'],
        },
        {
          name: 'negative',
          prompt: 'Do unrelated work.',
          shouldActivate: false,
          expectedBehaviors: ['Does not activate'],
        },
      ],
    })
  );
  runWorkspaceGit(seed, ['init', '-b', 'main']);
  runWorkspaceGit(seed, ['config', 'user.name', 'Fixture']);
  runWorkspaceGit(seed, ['config', 'user.email', 'fixture@example.test']);
  runWorkspaceGit(seed, ['add', '.']);
  runWorkspaceGit(seed, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture source']);
  runWorkspaceGit(seed, ['branch', 'dev']);
  const git: WorkspaceGit = (cwd, args) =>
    runWorkspaceGit(
      cwd,
      args.at(0) === 'fetch' ? ['fetch', seed, '+refs/heads/*:refs/remotes/origin/*'] : args
    );
  const install = (workspace: string): void => {
    const destination = path.join(workspaceSource(workspace), 'node_modules');
    if (!fs.existsSync(destination))
      fs.symlinkSync(
        path.join(checkout, 'node_modules'),
        destination,
        process.platform === 'win32' ? 'junction' : 'dir'
      );
  };
  return { root, home, seed, git, install };
};

describe('installed onboarding flow', () => {
  it(
    'bounds package-manager failure and exports exact binary Git blobs without creating worktrees',
    () => {
      const { root, seed, git } = sourceFixture();
      expect(() => {
        installWorkspaceRuntime(root);
      }).toThrow('pinned Agent Platform');
      write(root, 'agent-platform/main/scripts/workspace-cli.ts', '// fixture');
      const runner = vi.fn<typeof spawnSync>().mockReturnValue({
        pid: 1,
        output: [],
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        status: 0,
        signal: null,
      });
      installWorkspaceRuntime(root, runner);
      expect(runner).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['install', '--frozen-lockfile']),
        expect.objectContaining({ cwd: workspaceSource(root), timeout: 300_000 })
      );
      runner.mockReturnValue({
        pid: 1,
        output: [],
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        status: 1,
        signal: null,
      });
      expect(() => {
        installWorkspaceRuntime(root, runner);
      }).toThrow('installation failed');
      const binary = Buffer.from([0, 255, 13, 10, 128]);
      fs.writeFileSync(path.join(seed, 'skills/example/binary.dat'), binary);
      git(seed, ['add', '.']);
      git(seed, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'binary fixture']);
      const snapshot = path.join(fixture(), 'snapshot');
      exportGitSnapshot(seed, git(seed, ['rev-parse', 'HEAD']), snapshot, git);
      expect(fs.readFileSync(path.join(snapshot, 'skills/example/binary.dat'))).toEqual(binary);
      expect(fs.existsSync(path.join(snapshot, '.git'))).toBe(false);
      expect(() => {
        exportGitSnapshot(
          seed,
          revision,
          fixture(),
          () => `120000 blob ${revision}\tskills/link\0`
        );
      }).toThrow('unsupported');
      expect(() => {
        exportGitSnapshot(seed, revision, fixture(), () => `100644 blob ${revision}\t../escape\0`);
      }).toThrow('escapes');
    },
    gitWorkflowTestTimeoutForPlatform(process.platform)
  );
  it(
    'installs host skills and routing, launches from the internal source, and upgrades that same source',
    () => {
      const { root, home, seed, git, install } = sourceFixture();
      const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const services = { homeDirectory: home, installRuntime: install };
      const args = [
        'setup',
        '--root',
        root,
        '--repositories',
        'backend',
        '--hosts',
        'codex,claude-code',
        '--clone',
      ];
      expect(runWorkspace(parseWorkspaceArgs(args), seed, git, services)).toBe(0);
      expect(fs.existsSync(root)).toBe(false);
      expect(fs.readdirSync(home)).toEqual([]);
      expect(runWorkspace(parseWorkspaceArgs([...args, '--apply']), seed, git, services)).toBe(0);
      expect(read(home, '.agents/skills/example/SKILL.md')).toContain('Example');
      expect(read(home, '.claude/skills/example/SKILL.md')).toContain('Example');
      expect(read(home, '.codex/AGENTS.md')).toContain(root);
      expect(git(workspaceSource(root), ['branch', '--show-current'])).toBe('main');
      const launcher = spawnSync(
        process.execPath,
        [path.join(root, 'bin/headstart.mjs'), 'read', '--page', 'index.md'],
        {
          cwd: home,
          encoding: 'utf8',
          env: withoutRepositoryLocalGitEnvironment(process.env),
          timeout: 30_000,
        }
      );
      expect(launcher.stderr).toBe('');
      expect(launcher.status).toBe(0);
      expect(launcher.stdout).toContain('Knowledge index');
      expect(
        runWorkspace(
          parseWorkspaceArgs([
            'new-worktree',
            '--root',
            root,
            '--repo',
            'backend',
            '--name',
            'task',
            '--branch',
            'feature/task',
          ]),
          seed,
          git,
          services
        )
      ).toBe(0);
      const assertion = spawnSync(
        process.execPath,
        [
          path.join(root, 'bin/headstart.mjs'),
          'assert-worktree',
          '--repo',
          'backend',
          '--path',
          'backend/task',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: withoutRepositoryLocalGitEnvironment(process.env),
          timeout: 30_000,
        }
      );
      expect(assertion.status).toBe(0);
      expect(assertion.stdout).toContain('anchor verified');
      expect(
        runWorkspace(
          parseWorkspaceArgs(['doctor', '--root', root, '--repositories', 'backend']),
          seed,
          git,
          services
        )
      ).toBe(0);
      const source = workspaceSource(root);
      const installedSkill = read(home, '.agents/skills/example/SKILL.md');
      write(home, '.agents/skills/example/SKILL.md', 'operator edit');
      expect(
        runWorkspace(
          parseWorkspaceArgs(['doctor', '--root', root, '--repositories', 'backend']),
          seed,
          git,
          services
        )
      ).toBe(1);
      write(home, '.agents/skills/example/SKILL.md', installedSkill);
      const registrations = git(source, ['worktree', 'list', '--porcelain']);
      write(
        seed,
        'skills/example/SKILL.md',
        read(seed, 'skills/example/SKILL.md') + '\nUpdated version.\n'
      );
      runWorkspaceGit(seed, ['add', '.']);
      runWorkspaceGit(seed, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'update fixture skill']);
      const commit = git(seed, ['rev-parse', 'HEAD']);
      expect(() =>
        runWorkspace(parseWorkspaceArgs([...args, '--apply']), seed, git, services)
      ).toThrow('differs from this setup source');
      const updates = ['skills', '--root', root, '--hosts', 'codex,claude-code'];
      expect(runWorkspace(parseWorkspaceArgs(updates), source, git, services)).toBe(0);
      expect(git(source, ['worktree', 'list', '--porcelain'])).toBe(registrations);
      expect(
        runWorkspace(
          parseWorkspaceArgs([...updates, '--apply', '--expected-commit', commit]),
          source,
          git,
          services
        )
      ).toBe(0);
      expect(read(home, '.agents/skills/example/SKILL.md')).toContain('Updated version');
      const upgrades = ['upgrade', '--root', root, '--diff'];
      output.mockClear();
      expect(runWorkspace(parseWorkspaceArgs(upgrades), source, git, services)).toBe(0);
      const preview: unknown = JSON.parse(String(output.mock.calls.at(0)?.at(0)));
      if (
        typeof preview !== 'object' ||
        preview === null ||
        !('expectedPlan' in preview) ||
        typeof preview.expectedPlan !== 'string'
      )
        throw new Error('Missing upgrade plan token.');
      expect(
        runWorkspace(
          parseWorkspaceArgs([...upgrades, '--apply', '--expected-plan', preview.expectedPlan]),
          source,
          git,
          services
        )
      ).toBe(0);
      expect(readRegularFile(path.join(root, '.headstart/operation.lock'))).toBeNull();
      expect(digest(read(root, 'AGENTS.md'))).toHaveLength(64);
    },
    gitWorkflowTestTimeoutForPlatform(process.platform)
  );
});
