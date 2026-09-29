import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryFor, selectRepositories } from './workspace-catalog.js';
import {
  applyFiles,
  hasWorkspaceReceipt,
  planFiles,
  workspacePath,
  workspaceRoot,
  withWorkspaceLock,
} from './workspace-files.js';
import {
  assertFeatureWorktree,
  inspectRepository,
  newWorkspaceWorktree,
  provisionRepository,
  runWorkspaceGit,
  type WorkspaceGit,
} from './workspace-git.js';

const NEW_WORKTREE = 'new-worktree';
const ASSERT_WORKTREE = 'assert-worktree';
const REPOSITORIES_OPTION = '--repositories';

const usage = `Usage: pnpm workspace -- <setup|doctor|new-worktree|assert-worktree> [options]
  --root <path>          Dedicated workspace (default: ~/headstart)
  --repositories <list>  Comma-separated hubs, all (default), or none; setup/doctor only
  --apply               Create missing scaffold files; setup only
  --clone               Include selected Git hubs in setup preview/apply
  --repo <hub>           Worktree repository
  --name <slug>          New feature/review directory
  --branch <branch>      Explicit new branch matching repository rules
  --base <ref>           Optional stacked base; otherwise origin/main or origin/dev
  --path <checkout>      Checkout to assert (default: current directory)
Preview never writes or contacts remotes. No automatic migration, updates or cleanup.`;

export interface WorkspaceOptions {
  command: string;
  root: string;
  repositories: string;
  apply: boolean;
  clone: boolean;
  repo: string | undefined;
  name: string | undefined;
  branch: string | undefined;
  base: string | undefined;
  checkout: string;
}

export const parseWorkspaceArgs = (args: readonly string[]): WorkspaceOptions => {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const parts = args.filter((argument) => argument !== '--');
  const command = parts.shift();
  if (!command || !['setup', 'doctor', NEW_WORKTREE, ASSERT_WORKTREE].includes(command))
    throw new Error(usage);
  const valueOptions = new Set([
    '--root',
    REPOSITORIES_OPTION,
    '--repo',
    '--name',
    '--branch',
    '--base',
    '--path',
  ]);
  for (let index = 0; index < parts.length; index += 1) {
    const flag = parts.at(index) ?? '';
    if (values.has(flag) || flags.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    if (flag === '--apply' || flag === '--clone') {
      flags.add(flag);
      continue;
    }
    const value = parts.at(index + 1);
    if (!valueOptions.has(flag) || !value || value.startsWith('--'))
      throw new Error(`Invalid or missing option: ${flag}\n${usage}`);
    values.set(flag, value);
    index += 1;
  }
  validateOptions(command, values, flags);
  return {
    command,
    root: path.resolve(values.get('--root') ?? path.join(os.homedir(), 'headstart')),
    repositories: values.get(REPOSITORIES_OPTION) ?? 'all',
    apply: flags.has('--apply'),
    clone: flags.has('--clone'),
    repo: values.get('--repo'),
    name: values.get('--name'),
    branch: values.get('--branch'),
    base: values.get('--base'),
    checkout: path.resolve(values.get('--path') ?? process.cwd()),
  };
};

const validateOptions = (
  command: string,
  values: Map<string, string>,
  flags: Set<string>
): void => {
  const allowed = new Map([
    ['setup', ['--root', REPOSITORIES_OPTION, '--apply', '--clone']],
    ['doctor', ['--root', REPOSITORIES_OPTION]],
    [NEW_WORKTREE, ['--root', '--repo', '--name', '--branch', '--base']],
    [ASSERT_WORKTREE, ['--root', '--repo', '--path']],
  ]);
  for (const flag of [...values.keys(), ...flags]) {
    if (!allowed.get(command)?.includes(flag))
      throw new Error(`${flag} is not valid for ${command}.`);
  }
  if (command.includes('worktree') && !values.has('--repo')) throw new Error('--repo is required.');
  if (command === NEW_WORKTREE && (!values.has('--name') || !values.has('--branch')))
    throw new Error('--name and --branch are required.');
  selectRepositories(values.get(REPOSITORIES_OPTION) ?? 'all');
};

export const runWorkspace = (
  options: WorkspaceOptions,
  sourceRoot: string,
  git: WorkspaceGit = runWorkspaceGit
): number => {
  const root = workspaceRoot(options.root);
  if (options.command === 'setup' && options.apply) {
    if (planFiles(root).some((item) => item.action === 'conflict'))
      throw new Error('Existing files conflict with the template; no files were changed.');
    if (git(sourceRoot, ['status', '--porcelain']) !== '')
      throw new Error(
        'Use a clean, reviewed Agent Platform source checkout before applying setup.'
      );
  }
  if (options.apply || options.command === NEW_WORKTREE) {
    return withWorkspaceLock(root, () => executeWorkspace(options, sourceRoot, git));
  }
  return executeWorkspace(options, sourceRoot, git);
};

const executeWorkspace = (
  options: WorkspaceOptions,
  sourceRoot: string,
  git: WorkspaceGit
): number => {
  const root = workspaceRoot(options.root);
  if (options.command.includes('worktree')) {
    const repository = repositoryFor(options.repo ?? '');
    if (options.command === ASSERT_WORKTREE) {
      assertFeatureWorktree(root, repository, options.checkout, git);
      console.log('Worktree location and Git anchor verified.');
    } else {
      console.log(
        newWorkspaceWorktree(
          root,
          repository,
          {
            name: options.name ?? '',
            branch: options.branch ?? '',
            base: options.base,
          },
          git
        )
      );
    }
    return 0;
  }
  const plan = planFiles(root);
  console.log(
    JSON.stringify(
      { root, receipt: hasWorkspaceReceipt(root) ? 'present' : 'missing', files: plan },
      null,
      2
    )
  );
  const repositories = selectRepositories(options.repositories);
  let incomplete = plan.some((item) => item.action === 'conflict');
  if (options.command === 'setup' && options.apply) {
    applyFiles(root, git(sourceRoot, ['rev-parse', 'HEAD']));
  }
  for (const repository of repositories) {
    const status = repositoryStatus(options, root, repository.hub, git);
    console.log(`${repository.hub}: ${status}`);
    if (status.startsWith('incomplete:')) incomplete = true;
  }
  console.log(
    'Host instruction discovery, global skills, credentials, knowledge population and application readiness are unchecked.'
  );
  if (
    options.command === 'doctor' &&
    (!hasWorkspaceReceipt(root) || plan.some((item) => item.action === 'create'))
  )
    incomplete = true;
  return incomplete ? 1 : 0;
};

const repositoryStatus = (
  options: WorkspaceOptions,
  root: string,
  hub: string,
  git: WorkspaceGit
): string => {
  const repository = repositoryFor(hub);
  if (options.command === 'doctor') return inspectRepository(root, repository, git);
  if (!options.clone) return 'cataloged; Git provisioning not requested (use --apply --clone)';
  if (!options.apply)
    return `planned: initialize or verify ${workspacePath(root, `${hub}/.bare`)} and ${workspacePath(root, `${hub}/${repository.baseline}`)}; remote access unchecked`;
  try {
    return provisionRepository(root, repository, git);
  } catch (error) {
    return `incomplete: ${error instanceof Error ? error.message : 'setup failed'}`;
  }
};

const main = (): void => {
  try {
    process.exitCode = runWorkspace(
      parseWorkspaceArgs(process.argv.slice(2)),
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Workspace operation failed.');
    process.exitCode = 1;
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
