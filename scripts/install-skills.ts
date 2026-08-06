import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRepository } from './validate-skills.js';

const CODEX_HOST = 'codex';
const CLAUDE_CODE_HOST = 'claude-code';
const CURSOR_HOST = 'cursor';
const AGENT_HOST_VALUES = [CODEX_HOST, CLAUDE_CODE_HOST, CURSOR_HOST] as const;
const INSTALL_SCOPE_VALUES = ['project', 'user'] as const;

export type AgentHost = (typeof AGENT_HOST_VALUES)[number];
export type InstallScope = (typeof INSTALL_SCOPE_VALUES)[number];

export interface InstallOptions {
  agent: AgentHost;
  scope: InstallScope;
  projectDirectory: string;
  skillNames: string[];
  all: boolean;
  dryRun: boolean;
  force: boolean;
}

export interface InstallOperation {
  skillName: string;
  source: string;
  destination: string;
  replacesExisting: boolean;
}

const includesValue = <Value extends string>(
  values: readonly Value[],
  candidate: string
): candidate is Value => values.some((value) => value === candidate);

const usage = `Usage:
  pnpm skills:install -- --agent <${AGENT_HOST_VALUES.join('|')}> --scope <${INSTALL_SCOPE_VALUES.join('|')}> (--all | --skill <name>...) [options]

Options:
  --project-dir <path>  Project root for project-scope installs (default: current directory)
  --dry-run             Print the install plan without writing files
  --force               Replace an existing installed skill directory
`;

const requireValue = (args: string[], index: number, flag: string): string => {
  const value = args.at(index + 1);
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.\n\n${usage}`);
  }
  return value;
};

export const parseInstallArgs = (args: string[], cwd: string = process.cwd()): InstallOptions => {
  let agent: AgentHost | undefined;
  let scope: InstallScope | undefined;
  let projectDirectory = cwd;
  const skillNames: string[] = [];
  let all = false;
  let dryRun = false;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args.at(index);
    if (argument === undefined) {
      continue;
    }
    switch (argument) {
      case '--':
        break;
      case '--agent': {
        const value = requireValue(args, index, '--agent');
        if (!includesValue(AGENT_HOST_VALUES, value)) {
          throw new Error(`Unsupported agent host: ${value}.\n\n${usage}`);
        }
        agent = value;
        index += 1;
        break;
      }
      case '--scope': {
        const value = requireValue(args, index, '--scope');
        if (!includesValue(INSTALL_SCOPE_VALUES, value)) {
          throw new Error(`Unsupported install scope: ${value}.\n\n${usage}`);
        }
        scope = value;
        index += 1;
        break;
      }
      case '--project-dir':
        projectDirectory = path.resolve(requireValue(args, index, '--project-dir'));
        index += 1;
        break;
      case '--skill':
        skillNames.push(requireValue(args, index, '--skill'));
        index += 1;
        break;
      case '--all':
        all = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--force':
        force = true;
        break;
      case '--help':
      case '-h':
        throw new Error(usage);
      default:
        throw new Error(`Unknown argument: ${argument}.\n\n${usage}`);
    }
  }

  if (!agent || !scope) {
    throw new Error(`--agent and --scope are required.\n\n${usage}`);
  }
  if (all === skillNames.length > 0) {
    throw new Error(`Choose exactly one of --all or one or more --skill arguments.\n\n${usage}`);
  }

  return {
    agent,
    scope,
    projectDirectory,
    skillNames: [...new Set(skillNames)],
    all,
    dryRun,
    force,
  };
};

export const resolveInstallRoot = (
  agent: AgentHost,
  scope: InstallScope,
  projectDirectory: string,
  homeDirectory: string = os.homedir()
): string => {
  if (scope === 'project') {
    return agent === CLAUDE_CODE_HOST
      ? path.join(projectDirectory, '.claude', 'skills')
      : path.join(projectDirectory, '.agents', 'skills');
  }

  switch (agent) {
    case CODEX_HOST:
      return path.join(homeDirectory, '.agents', 'skills');
    case CLAUDE_CODE_HOST:
      return path.join(homeDirectory, '.claude', 'skills');
    case CURSOR_HOST:
      return path.join(homeDirectory, '.cursor', 'skills');
  }
};

export const createInstallPlan = (
  repositoryRoot: string,
  options: InstallOptions,
  homeDirectory?: string
): InstallOperation[] => {
  const skillsRoot = path.join(repositoryRoot, 'skills');
  const availableSkills = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const selectedSkills = options.all ? availableSkills : options.skillNames;

  for (const skillName of selectedSkills) {
    if (!availableSkills.includes(skillName)) {
      throw new Error(
        `Unknown skill: ${skillName}. Available skills: ${availableSkills.join(', ')}`
      );
    }
  }

  const installRoot = resolveInstallRoot(
    options.agent,
    options.scope,
    options.projectDirectory,
    homeDirectory
  );
  return selectedSkills.map((skillName) => {
    const destination = path.join(installRoot, skillName);
    return {
      skillName,
      source: path.join(skillsRoot, skillName),
      destination,
      replacesExisting: fs.existsSync(destination),
    };
  });
};

export const installSkills = (operations: InstallOperation[], options: InstallOptions): void => {
  for (const operation of operations) {
    if (operation.replacesExisting && !options.force && !options.dryRun) {
      throw new Error(
        `${operation.destination} already exists. Rerun with --force after reviewing the source.`
      );
    }

    const action = operation.replacesExisting ? 'replace' : 'install';
    console.log(`${options.dryRun ? 'Would' : 'Will'} ${action} ${operation.skillName}:`);
    console.log(`  ${operation.source}`);
    console.log(`  -> ${operation.destination}`);

    if (options.dryRun) {
      continue;
    }

    replaceSkillDirectory(operation.source, operation.destination);
  }
};

const removeDirectory = (directory: string): void => {
  fs.rmSync(directory, { recursive: true, force: true });
};

const replaceSkillDirectory = (source: string, destination: string): void => {
  const parent = path.dirname(destination);
  const uniqueSuffix = `${String(process.pid)}-${Date.now().toString(36)}`;
  const staged = `${destination}.staged-${uniqueSuffix}`;
  const backup = `${destination}.backup-${uniqueSuffix}`;
  fs.mkdirSync(parent, { recursive: true });

  try {
    fs.cpSync(source, staged, { recursive: true, errorOnExist: true });
    const hadExisting = fs.existsSync(destination);
    if (hadExisting) {
      fs.renameSync(destination, backup);
    }
    try {
      fs.renameSync(staged, destination);
    } catch (error) {
      if (hadExisting && fs.existsSync(backup) && !fs.existsSync(destination)) {
        fs.renameSync(backup, destination);
      }
      throw error;
    }
    removeDirectory(backup);
  } finally {
    removeDirectory(staged);
    if (fs.existsSync(destination)) {
      removeDirectory(backup);
    }
  }
};

/* v8 ignore start -- exercised by command-level usage; reusable behavior is unit tested above */
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const issues = validateRepository(repositoryRoot);
    if (issues.length > 0) {
      throw new Error(
        `Refusing to install invalid skills:\n${issues
          .map((issue) => `- ${issue.file}: ${issue.message}`)
          .join('\n')}`
      );
    }
    const options = parseInstallArgs(process.argv.slice(2));
    const operations = createInstallPlan(repositoryRoot, options);
    installSkills(operations, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
/* v8 ignore stop */
