import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { gitWorkflowTestTimeoutForPlatform } from '../test-timeouts.js';
import { repositoryFor, selectRepositories, WORKSPACE_REPOSITORIES } from '../workspace-catalog.js';
import { parseWorkspaceArgs, runWorkspace } from '../workspace-cli.js';
import {
  applyFiles,
  createFile,
  planFiles,
  workspacePath,
  workspaceRoot,
  withWorkspaceLock,
} from '../workspace-files.js';
import {
  assertAnchor,
  assertFeatureWorktree,
  inspectRepository,
  newWorkspaceWorktree,
  provisionRepository,
  runWorkspaceGit,
  type WorkspaceGit,
} from '../workspace-git.js';

const temporaryDirectories: string[] = [];
const revision = 'a'.repeat(40);
const fixtureRoot = (): string => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-workspace-')));
  temporaryDirectories.push(directory);
  return directory;
};
const read = (root: string, file: string): string => fs.readFileSync(path.join(root, file), 'utf8');
const backend = repositoryFor('backend');
const gitTimeout = gitWorkflowTestTimeoutForPlatform(process.platform);

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

const gitFixture = (): { root: string; source: string; git: WorkspaceGit; initial: string } => {
  const directory = fixtureRoot();
  const root = path.join(directory, 'workspace');
  const source = path.join(directory, 'source');
  fs.mkdirSync(source);
  runWorkspaceGit(source, ['init', '-b', 'dev']);
  runWorkspaceGit(source, ['config', 'user.email', 'fixture@example.test']);
  runWorkspaceGit(source, ['config', 'user.name', 'Fixture']);
  runWorkspaceGit(source, [
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-m',
    'Initial',
  ]);
  runWorkspaceGit(source, ['branch', 'main']);
  const initial = runWorkspaceGit(source, ['rev-parse', 'HEAD']);
  applyFiles(root, revision);
  const git: WorkspaceGit = (cwd, args) =>
    runWorkspaceGit(
      cwd,
      args.at(0) === 'fetch' ? ['fetch', source, '+refs/heads/*:refs/remotes/origin/*'] : args
    );
  return { root, source, git, initial };
};

describe('workspace scaffold', () => {
  it('previews all six hubs without writes or remote access', () => {
    const root = path.join(fixtureRoot(), 'missing');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(
      runWorkspace(parseWorkspaceArgs(['setup', '--root', root, '--clone']), '/missing-source')
    ).toBe(0);
    expect(fs.existsSync(root)).toBe(false);
    expect(WORKSPACE_REPOSITORIES.map((repo) => repo.hub)).toEqual([
      'agent-platform',
      'backend',
      'frontend',
      'admin-panel',
      'website',
      'salesforce',
    ]);
    expect(selectRepositories('salesforce,frontend,salesforce')).toHaveLength(2);
    expect(selectRepositories('none')).toEqual([]);
    expect(() => selectRepositories('unknown')).toThrow('Unknown repository');
  });

  it('creates a portable starter and preserves user edits on rerun', () => {
    const root = path.join(fixtureRoot(), 'workspace with spaces');
    applyFiles(root, revision);
    expect(read(root, 'CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(read(root, 'salesforce/AGENTS.md')).toContain('headstartHealthTeam/salesforce-dev');
    expect(planFiles(root).every((item) => item.action === 'unchanged')).toBe(true);
    const receipt = read(root, '.headstart/receipt.json');
    fs.writeFileSync(path.join(root, 'Headstart/index.md'), '# Our growing knowledge\n');
    expect(planFiles(root).find((item) => item.path === 'Headstart/index.md')?.action).toBe(
      'preserve'
    );
    applyFiles(root, 'b'.repeat(40));
    expect(read(root, 'Headstart/index.md')).toBe('# Our growing knowledge\n');
    expect(read(root, '.headstart/receipt.json')).toBe(receipt);
    fs.unlinkSync(path.join(root, 'website/CLAUDE.md'));
    applyFiles(root, revision);
    expect(read(root, 'website/CLAUDE.md')).toBe('@AGENTS.md\n');
  });

  it('blocks unowned conflicts before creating anything and never replaces a file', () => {
    const root = fixtureRoot();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'custom');
    expect(() => applyFiles(root, revision)).toThrow('no files were changed');
    expect(fs.readdirSync(root)).toEqual(['AGENTS.md']);
    expect(() => {
      createFile(root, 'AGENTS.md', 'replacement');
    }).toThrow();
    expect(read(root, 'AGENTS.md')).toBe('custom');
  });

  it('rejects malformed receipts, receipt paths and special root locations', () => {
    const root = fixtureRoot();
    createFile(root, '.headstart/receipt.json', '{}');
    expect(() => planFiles(root)).toThrow();
    expect(() => workspaceRoot(os.homedir())).toThrow('dedicated');
    expect(() => workspaceRoot(path.parse(root).root)).toThrow('dedicated');
    expect(() => workspaceRoot(path.join(root, '.headstart/receipt.json'))).toThrow('directory');
    expect(() => workspacePath(root, '../escape')).toThrow('escapes');
    fs.mkdirSync(path.join(root, '.git'));
    expect(() => workspaceRoot(root)).toThrow('Git checkout');
  });

  it('rejects symlinks and non-directory ancestors without touching their target', () => {
    const directory = fixtureRoot();
    const target = path.join(directory, 'target');
    const root = path.join(directory, 'workspace');
    fs.mkdirSync(target);
    fs.mkdirSync(root);
    fs.symlinkSync(
      target,
      path.join(root, 'Headstart'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    expect(() => applyFiles(root, revision)).toThrow('Symlink');
    expect(fs.readdirSync(target)).toEqual([]);
    expect(() => workspaceRoot(path.join(root, 'Headstart/nested'))).toThrow('Symlink');
    fs.writeFileSync(path.join(root, 'backend'), 'not a directory');
    expect(() => workspacePath(root, 'backend/AGENTS.md')).toThrow('not a directory');
  });

  it('reports doctor gaps without changing files', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const root = path.join(fixtureRoot(), 'missing');
    expect(runWorkspace(parseWorkspaceArgs(['doctor', '--root', root]), '/missing')).toBe(1);
    expect(fs.existsSync(root)).toBe(false);
    applyFiles(root, revision);
    expect(
      runWorkspace(
        parseWorkspaceArgs(['doctor', '--root', root, '--repositories', 'none']),
        '/missing'
      )
    ).toBe(0);
    fs.unlinkSync(path.join(root, '.headstart/receipt.json'));
    expect(
      runWorkspace(
        parseWorkspaceArgs(['doctor', '--root', root, '--repositories', 'none']),
        '/missing'
      )
    ).toBe(1);
  });
});

describe('workspace arguments', () => {
  it('rejects ambiguous, missing and command-inapplicable flags', () => {
    for (const args of [
      [],
      ['unknown'],
      ['setup', '--root'],
      ['setup', '--apply', '--apply'],
      ['doctor', '--clone'],
      ['new-worktree'],
      ['new-worktree', '--repo', 'backend'],
      ['setup', '--mystery', 'x'],
      ['setup', '--repo', 'backend'],
    ]) {
      expect(() => parseWorkspaceArgs(args)).toThrow();
    }
    expect(
      parseWorkspaceArgs([
        '--',
        'new-worktree',
        '--repo',
        'backend',
        '--name',
        'stack',
        '--branch',
        'feature/stack',
        '--base',
        'feature/base',
      ]).base
    ).toBe('feature/base');
  });
});

describe('workspace Git integration', () => {
  it(
    'provisions baselines, creates isolated worktrees and honors an explicit stacked base',
    () => {
      const { root, source, git, initial } = gitFixture();
      expect(provisionRepository(root, backend, git)).toContain('created');
      expect(provisionRepository(root, backend, git)).toContain('existing');
      expect(inspectRepository(root, backend, git)).toContain('verified');
      const feature = newWorkspaceWorktree(
        root,
        backend,
        { name: 'first', branch: 'feature/first' },
        git
      );
      expect(() => {
        assertFeatureWorktree(root, backend, feature, git);
      }).not.toThrow();
      expect(runWorkspaceGit(feature, ['rev-parse', 'HEAD'])).toBe(initial);
      runWorkspaceGit(source, [
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--allow-empty',
        '-m',
        'New default',
      ]);
      const stacked = newWorkspaceWorktree(
        root,
        backend,
        { name: 'stacked', branch: 'feature/stacked', base: 'feature/first' },
        git
      );
      expect(runWorkspaceGit(stacked, ['rev-parse', 'HEAD'])).toBe(initial);
      expect(
        runWorkspaceGit(path.join(root, 'backend/.bare'), ['rev-parse', 'origin/dev'])
      ).not.toBe(initial);
      expect(() => {
        assertFeatureWorktree(root, backend, path.join(root, 'backend/dev'), git);
      }).toThrow('feature/review');
      expect(() => {
        assertFeatureWorktree(root, backend, source, git);
      }).toThrow('feature/review');
      expect(() =>
        newWorkspaceWorktree(root, backend, { name: 'first', branch: 'feature/duplicate' }, git)
      ).toThrow('already exists');
    },
    gitTimeout
  );

  it(
    'retries a failed fetch without adopting unrelated anchors or touching other repositories',
    () => {
      const { root, git } = gitFixture();
      const failed: WorkspaceGit = (cwd, args) => {
        if (args.at(0) === 'fetch') throw new Error('Fixture access denied');
        return git(cwd, args);
      };
      expect(() => provisionRepository(root, backend, failed)).toThrow('access denied');
      expect(fs.existsSync(path.join(root, 'backend/dev'))).toBe(false);
      expect(provisionRepository(root, backend, git)).toContain('created');
      const frontend = repositoryFor('frontend');
      fs.mkdirSync(path.join(root, 'frontend/.bare'));
      expect(() => provisionRepository(root, frontend, git)).toThrow('not managed');
      expect(fs.existsSync(path.join(root, '.headstart/repositories/frontend.json'))).toBe(false);
      const ap = repositoryFor('agent-platform');
      expect(provisionRepository(root, ap, git)).toContain('created');
      const apWorktree = newWorkspaceWorktree(
        root,
        ap,
        { name: 'stack', branch: 'feature/stack', base: 'origin/dev' },
        git
      );
      expect(fs.existsSync(path.join(apWorktree, '.git'))).toBe(true);
    },
    gitTimeout
  );

  it(
    'rejects foreign Git anchors even when a checkout has the expected visible path',
    () => {
      const { root, source, git } = gitFixture();
      provisionRepository(root, backend, git);
      const foreign = path.join(root, 'backend/foreign');
      runWorkspaceGit(source, ['worktree', 'add', '--detach', foreign]);
      expect(() => {
        assertFeatureWorktree(root, backend, foreign, git);
      }).toThrow('common directory');
      runWorkspaceGit(path.join(root, 'backend/.bare'), [
        'config',
        'remote.origin.url',
        'https://example.test/other.git',
      ]);
      expect(() => assertAnchor(root, backend, git)).toThrow('Origin');
      expect(inspectRepository(root, backend, git)).toContain('incomplete:');
    },
    gitTimeout
  );

  it(
    'rejects unsafe names, branches, missing refs and foreign baseline checkouts',
    () => {
      const { root, source, git } = gitFixture();
      provisionRepository(root, backend, git);
      for (const name of ['main', 'dev', '../escape', '.bare', 'UPPER']) {
        expect(() =>
          newWorkspaceWorktree(root, backend, { name, branch: 'feature/test' }, git)
        ).toThrow('worktree name');
      }
      expect(() =>
        newWorkspaceWorktree(root, backend, { name: 'safe', branch: '-bad' }, git)
      ).toThrow('explicit branch');
      expect(() =>
        newWorkspaceWorktree(
          root,
          backend,
          { name: 'safe', branch: 'feature/test', base: '-bad' },
          git
        )
      ).toThrow('base');
      expect(() =>
        newWorkspaceWorktree(
          root,
          backend,
          { name: 'safe', branch: 'feature/test', base: 'missing-ref' },
          git
        )
      ).toThrow('failed');
      expect(fs.existsSync(path.join(root, 'backend/safe'))).toBe(false);
      expect(() =>
        newWorkspaceWorktree(
          root,
          repositoryFor('website'),
          { name: 'safe', branch: 'codex/test' },
          git
        )
      ).toThrow('issue branch');
      const frontend = repositoryFor('frontend');
      runWorkspaceGit(source, ['worktree', 'add', '--detach', path.join(root, 'frontend/dev')]);
      expect(() => provisionRepository(root, frontend, git)).toThrow('anchor');
      expect(fs.existsSync(path.join(root, 'frontend/.bare'))).toBe(false);
    },
    gitTimeout
  );
});

describe('workspace command orchestration', () => {
  it('serializes mutations and releases a lock even when an operation fails', () => {
    const root = fixtureRoot();
    expect(() => withWorkspaceLock(root, () => withWorkspaceLock(root, () => 0))).toThrow('lock');
    expect(fs.existsSync(path.join(root, '.headstart/operation.lock'))).toBe(false);
    expect(withWorkspaceLock(root, () => 42)).toBe(42);
  });

  it(
    'requires clean source and preserves conflicts before acquiring a write lock',
    () => {
      const { source, git } = gitFixture();
      const root = path.join(fixtureRoot(), 'new');
      fs.writeFileSync(path.join(source, 'untracked.txt'), 'source edit');
      expect(() =>
        runWorkspace(parseWorkspaceArgs(['setup', '--root', root, '--apply']), source, git)
      ).toThrow('clean');
      expect(fs.existsSync(root)).toBe(false);
      fs.mkdirSync(root);
      fs.writeFileSync(path.join(root, 'README.md'), 'existing setup');
      expect(() =>
        runWorkspace(parseWorkspaceArgs(['setup', '--root', root, '--apply']), source, git)
      ).toThrow('conflict');
      expect(fs.readdirSync(root)).toEqual(['README.md']);
    },
    gitTimeout
  );

  it(
    'continues other requested repositories after failure, then supports retry and checked worktree commands',
    () => {
      const { source, git } = gitFixture();
      const root = path.join(fixtureRoot(), 'new workspace');
      const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const restricted: WorkspaceGit = (cwd, args) => {
        if (args.at(0) === 'fetch' && cwd.endsWith(path.join('backend', '.bare')))
          throw new Error('Fixture missing access');
        return git(cwd, args);
      };
      const setup = parseWorkspaceArgs([
        'setup',
        '--root',
        root,
        '--repositories',
        'backend,frontend',
        '--apply',
        '--clone',
      ]);
      expect(runWorkspace(setup, source, restricted)).toBe(1);
      expect(
        output.mock.calls.some((call) => String(call.at(0)).includes('backend: incomplete:'))
      ).toBe(true);
      expect(fs.existsSync(path.join(root, 'frontend/dev/.git'))).toBe(true);
      expect(runWorkspace(setup, source, git)).toBe(0);
      const create = parseWorkspaceArgs([
        'new-worktree',
        '--root',
        root,
        '--repo',
        'backend',
        '--name',
        'feature',
        '--branch',
        'feature/example',
      ]);
      expect(runWorkspace(create, source, git)).toBe(0);
      const check = parseWorkspaceArgs([
        'assert-worktree',
        '--root',
        root,
        '--repo',
        'backend',
        '--path',
        path.join(root, 'backend/feature'),
      ]);
      expect(runWorkspace(check, source, git)).toBe(0);
      expect(
        runWorkspace(
          parseWorkspaceArgs(['doctor', '--root', root, '--repositories', 'backend,frontend']),
          source,
          git
        )
      ).toBe(0);
    },
    gitTimeout
  );
});
