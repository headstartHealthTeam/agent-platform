import os from 'node:os';
import path from 'node:path';

import { repositoryFor, selectRepositories } from './workspace-catalog.js';
import { selectHosts } from './workspace-hosts.js';

export const NEW_WORKTREE = 'new-worktree';
export const ASSERT_WORKTREE = 'assert-worktree';
const REPOSITORIES = '--repositories';
const ADOPT_SKILLS = '--adopt-skills';
const EXPECTED_COMMIT = '--expected-commit';
const EXPECTED_PLAN = '--expected-plan';
export const workspaceUsage = `Usage: headstart <setup|upgrade|doctor|skills|new-worktree|assert-worktree|search|read> [options]
  --root <path>           Workspace root (source CLI default: ~/headstart)
  --repositories <list>   Comma-separated hubs, all (default), or none
  --hosts <list>          codex,claude-code or none; defaults to previously configured hosts
  --apply                Explicitly apply setup, template upgrades or skill updates
  --clone                Include selected Git repositories in setup preview/apply
  --expected-plan <hash>  Required for upgrade --apply; copied from reviewed preview
  --expected-commit <sha> Required for skills --apply; copied from reviewed preview
  --keep-local <files>    Explicitly keep named owned files when their new templates conflict
  --adopt-skills          Explicitly replace unreceipted skill-name collisions after review
  --diff                 Show current/proposed template changes
  --repo <hub> --name <slug> --branch <branch> [--base <ref>]  Create a worktree
  --repo <hub> [--path <checkout>]  Assert a worktree
  --query <terms>         Search only workspace Markdown knowledge
  --page <relative.md>    Read one full knowledge page
Setup/upgrade previews are write-free; skills preview fetches current main without applying it.`;

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
  hosts?: string | undefined;
  expectedPlan?: string | undefined;
  expectedCommit?: string | undefined;
  keepLocal?: readonly string[];
  diff?: boolean;
  adoptSkills?: boolean;
  query?: string | undefined;
  page?: string | undefined;
}

const allowedFlags = new Map<string, string[]>([
  ['setup', ['--root', REPOSITORIES, '--apply', '--clone', '--hosts', ADOPT_SKILLS, '--diff']],
  ['upgrade', ['--root', '--apply', '--hosts', EXPECTED_PLAN, '--keep-local', '--diff']],
  ['doctor', ['--root', REPOSITORIES, '--hosts']],
  ['skills', ['--root', '--hosts', '--apply', EXPECTED_COMMIT, ADOPT_SKILLS]],
  [NEW_WORKTREE, ['--root', '--repo', '--name', '--branch', '--base']],
  [ASSERT_WORKTREE, ['--root', '--repo', '--path']],
  ['search', ['--root', '--query']],
  ['read', ['--root', '--page']],
]);
const switches = new Set(['--apply', '--clone', '--diff', ADOPT_SKILLS]);

export const parseWorkspaceArgs = (args: readonly string[]): WorkspaceOptions => {
  const parts = args.filter((argument) => argument !== '--');
  const command = parts.shift();
  if (!command || !allowedFlags.has(command)) throw new Error(workspaceUsage);
  const values = new Map<string, string>();
  for (let index = 0; index < parts.length; index += 1) {
    const flag = parts.at(index) ?? '';
    if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    if (!allowedFlags.get(command)?.includes(flag))
      throw new Error(`Invalid option for ${command}: ${flag}`);
    if (switches.has(flag)) {
      values.set(flag, 'true');
      continue;
    }
    const value = parts.at(index + 1);
    if (!value || value.startsWith('--')) throw new Error(`Missing value: ${flag}`);
    values.set(flag, value);
    index += 1;
  }
  validateFlags(command, values);
  return {
    command,
    root: path.resolve(values.get('--root') ?? path.join(os.homedir(), 'headstart')),
    repositories: values.get(REPOSITORIES) ?? 'all',
    apply: values.has('--apply'),
    clone: values.has('--clone'),
    repo: values.get('--repo'),
    name: values.get('--name'),
    branch: values.get('--branch'),
    base: values.get('--base'),
    checkout: path.resolve(values.get('--path') ?? process.cwd()),
    hosts: values.get('--hosts'),
    expectedPlan: values.get(EXPECTED_PLAN),
    expectedCommit: values.get(EXPECTED_COMMIT),
    keepLocal: values.get('--keep-local')?.split(',') ?? [],
    diff: values.has('--diff'),
    adoptSkills: values.has(ADOPT_SKILLS),
    query: values.get('--query'),
    page: values.get('--page'),
  };
};

const validateFlags = (command: string, values: Map<string, string>): void => {
  if (command.includes('worktree')) repositoryFor(values.get('--repo') ?? '');
  if (command === NEW_WORKTREE && (!values.has('--name') || !values.has('--branch')))
    throw new Error('--name and --branch are required.');
  if (command === 'upgrade' && values.has('--apply') && !values.has(EXPECTED_PLAN))
    throw new Error('Upgrade apply requires --expected-plan.');
  if (command === 'skills' && values.has('--apply') && !values.has(EXPECTED_COMMIT))
    throw new Error('Skills apply requires --expected-commit.');
  if (command === 'search' && !values.has('--query')) throw new Error('--query is required.');
  if (command === 'read' && !values.has('--page')) throw new Error('--page is required.');
  selectRepositories(values.get(REPOSITORIES) ?? 'all');
  if (values.has('--hosts')) selectHosts(values.get('--hosts') ?? 'none');
};
