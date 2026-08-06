import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepository } from './validate-skills.js';

export type AgentHost = 'codex' | 'claude-code' | 'cursor';
export type InstallScope = 'project' | 'user';

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

const AGENT_HOSTS = new Set<AgentHost>(['codex', 'claude-code', 'cursor']);
const INSTALL_SCOPES = new Set<InstallScope>(['project', 'user']);

const usage = `Usage:
  pnpm skills:install -- --agent <codex|claude-code|cursor> --scope <user|project> (--all | --skill <name>...) [options]

Options:
  --project-dir <path>  Project root for project-scope installs (default: current directory)
  --dry-run             Print the install plan without writing files
  --force               Replace an existing installed skill directory
`;

const requireValue = (args: string[], index: number, flag: string): string => {
  const value = args[index + 1];
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
    const argument = args[index];
    switch (argument) {
      case '--':
        break;
      case '--agent': {
        const value = requireValue(args, index, '--agent');
        if (!AGENT_HOSTS.has(value as AgentHost)) {
          throw new Error(`Unsupported agent host: ${value}.\n\n${usage}`);
        }
        agent = value as AgentHost;
        index += 1;
        break;
      }
      case '--scope': {
        const value = requireValue(args, index, '--scope');
        if (!INSTALL_SCOPES.has(value as InstallScope)) {
          throw new Error(`Unsupported install scope: ${value}.\n\n${usage}`);
        }
        scope = value as InstallScope;
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
        throw new Error(`Unknown argument: ${String(argument)}.\n\n${usage}`);
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
    return agent === 'claude-code'
      ? path.join(projectDirectory, '.claude', 'skills')
      : path.join(projectDirectory, '.agents', 'skills');
  }

  switch (agent) {
    case 'codex':
      return path.join(homeDirectory, '.agents', 'skills');
    case 'claude-code':
      return path.join(homeDirectory, '.claude', 'skills');
    case 'cursor':
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

    fs.mkdirSync(path.dirname(operation.destination), { recursive: true });
    if (operation.replacesExisting) {
      fs.rmSync(operation.destination, { recursive: true, force: true });
    }
    fs.cpSync(operation.source, operation.destination, { recursive: true });
  }
};

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
