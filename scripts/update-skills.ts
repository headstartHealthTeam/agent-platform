import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createInstallPlan,
  installSkills,
  resolveInstallRoot,
  type AgentHost,
  type InstallOperation,
  type InstallOptions,
} from './install-skills.js';
import { withoutRepositoryLocalGitEnvironment } from './run-python-tests.js';
import { validateRepository } from './validate-skills.js';

const AGENT_HOST_VALUES = ['codex', 'claude-code', 'cursor'] as const;
const DEFAULT_REMOTE = 'origin';
const DEFAULT_BRANCH = 'main';
const CANONICAL_REMOTE_URL = 'https://github.com/headstartHealthTeam/agent-platform.git';
const CANONICAL_REPOSITORY_IDENTITY = 'github.com/headstarthealthteam/agent-platform';
const RECEIPT_FILE = '.headstart-agent-skills.json';

const usage = `Usage:
  pnpm skills:update -- --agent <${AGENT_HOST_VALUES.join('|')}> [--dry-run]
  pnpm skills:update -- --agent <${AGENT_HOST_VALUES.join('|')}> --apply --expected-commit <sha>

Options:
  --dry-run         Fetch and print the update plan without changing source or installed skills (default)
  --apply           Fast-forward the canonical checkout and reconcile repository-managed user skills
  --expected-commit Bind a manual apply to the exact remote commit shown by the approved preview
`;

export interface UpdateOptions {
  agent: AgentHost;
  apply: boolean;
  expectedCommit?: string;
  scheduled: boolean;
}

export interface UpdatePlan {
  repositoryRoot: string;
  localCommit: string;
  remoteCommit: string;
  incomingCommits: string[];
  changedSkills: string[];
  changedFileCount: number;
  canonicalSkills: string[];
  managedInstallation: boolean;
  unmanagedExistingSkills: string[];
}

export interface UpdateReceipt {
  schemaVersion: 1;
  repository: string;
  agent: AgentHost;
  commit: string;
  skills: string[];
  installedAt: string;
}

export interface UpdateResult {
  plan: UpdatePlan;
  receipt?: UpdateReceipt;
}

type GitRunner = (repositoryRoot: string, arguments_: string[]) => string;

interface UpdateDependencies {
  runGit?: GitRunner;
  homeDirectory?: string;
  expectedRemoteIdentity?: string;
  now?: () => Date;
}

const includesValue = <Value extends string>(
  values: readonly Value[],
  candidate: string
): candidate is Value => values.some((value) => value === candidate);

const requireValue = (arguments_: string[], index: number, flag: string): string => {
  const value = arguments_.at(index + 1);
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.\n\n${usage}`);
  }
  return value;
};

interface ParsedUpdateState {
  agent: AgentHost | undefined;
  apply: boolean;
  dryRun: boolean;
  expectedCommit: string | undefined;
  scheduled: boolean;
}

const validateUpdateOptions = (state: ParsedUpdateState): UpdateOptions => {
  const { agent, apply, dryRun, expectedCommit, scheduled } = state;
  if (!agent) {
    throw new Error(`--agent is required.\n\n${usage}`);
  }
  if (apply && dryRun) {
    throw new Error(`Choose either --dry-run or --apply, not both.\n\n${usage}`);
  }
  if (expectedCommit && !/^[0-9a-f]{40,64}$/.test(expectedCommit)) {
    throw new Error(`--expected-commit requires a full Git commit SHA.\n\n${usage}`);
  }
  if (!apply && (expectedCommit || scheduled)) {
    throw new Error(`--expected-commit and --scheduled require --apply.\n\n${usage}`);
  }
  if (apply && scheduled && expectedCommit) {
    throw new Error(`Scheduled updates cannot use --expected-commit.\n\n${usage}`);
  }
  if (apply && !scheduled && !expectedCommit) {
    throw new Error(
      `Manual updates require --expected-commit from the approved preview.\n\n${usage}`
    );
  }
  return { agent, apply, scheduled, ...(expectedCommit ? { expectedCommit } : {}) };
};

export const parseUpdateArgs = (arguments_: string[]): UpdateOptions => {
  let agent: AgentHost | undefined;
  let apply = false;
  let dryRun = false;
  let expectedCommit: string | undefined;
  let scheduled = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_.at(index);
    switch (argument) {
      case undefined:
      case '--':
        break;
      case '--agent': {
        const value = requireValue(arguments_, index, '--agent');
        if (!includesValue(AGENT_HOST_VALUES, value)) {
          throw new Error(`Unsupported agent host: ${value}.\n\n${usage}`);
        }
        agent = value;
        index += 1;
        break;
      }
      case '--apply':
        apply = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--expected-commit': {
        expectedCommit = requireValue(arguments_, index, '--expected-commit').toLowerCase();
        index += 1;
        break;
      }
      case '--scheduled':
        scheduled = true;
        break;
      case '--help':
      case '-h':
        throw new Error(usage);
      default:
        throw new Error(`Unknown argument: ${argument}.\n\n${usage}`);
    }
  }

  return validateUpdateOptions({
    agent,
    apply,
    dryRun,
    expectedCommit,
    scheduled,
  });
};

const normalizePathIdentity = (value: string): string =>
  `file:${path.resolve(value).replaceAll('\\', '/').toLowerCase()}`;

export const normalizeRemoteIdentity = (remoteUrl: string): string => {
  const value = remoteUrl
    .trim()
    .replace(/\/$/, '')
    .replace(/\.git$/, '');
  if (path.isAbsolute(value) || value.startsWith('.')) {
    return normalizePathIdentity(value);
  }

  const scpSeparator = value.indexOf(':');
  if (scpSeparator > 0 && !value.includes('://')) {
    const hostWithUser = value.slice(0, scpSeparator);
    const host = hostWithUser.slice(hostWithUser.lastIndexOf('@') + 1);
    const repositoryPath = value.slice(scpSeparator + 1);
    return `${host}/${repositoryPath}`.toLowerCase();
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'file:') {
      return normalizePathIdentity(fileURLToPath(parsed));
    }
    return `${parsed.hostname}${parsed.pathname}`
      .replace(/\/$/, '')
      .replace(/\.git$/, '')
      .toLowerCase();
  } catch {
    return normalizePathIdentity(value);
  }
};

export const isExpectedRemote = (
  remoteUrl: string,
  expectedRemote: string = CANONICAL_REMOTE_URL
): boolean => normalizeRemoteIdentity(remoteUrl) === normalizeRemoteIdentity(expectedRemote);

export const runGitCommand: GitRunner = (repositoryRoot, arguments_) => {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: withoutRepositoryLocalGitEnvironment(process.env),
  });
  if (result.error) {
    throw new Error(`Unable to run Git: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${arguments_.join(' ')}`);
  }
  return result.stdout.trim();
};

const canonicalPath = (value: string): string => {
  const normalized = path.normalize(fs.realpathSync.native(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

const parseDistance = (rawDistance: string): { ahead: number; behind: number } => {
  const [aheadValue, behindValue] = rawDistance.trim().split(/\s+/);
  const ahead = Number(aheadValue);
  const behind = Number(behindValue);
  if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
    throw new Error(`Git returned an invalid branch distance: ${rawDistance}`);
  }
  return { ahead, behind };
};

const lines = (value: string): string[] =>
  value.length === 0 ? [] : value.split(/\r?\n/).filter((line) => line.length > 0);

const changedSkillNames = (changedFiles: string[]): string[] => {
  const skillNames = new Set<string>();
  for (const file of changedFiles) {
    const match = /^skills\/([^/]+)\//.exec(file);
    if (match?.[1]) {
      skillNames.add(match[1]);
    }
  }
  return [...skillNames].sort();
};

const validateCandidateCommit = (
  repositoryRoot: string,
  commit: string,
  runGit: GitRunner
): string[] => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-skills-candidate-'));
  const candidateRoot = path.join(temporaryRoot, 'checkout');
  let worktreeAdded = false;
  try {
    runGit(repositoryRoot, ['worktree', 'add', '--detach', '--quiet', candidateRoot, commit]);
    worktreeAdded = true;
    const validationIssues = validateRepository(candidateRoot);
    if (validationIssues.length > 0) {
      throw new Error(
        `Refusing invalid source at ${commit}:\n${validationIssues
          .map((issue) => `- ${issue.file}: ${issue.message}`)
          .join('\n')}`
      );
    }
    return fs
      .readdirSync(path.join(candidateRoot, 'skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } finally {
    try {
      if (worktreeAdded) {
        runGit(repositoryRoot, ['worktree', 'remove', '--force', candidateRoot]);
      }
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
};

export const inspectUpdate = (
  repositoryRoot: string,
  dependencies: UpdateDependencies = {}
): UpdatePlan => {
  const runGit = dependencies.runGit ?? runGitCommand;
  const topLevel = runGit(repositoryRoot, ['rev-parse', '--show-toplevel']);
  if (canonicalPath(topLevel) !== canonicalPath(repositoryRoot)) {
    throw new Error(
      'Run the updater from the root of the canonical Headstart Agent Platform checkout.'
    );
  }
  if (runGit(repositoryRoot, ['status', '--porcelain']).length > 0) {
    throw new Error(
      'Refusing to update a dirty checkout. Commit, stash, or discard changes first.'
    );
  }
  const branch = runGit(repositoryRoot, ['branch', '--show-current']);
  if (branch !== DEFAULT_BRANCH) {
    throw new Error(
      `Refusing to update branch ${branch || '(detached)'}. Use a clean main checkout.`
    );
  }

  const remoteUrl = runGit(repositoryRoot, ['remote', 'get-url', DEFAULT_REMOTE]);
  if (!isExpectedRemote(remoteUrl, dependencies.expectedRemoteIdentity)) {
    throw new Error('Refusing to update from an unexpected origin remote.');
  }

  runGit(repositoryRoot, ['fetch', '--no-tags', DEFAULT_REMOTE, DEFAULT_BRANCH]);
  const localCommit = runGit(repositoryRoot, ['rev-parse', 'HEAD']);
  const remoteCommit = runGit(repositoryRoot, ['rev-parse', `${DEFAULT_REMOTE}/${DEFAULT_BRANCH}`]);
  const distance = parseDistance(
    runGit(repositoryRoot, [
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...${DEFAULT_REMOTE}/${DEFAULT_BRANCH}`,
    ])
  );
  if (distance.ahead > 0) {
    const state = distance.behind > 0 ? 'diverged from' : 'is ahead of';
    throw new Error(`Refusing to update because local main ${state} origin/main.`);
  }

  const range = `${localCommit}..${remoteCommit}`;
  const changedFiles =
    localCommit === remoteCommit
      ? []
      : lines(runGit(repositoryRoot, ['diff', '--name-only', range]));
  const incomingCommits =
    localCommit === remoteCommit
      ? []
      : lines(runGit(repositoryRoot, ['log', '--format=%h%x09%s', range]));
  const canonicalSkills = validateCandidateCommit(repositoryRoot, remoteCommit, runGit);

  return {
    repositoryRoot,
    localCommit,
    remoteCommit,
    incomingCommits,
    changedSkills: changedSkillNames(changedFiles),
    changedFileCount: changedFiles.length,
    canonicalSkills,
    managedInstallation: false,
    unmanagedExistingSkills: [],
  };
};

const listRelativeFiles = (root: string, current: string = root): string[] => {
  const files: string[] = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const resolved = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(root, resolved));
    } else if (entry.isFile()) {
      files.push(path.relative(root, resolved));
    } else {
      throw new Error(`Unsupported installed skill entry: ${resolved}`);
    }
  }
  return files.sort();
};

export const verifyInstalledSkills = (operations: InstallOperation[]): void => {
  for (const operation of operations) {
    const sourceFiles = listRelativeFiles(operation.source);
    const destinationFiles = listRelativeFiles(operation.destination);
    if (sourceFiles.join('\n') !== destinationFiles.join('\n')) {
      throw new Error(`Installed skill file list differs from source: ${operation.skillName}`);
    }
    for (const relativeFile of sourceFiles) {
      const source = fs.readFileSync(path.join(operation.source, relativeFile));
      const destination = fs.readFileSync(path.join(operation.destination, relativeFile));
      if (!source.equals(destination)) {
        throw new Error(`Installed skill content differs from source: ${operation.skillName}`);
      }
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readReceipt = (receiptFile: string, agent: AgentHost): UpdateReceipt | undefined => {
  if (!fs.existsSync(receiptFile)) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  if (
    !isRecord(parsed) ||
    parsed['schemaVersion'] !== 1 ||
    parsed['repository'] !== CANONICAL_REPOSITORY_IDENTITY ||
    parsed['agent'] !== agent ||
    typeof parsed['commit'] !== 'string' ||
    !Array.isArray(parsed['skills']) ||
    parsed['skills'].some((skill) => typeof skill !== 'string') ||
    typeof parsed['installedAt'] !== 'string'
  ) {
    throw new Error(`Refusing to replace an invalid update receipt: ${receiptFile}`);
  }

  return parsed as unknown as UpdateReceipt;
};

const writeReceipt = (receiptFile: string, receipt: UpdateReceipt): void => {
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  const temporaryFile = `${receiptFile}.${String(process.pid)}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporaryFile, receiptFile);
};

const removeRetiredManagedSkills = (
  installRoot: string,
  previousReceipt: UpdateReceipt | undefined,
  currentSkills: string[]
): void => {
  const currentSkillNames = new Set(currentSkills);
  for (const skillName of previousReceipt?.skills ?? []) {
    if (currentSkillNames.has(skillName)) {
      continue;
    }
    const destination = path.resolve(installRoot, skillName);
    if (path.dirname(destination) !== path.resolve(installRoot)) {
      throw new Error(`Refusing to remove an unsafe managed skill path: ${skillName}`);
    }
    console.log(`Will remove retired managed skill: ${skillName}`);
    fs.rmSync(destination, { recursive: true, force: true });
  }
};

export const applyUpdate = (
  plan: UpdatePlan,
  options: UpdateOptions,
  dependencies: UpdateDependencies = {}
): UpdateReceipt => {
  if (!options.apply) {
    throw new Error('Applying an update requires the explicit --apply flag.');
  }
  if (!options.scheduled && options.expectedCommit !== plan.remoteCommit) {
    throw new Error(
      `Remote main is now ${plan.remoteCommit}, not the approved commit ${options.expectedCommit ?? '(missing)'}. Preview again before applying.`
    );
  }
  if (options.scheduled && !plan.managedInstallation) {
    throw new Error(
      'Scheduled updates require a prior managed installation. Run and approve a manual update first.'
    );
  }
  const runGit = dependencies.runGit ?? runGitCommand;
  if (plan.localCommit !== plan.remoteCommit) {
    runGit(plan.repositoryRoot, ['merge', '--ff-only', plan.remoteCommit]);
  }
  if (runGit(plan.repositoryRoot, ['rev-parse', 'HEAD']) !== plan.remoteCommit) {
    throw new Error('The checkout did not reach the inspected remote commit.');
  }

  const installOptions: InstallOptions = {
    agent: options.agent,
    scope: 'user',
    projectDirectory: plan.repositoryRoot,
    skillNames: [],
    all: true,
    dryRun: false,
    force: true,
  };
  const operations = createInstallPlan(
    plan.repositoryRoot,
    installOptions,
    dependencies.homeDirectory
  );
  const installRoot = resolveInstallRoot(
    options.agent,
    'user',
    plan.repositoryRoot,
    dependencies.homeDirectory
  );
  const receiptFile = path.join(installRoot, RECEIPT_FILE);
  const previousReceipt = readReceipt(receiptFile, options.agent);

  installSkills(operations, installOptions);
  verifyInstalledSkills(operations);
  const skillNames = operations.map((operation) => operation.skillName);
  removeRetiredManagedSkills(installRoot, previousReceipt, skillNames);

  const currentTime = (): Date => new Date();
  const receipt: UpdateReceipt = {
    schemaVersion: 1,
    repository: CANONICAL_REPOSITORY_IDENTITY,
    agent: options.agent,
    commit: plan.remoteCommit,
    skills: skillNames,
    installedAt: (dependencies.now ?? currentTime)().toISOString(),
  };
  writeReceipt(receiptFile, receipt);
  return receipt;
};

export const runSkillsUpdate = (
  repositoryRoot: string,
  options: UpdateOptions,
  dependencies: UpdateDependencies = {}
): UpdateResult => {
  const inspectedPlan = inspectUpdate(repositoryRoot, dependencies);
  const installRoot = resolveInstallRoot(
    options.agent,
    'user',
    repositoryRoot,
    dependencies.homeDirectory
  );
  const receipt = readReceipt(path.join(installRoot, RECEIPT_FILE), options.agent);
  const unmanagedExistingSkills = receipt
    ? []
    : inspectedPlan.canonicalSkills.filter((skillName) =>
        fs.existsSync(path.join(installRoot, skillName))
      );
  const plan = {
    ...inspectedPlan,
    managedInstallation: receipt !== undefined,
    unmanagedExistingSkills,
  };
  return options.apply ? { plan, receipt: applyUpdate(plan, options, dependencies) } : { plan };
};

export const printUpdatePlan = (plan: UpdatePlan): void => {
  console.log(`Local commit:  ${plan.localCommit}`);
  console.log(`Remote commit: ${plan.remoteCommit}`);
  if (plan.incomingCommits.length === 0) {
    console.log('Incoming commits: none');
  } else {
    console.log('Incoming commits:');
    for (const commit of plan.incomingCommits) {
      console.log(`  ${commit}`);
    }
  }
  console.log(
    `Changed skills: ${plan.changedSkills.length > 0 ? plan.changedSkills.join(', ') : 'none'}`
  );
  console.log(`Changed repository files: ${String(plan.changedFileCount)}`);
  console.log(`Managed installation receipt: ${plan.managedInstallation ? 'present' : 'absent'}`);
  console.log(
    `Existing unreceipted skill names: ${
      plan.unmanagedExistingSkills.length > 0 ? plan.unmanagedExistingSkills.join(', ') : 'none'
    }`
  );
};

/* v8 ignore start -- exercised by command-level usage; reusable behavior is unit tested above */
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const options = parseUpdateArgs(process.argv.slice(2));
    const result = runSkillsUpdate(repositoryRoot, options);
    printUpdatePlan(result.plan);
    if (result.receipt) {
      console.log(
        `Installed ${String(result.receipt.skills.length)} skills at ${result.receipt.commit}.`
      );
    } else {
      console.log('Preview only. After review, apply this exact commit with:');
      console.log(
        `pnpm skills:update -- --agent ${options.agent} --apply --expected-commit ${result.plan.remoteCommit}`
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
/* v8 ignore stop */
