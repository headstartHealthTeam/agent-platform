import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalPath } from './canonical-path.js';
import {
  inspectInstalledSkills,
  installReviewedSkills,
  printUpdatePlan,
  runSkillsUpdate,
  verifyManagedSkills,
} from './update-skills.js';
import {
  repositoryFor,
  selectRepositories,
  type WorkspaceRepository,
} from './workspace-catalog.js';
import {
  applyFiles,
  digest,
  hasWorkspaceReceipt,
  planFiles,
  templateDiff,
  templatePlanToken,
  workspaceRoot,
  withWorkspaceLock,
  type TemplateOptions,
} from './workspace-files.js';
import {
  assertFeatureWorktree,
  inspectRepository,
  newWorkspaceWorktree,
  provisionRepository,
  runWorkspaceGit,
  type WorkspaceGit,
} from './workspace-git.js';
import {
  applyHostRouting,
  installedHosts,
  planHostRouting,
  selectHosts,
  type HostPlan,
  type WorkspaceHost,
} from './workspace-hosts.js';
import { readKnowledge, searchKnowledge } from './workspace-knowledge.js';
import {
  ASSERT_WORKTREE,
  NEW_WORKTREE,
  parseWorkspaceArgs,
  type WorkspaceOptions,
} from './workspace-options.js';
import { installWorkspaceRuntime, workspaceSource } from './workspace-runtime.js';
import { workspaceTemplates } from './workspace-templates.js';

const AGENT_PLATFORM = 'agent-platform';

export { parseWorkspaceArgs } from './workspace-options.js';
export type { WorkspaceOptions } from './workspace-options.js';

export interface WorkspaceServices {
  homeDirectory?: string;
  installRuntime?: (root: string) => void;
  expectedRemoteIdentity?: string;
}

const configuredHosts = (options: WorkspaceOptions): WorkspaceHost[] =>
  options.hosts === undefined ? installedHosts(options.root) : selectHosts(options.hosts);
const templateOptions = (options: WorkspaceOptions): TemplateOptions => ({
  upgrade: options.command === 'upgrade',
  keepLocal: options.keepLocal ?? [],
});
const selectedRepositories = (
  options: WorkspaceOptions,
  hosts: readonly WorkspaceHost[]
): readonly WorkspaceRepository[] => {
  const selected = [...selectRepositories(options.repositories)];
  if (hosts.length > 0 && !selected.some((repo) => repo.hub === AGENT_PLATFORM))
    selected.unshift(repositoryFor(AGENT_PLATFORM));
  return selected;
};

const fullPlanToken = (
  options: WorkspaceOptions,
  revision: string,
  plans: readonly HostPlan[]
): string =>
  digest(
    JSON.stringify({
      template: templatePlanToken(options.root, revision, templateOptions(options)),
      hosts: plans.map((plan) => ({
        host: plan.host,
        file: plan.file,
        before: plan.before === null ? null : digest(plan.before),
        after: digest(plan.after),
      })),
    })
  );

const printTemplates = (
  options: WorkspaceOptions,
  revision: string,
  plans: readonly HostPlan[]
): void => {
  const files = planFiles(options.root, templateOptions(options));
  console.log(
    JSON.stringify(
      {
        root: options.root,
        sourceRevision: revision,
        expectedPlan: fullPlanToken(options, revision, plans),
        receipt: hasWorkspaceReceipt(options.root) ? 'present' : 'missing',
        files,
        hostRouting: plans.map(({ host, file, action, block }) => ({
          host,
          file,
          action,
          proposedBlock: block,
        })),
      },
      null,
      2
    )
  );
  if (options.diff)
    for (const item of files) {
      if (item.action === 'update' || item.action === 'conflict')
        console.log(
          templateDiff(options.root, item.path, workspaceTemplates().get(item.path) ?? '')
        );
    }
};

const assertSourceClean = (source: string, git: WorkspaceGit): string => {
  if (git(source, ['status', '--porcelain']) !== '')
    throw new Error('Use a clean, reviewed Agent Platform source checkout before applying setup.');
  return git(source, ['rev-parse', 'HEAD']);
};

const setupRepositories = (
  options: WorkspaceOptions,
  hosts: readonly WorkspaceHost[],
  revision: string,
  git: WorkspaceGit
): boolean => {
  let complete = true;
  for (const repository of selectedRepositories(options, hosts)) {
    if (!options.clone) {
      console.log(`${repository.hub}: cataloged; Git provisioning not requested`);
      continue;
    }
    if (!options.apply) {
      console.log(
        `${repository.hub}: planned anchor and ${repository.baseline} checkout; remote access unchecked`
      );
      continue;
    }
    try {
      console.log(
        `${repository.hub}: ${provisionRepository(options.root, repository, git, revision)}`
      );
    } catch (error) {
      complete = false;
      console.log(
        `${repository.hub}: incomplete: ${error instanceof Error ? error.message : 'setup failed'}`
      );
    }
  }
  return complete;
};

const assertSkillAdoption = (
  source: string,
  hosts: readonly WorkspaceHost[],
  home: string,
  adopt: boolean
): void => {
  for (const host of hosts) {
    const state = inspectInstalledSkills(source, host, home);
    console.log(
      `${host}: ${state.managed ? 'managed skills' : 'initial skill installation'}; unreceipted collisions: ${state.unmanaged.join(', ') || 'none'}`
    );
    if (state.unmanaged.length > 0 && !adopt)
      throw new Error(
        'Review unreceipted skill collisions, then use --adopt-skills only if replacement is intended.'
      );
  }
};

const finishOnboarding = (
  options: WorkspaceOptions,
  hosts: readonly WorkspaceHost[],
  plans: readonly HostPlan[],
  git: WorkspaceGit,
  services: WorkspaceServices
): boolean => {
  const source = workspaceSource(options.root);
  if (!fs.existsSync(path.join(source, 'scripts/workspace-cli.ts'))) {
    if (hosts.length > 0)
      throw new Error(
        'Host onboarding requires the Agent Platform source in this workspace. Include --clone.'
      );
    console.log(
      'Workspace files created; runtime and host onboarding remain incomplete. Include agent-platform in --clone.'
    );
    return false;
  }
  const revision = assertSourceClean(source, git);
  const home = services.homeDirectory ?? os.homedir();
  assertSkillAdoption(source, hosts, home, options.adoptSkills ?? false);
  (services.installRuntime ?? installWorkspaceRuntime)(options.root);
  for (const host of hosts) {
    installReviewedSkills(source, host, revision, {
      runGit: (cwd, args) => git(cwd, args),
      homeDirectory: home,
      ...(services.expectedRemoteIdentity
        ? { expectedRemoteIdentity: services.expectedRemoteIdentity }
        : {}),
    });
  }
  applyHostRouting(options.root, plans);
  console.log(
    'Workspace helpers and selected host skills/routing installed. Start a fresh agent session. Credentials and application services follow their repository runbooks. Daily refresh remains opt-in.'
  );
  return true;
};

const runTemplates = (
  options: WorkspaceOptions,
  source: string,
  git: WorkspaceGit,
  services: WorkspaceServices
): number => {
  const hosts = configuredHosts(options);
  const plans = planHostRouting(options.root, hosts, services.homeDirectory);
  const revision = options.apply
    ? assertSourceClean(source, git)
    : git(source, ['rev-parse', 'HEAD']);
  printTemplates(options, revision, plans);
  if (options.command === 'setup' && hosts.length > 0) {
    assertSkillAdoption(
      source,
      hosts,
      services.homeDirectory ?? os.homedir(),
      !options.apply || (options.adoptSkills ?? false)
    );
    const installedSource = workspaceSource(options.root);
    if (
      options.apply &&
      fs.existsSync(installedSource) &&
      assertSourceClean(installedSource, git) !== revision
    )
      throw new Error(
        'Existing workspace source differs from this setup source. Use its bin/headstart skills and upgrade commands first.'
      );
  }
  const conflicts =
    planFiles(options.root, templateOptions(options)).some((item) => item.action === 'conflict') ||
    plans.some((plan) => plan.action === 'conflict');
  if (!options.apply) {
    if (options.command === 'setup') setupRepositories(options, hosts, revision, git);
    return conflicts ? 1 : 0;
  }
  if (conflicts) throw new Error('Existing files conflict with this plan; no files were changed.');
  if (
    options.command === 'upgrade' &&
    options.expectedPlan !== fullPlanToken(options, revision, plans)
  )
    throw new Error(
      'Source, routing or files changed since preview. Use --expected-plan from a fresh preview.'
    );
  return withWorkspaceLock(options.root, () => {
    applyFiles(
      options.root,
      revision,
      templateOptions(options),
      templatePlanToken(options.root, revision, templateOptions(options))
    );
    if (options.command === 'upgrade') {
      applyHostRouting(options.root, plans);
      return 0;
    }
    const complete = setupRepositories(options, hosts, revision, git);
    // File-only setup is deliberate; full host onboarding additionally requires the source/runtime.
    const onboarded =
      hosts.length > 0 ||
      (options.clone &&
        selectedRepositories(options, hosts).some(
          (repository) => repository.hub === AGENT_PLATFORM
        ))
        ? finishOnboarding(options, hosts, plans, git, services)
        : true;
    return complete && onboarded ? 0 : 1;
  });
};

const runDoctor = (
  options: WorkspaceOptions,
  git: WorkspaceGit,
  services: WorkspaceServices
): number => {
  const hosts = configuredHosts(options);
  const files = planFiles(options.root);
  const plans = planHostRouting(options.root, hosts, services.homeDirectory);
  let incomplete =
    !hasWorkspaceReceipt(options.root) ||
    files.some((item) => item.action === 'create' || item.action === 'conflict');
  console.log(
    JSON.stringify(
      { files, hosts: plans.map(({ host, file, action }) => ({ host, file, action })) },
      null,
      2
    )
  );
  for (const repository of selectedRepositories(options, hosts)) {
    const status = inspectRepository(options.root, repository, git);
    console.log(`${repository.hub}: ${status}`);
    if (status.startsWith('incomplete:')) incomplete = true;
  }
  if (plans.some((plan) => plan.action !== 'unchanged')) incomplete = true;
  for (const host of hosts) {
    try {
      const source = workspaceSource(options.root);
      verifyManagedSkills(source, host, assertSourceClean(source, git), services.homeDirectory);
      console.log(`${host}: installed skills match the workspace source`);
    } catch {
      incomplete = true;
      console.log(
        `${host}: skill installation is missing, modified or out of date; preview bin/headstart skills`
      );
    }
  }
  const runtime = fs.existsSync(
    path.join(workspaceSource(options.root), 'node_modules/tsx/package.json')
  );
  console.log(
    `Workspace runtime: ${runtime ? 'installed' : 'missing'}; host routing: ${hosts.length > 0 ? 'selected' : 'not configured'}. Model behavior, credentials and application readiness require their own checks.`
  );
  if (hosts.length > 0 && !runtime) incomplete = true;
  return incomplete ? 1 : 0;
};

const runSkillUpdates = (
  options: WorkspaceOptions,
  git: WorkspaceGit,
  services: WorkspaceServices
): number => {
  const source = workspaceSource(options.root);
  const hosts = configuredHosts(options);
  if (hosts.length === 0) throw new Error('Select at least one --hosts value for skill updates.');
  if (options.apply)
    assertSkillAdoption(
      source,
      hosts,
      services.homeDirectory ?? os.homedir(),
      options.adoptSkills ?? false
    );
  for (const host of hosts) {
    const result = runSkillsUpdate(
      source,
      {
        agent: host,
        apply: options.apply,
        ...(options.expectedCommit ? { expectedCommit: options.expectedCommit } : {}),
        scheduled: false,
      },
      {
        runGit: (cwd, args) => git(cwd, args),
        homeDirectory: services.homeDirectory ?? os.homedir(),
        ...(services.expectedRemoteIdentity
          ? { expectedRemoteIdentity: services.expectedRemoteIdentity }
          : {}),
      }
    );
    printUpdatePlan(result.plan);
  }
  if (options.apply) (services.installRuntime ?? installWorkspaceRuntime)(options.root);
  console.log(
    'Next: run bin/headstart upgrade --diff to preview workspace templates using the current source; apply its reviewed --expected-plan.'
  );
  return 0;
};

export const runWorkspace = (
  options: WorkspaceOptions,
  sourceRoot: string,
  git: WorkspaceGit = runWorkspaceGit,
  services: WorkspaceServices = {}
): number => {
  const root = workspaceRoot(options.root);
  if (options.command === 'setup' || options.command === 'upgrade')
    return runTemplates(options, sourceRoot, git, services);
  if (options.command === 'doctor') return runDoctor(options, git, services);
  if (options.command === 'skills')
    return options.apply
      ? withWorkspaceLock(root, () => runSkillUpdates(options, git, services))
      : runSkillUpdates(options, git, services);
  if (options.command === 'search') {
    console.log(JSON.stringify(searchKnowledge(root, options.query ?? ''), null, 2));
    return 0;
  }
  if (options.command === 'read') {
    console.log(readKnowledge(root, options.page ?? ''));
    return 0;
  }
  const repository = repositoryFor(options.repo ?? '');
  if (options.command === ASSERT_WORKTREE) {
    assertFeatureWorktree(root, repository, options.checkout, git);
    console.log('Worktree location and Git anchor verified.');
  } else if (options.command === NEW_WORKTREE) {
    console.log(
      withWorkspaceLock(root, () =>
        newWorkspaceWorktree(
          root,
          repository,
          { name: options.name ?? '', branch: options.branch ?? '', base: options.base },
          git
        )
      )
    );
  }
  return 0;
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
if (
  process.argv[1] &&
  fs.existsSync(process.argv[1]) &&
  canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))
)
  main();
