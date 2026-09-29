import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { withoutRepositoryLocalGitEnvironment } from './run-python-tests.js';
import { repositoryUrl, type WorkspaceRepository } from './workspace-catalog.js';
import { createFile, workspacePath, workspaceRoot } from './workspace-files.js';

export type WorkspaceGit = (cwd: string, args: readonly string[]) => string;

export const runWorkspaceGit: WorkspaceGit = (cwd, args) => {
  try {
    return execFileSync('git', [...args], {
      cwd,
      env: {
        ...withoutRepositoryLocalGitEnvironment(process.env),
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'never',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    }).trim();
  } catch {
    // Do not echo credential-helper output or authenticated remote URLs.
    throw new Error(
      `Git ${args.at(0) ?? 'operation'} failed in ${cwd}. Check access, repository state and connectivity using your normal Git tools.`
    );
  }
};

const anchorFor = (root: string, repository: WorkspaceRepository): string =>
  workspacePath(root, `${repository.hub}/.bare`);

export const assertAnchor = (
  root: string,
  repository: WorkspaceRepository,
  git: WorkspaceGit = runWorkspaceGit
): string => {
  const anchor = anchorFor(root, repository);
  if (!fs.existsSync(anchor) || git(anchor, ['rev-parse', '--is-bare-repository']) !== 'true') {
    throw new Error(`Missing or invalid bare anchor: ${repository.hub}`);
  }
  if (git(anchor, ['config', '--get', 'remote.origin.url']) !== repositoryUrl(repository)) {
    throw new Error(`Origin does not match the catalog: ${repository.hub}`);
  }
  return anchor;
};

const assertRegisteredWorktree = (
  root: string,
  repository: WorkspaceRepository,
  checkout: string,
  git: WorkspaceGit
): void => {
  const anchor = assertAnchor(root, repository, git);
  workspacePath(root, path.relative(root, checkout));
  const common = git(checkout, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const top = git(checkout, ['rev-parse', '--show-toplevel']);
  if (
    fs.realpathSync(common) !== fs.realpathSync(anchor) ||
    fs.realpathSync(top) !== fs.realpathSync(checkout)
  ) {
    throw new Error('Worktree location or Git common directory does not match its hub.');
  }
  const registrations = git(anchor, ['worktree', 'list', '--porcelain', '-z']).split('\0');
  if (
    !registrations.some(
      (entry) =>
        entry.startsWith('worktree ') && path.resolve(entry.slice(9)) === path.resolve(checkout)
    )
  )
    throw new Error('Worktree is not registered with the hub anchor.');
};

export const assertFeatureWorktree = (
  root: string,
  repository: WorkspaceRepository,
  checkout: string,
  git: WorkspaceGit = runWorkspaceGit
): void => {
  const resolved = workspaceRoot(root);
  const target = path.resolve(checkout);
  if (
    path.dirname(target) !== path.join(resolved, repository.hub) ||
    !validWorktreeName(path.basename(target))
  ) {
    throw new Error('Use a feature/review worktree directly under the matching repository hub.');
  }
  assertRegisteredWorktree(resolved, repository, target, git);
};

const validWorktreeName = (name: string): boolean =>
  /^[a-z0-9][a-z0-9-]{0,63}$/.test(name) && name !== 'main' && name !== 'dev';

const markerFor = (repository: WorkspaceRepository): string =>
  `.headstart/repositories/${repository.hub}.json`;
const markerContent = (repository: WorkspaceRepository): string =>
  `${JSON.stringify({ origin: repositoryUrl(repository), version: 1 })}\n`;

const initializeAnchor = (
  root: string,
  repository: WorkspaceRepository,
  git: WorkspaceGit
): string => {
  const anchor = anchorFor(root, repository);
  const marker = workspacePath(root, markerFor(repository));
  const expected = markerContent(repository);
  if (fs.existsSync(marker)) {
    if (!fs.statSync(marker).isFile()) throw new Error('Repository marker must be a regular file.');
    if (fs.readFileSync(marker, 'utf8') !== expected)
      throw new Error('Repository ownership marker needs manual review.');
  } else {
    if (fs.existsSync(anchor))
      throw new Error(`Existing anchor is not managed by this scaffold: ${repository.hub}`);
    createFile(root, markerFor(repository), expected);
  }
  if (!fs.existsSync(anchor)) {
    fs.mkdirSync(path.dirname(anchor), { recursive: true });
    git(path.dirname(anchor), ['init', '--bare', anchor]);
    git(anchor, ['config', 'remote.origin.url', repositoryUrl(repository)]);
    git(anchor, ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
  }
  return assertAnchor(root, repository, git);
};

export const provisionRepository = (
  root: string,
  repository: WorkspaceRepository,
  git: WorkspaceGit = runWorkspaceGit,
  sourceCommit?: string
): string => {
  const resolved = workspaceRoot(root);
  const stable = workspacePath(resolved, `${repository.hub}/${repository.baseline}`);
  // A foreign checkout at the baseline path must not cause a new anchor to be created.
  if (fs.existsSync(stable)) {
    assertRegisteredWorktree(resolved, repository, stable, git);
    return 'existing baseline verified; no fetch or baseline update';
  }
  const anchor = initializeAnchor(resolved, repository, git);
  git(anchor, ['fetch', 'origin']);
  git(anchor, ['rev-parse', '--verify', `refs/remotes/origin/${repository.baseline}^{commit}`]);
  const base =
    repository.hub === 'agent-platform' && sourceCommit
      ? sourceCommit
      : `refs/remotes/origin/${repository.baseline}`;
  git(anchor, ['rev-parse', '--verify', `${base}^{commit}`]);
  git(anchor, ['worktree', 'add', '-b', repository.baseline, stable, base]);
  assertRegisteredWorktree(resolved, repository, stable, git);
  return 'created bare anchor and stable source worktree';
};

export interface NewWorktreeOptions {
  name: string;
  branch: string;
  base?: string | undefined;
}

export const newWorkspaceWorktree = (
  root: string,
  repository: WorkspaceRepository,
  options: NewWorktreeOptions,
  git: WorkspaceGit = runWorkspaceGit
): string => {
  const resolved = workspaceRoot(root);
  if (!validWorktreeName(options.name))
    throw new Error('Use a descriptive lowercase worktree name; main and dev are reserved.');
  if (
    !options.branch ||
    options.branch.startsWith('-') ||
    options.branch === 'main' ||
    options.branch === 'dev'
  )
    throw new Error('An explicit branch other than main or dev is required.');
  if (repository.hub === 'website' && options.branch.startsWith('codex/'))
    throw new Error('Website work must use its repository-approved issue branch naming.');
  const base = options.base ?? `origin/${repository.baseline}`;
  if (base.startsWith('-')) throw new Error('Invalid base ref.');
  const anchor = assertAnchor(resolved, repository, git);
  const target = workspacePath(resolved, `${repository.hub}/${options.name}`);
  if (fs.existsSync(target)) throw new Error('Worktree destination already exists.');
  git(anchor, ['check-ref-format', '--branch', options.branch]);
  git(anchor, ['fetch', 'origin']);
  const commit = git(anchor, ['rev-parse', '--verify', `${base}^{commit}`]);
  git(anchor, ['worktree', 'add', '-b', options.branch, target, commit]);
  assertFeatureWorktree(resolved, repository, target, git);
  return target;
};

export const inspectRepository = (
  root: string,
  repository: WorkspaceRepository,
  git: WorkspaceGit = runWorkspaceGit
): string => {
  try {
    const resolved = workspaceRoot(root);
    assertRegisteredWorktree(
      resolved,
      repository,
      workspacePath(resolved, `${repository.hub}/${repository.baseline}`),
      git
    );
    return 'baseline and anchor verified locally; freshness and application setup unchecked';
  } catch (error) {
    return `incomplete: ${error instanceof Error ? error.message : 'repository inspection failed'}`;
  }
};
