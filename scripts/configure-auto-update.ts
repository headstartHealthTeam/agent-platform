import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type AgentHost } from './install-skills.js';
import { runSkillsUpdate } from './update-skills.js';

const AGENT_HOST_VALUES = ['codex', 'claude-code', 'cursor'] as const;
const CONFIG_FILE = 'auto-update.json';
const UNIX_RUNNER_FILE = 'run-auto-update.sh';
const WINDOWS_RUNNER_FILE = 'run-auto-update.cmd';
const LOG_FILE = 'auto-update.log';
const CRON_MARKER = '# headstart-agent-skills-auto-update';
const WINDOWS_TASK_NAME = 'Headstart Agent Skills Auto Update';

const usage = `Usage:
  pnpm skills:auto-update -- --enable --agent <${AGENT_HOST_VALUES.join('|')}>
  pnpm skills:auto-update -- --disable --agent <${AGENT_HOST_VALUES.join('|')}>
  pnpm skills:auto-update -- --status
`;

type AutoUpdateAction = 'disable' | 'enable' | 'status';

export interface AutoUpdateOptions {
  action: AutoUpdateAction;
  agent?: AgentHost;
}

export interface AutoUpdateConfig {
  schemaVersion: 2;
  repositoryRoot: string;
  nodeExecutable: string;
  packageManager: PackageManagerCommand;
  logFile: string;
  agents: AgentHost[];
}

export interface PackageManagerCommand {
  executable: string;
  arguments: string[];
}

export interface ProcessResult {
  status: number;
  stdout: string;
}

type ProcessRunner = (
  command: string,
  arguments_: string[],
  options?: { input?: string }
) => ProcessResult;

interface AutoUpdateDependencies {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  stateDirectory?: string;
  nodeExecutable?: string;
  packageManager?: PackageManagerCommand;
  requiredPnpmVersion?: string;
  runProcess?: ProcessRunner;
  validateCheckout?: () => void;
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

export const parseAutoUpdateArgs = (arguments_: string[]): AutoUpdateOptions => {
  let action: AutoUpdateAction | undefined;
  let agent: AgentHost | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_.at(index);
    switch (argument) {
      case undefined:
      case '--':
        break;
      case '--enable':
      case '--disable':
      case '--status': {
        if (action) {
          throw new Error(`Choose exactly one auto-update action.\n\n${usage}`);
        }
        action = argument.slice(2) as AutoUpdateAction;
        break;
      }
      case '--agent': {
        const value = requireValue(arguments_, index, '--agent');
        if (!includesValue(AGENT_HOST_VALUES, value)) {
          throw new Error(`Unsupported agent host: ${value}.\n\n${usage}`);
        }
        agent = value;
        index += 1;
        break;
      }
      case '--help':
      case '-h':
        throw new Error(usage);
      default:
        throw new Error(`Unknown argument: ${argument}.\n\n${usage}`);
    }
  }

  if (!action) {
    throw new Error(`Choose an auto-update action.\n\n${usage}`);
  }
  if (action !== 'status' && !agent) {
    throw new Error(`--agent is required for ${action}.\n\n${usage}`);
  }
  if (action === 'status' && agent) {
    throw new Error(
      `--status reports every configured host and does not accept --agent.\n\n${usage}`
    );
  }

  return agent ? { action, agent } : { action };
};

export const defaultStateDirectory = (
  platform: NodeJS.Platform = process.platform,
  homeDirectory: string = os.homedir(),
  environment: NodeJS.ProcessEnv = process.env
): string => {
  if (platform === 'win32') {
    const localAppData = environment['LOCALAPPDATA'];
    return localAppData
      ? path.join(localAppData, 'Headstart', 'AgentSkills')
      : path.join(homeDirectory, 'AppData', 'Local', 'Headstart', 'AgentSkills');
  }
  if (platform === 'darwin') {
    return path.join(homeDirectory, 'Library', 'Application Support', 'Headstart Agent Skills');
  }
  return path.join(
    environment['XDG_STATE_HOME'] ?? path.join(homeDirectory, '.local', 'state'),
    'headstart-agent-skills'
  );
};

export const runProcessCommand: ProcessRunner = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    encoding: 'utf8',
    input: options.input,
  });
  if (result.error) {
    throw new Error(`Unable to run ${command}: ${result.error.message}`);
  }
  return { status: result.status ?? 1, stdout: result.stdout.trim() };
};

const findExecutable = (
  executableName: string,
  platform: NodeJS.Platform,
  runProcess: ProcessRunner
): string | undefined => {
  const command = platform === 'win32' ? 'where' : 'which';
  const result = runProcess(command, [executableName]);
  const candidates = result.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const executable =
    platform === 'win32'
      ? (candidates.find((candidate) => candidate.toLowerCase().endsWith('.cmd')) ?? candidates[0])
      : candidates[0];
  return result.status === 0 && executable ? path.resolve(executable.trim()) : undefined;
};

const validatePackageManager = (
  command: PackageManagerCommand,
  requiredPnpmVersion: string,
  runProcess: ProcessRunner
): void => {
  const result = runProcess(command.executable, [...command.arguments, '--version']);
  const actualVersion = result.stdout.trim();
  if (result.status !== 0 || actualVersion !== requiredPnpmVersion) {
    const reportedVersion = actualVersion || 'no version';
    throw new Error(
      `Automatic updates require pnpm ${requiredPnpmVersion}, but ${command.executable} reported ${reportedVersion}. ` +
        'Activate the packageManager version with Corepack, verify it, and retry.'
    );
  }
};

const findPackageManager = (
  platform: NodeJS.Platform,
  requiredPnpmVersion: string,
  runProcess: ProcessRunner
): PackageManagerCommand => {
  const corepackExecutable = findExecutable('corepack', platform, runProcess);
  if (corepackExecutable) {
    const command = { executable: corepackExecutable, arguments: ['pnpm'] };
    validatePackageManager(command, requiredPnpmVersion, runProcess);
    return command;
  }

  const pnpmExecutable = findExecutable('pnpm', platform, runProcess);
  if (pnpmExecutable) {
    const command = { executable: pnpmExecutable, arguments: [] };
    validatePackageManager(command, requiredPnpmVersion, runProcess);
    return command;
  }

  throw new Error(
    `Unable to locate Corepack or pnpm ${requiredPnpmVersion}. Install the repository package manager before enabling automatic updates.`
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAgentHost = (value: unknown): value is AgentHost =>
  typeof value === 'string' && includesValue(AGENT_HOST_VALUES, value);

export const readRequiredPnpmVersion = (repositoryRoot: string): string => {
  const manifestFile = path.join(repositoryRoot, 'package.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!isRecord(parsed) || typeof parsed['packageManager'] !== 'string') {
    throw new Error(`Missing exact packageManager declaration in ${manifestFile}.`);
  }

  const descriptor = parsed['packageManager'];
  const versionWithIntegrity = descriptor.startsWith('pnpm@') ? descriptor.slice(5) : '';
  const requiredPnpmVersion = versionWithIntegrity.split('+')[0];
  const versionParts = requiredPnpmVersion?.split('.') ?? [];
  const isExactVersion =
    versionParts.length === 3 &&
    versionParts.every((part) => {
      const numericPart = Number(part);
      return Number.isSafeInteger(numericPart) && numericPart >= 0 && String(numericPart) === part;
    });
  const engines = parsed['engines'];
  if (
    requiredPnpmVersion === undefined ||
    !isExactVersion ||
    !isRecord(engines) ||
    engines['pnpm'] !== requiredPnpmVersion
  ) {
    throw new Error(
      `packageManager and engines.pnpm must declare the same exact pnpm version in ${manifestFile}.`
    );
  }
  return requiredPnpmVersion;
};

const hasCommonConfigFields = (
  parsed: Record<string, unknown>
): parsed is Record<string, unknown> & {
  repositoryRoot: string;
  nodeExecutable: string;
  logFile: string;
  agents: AgentHost[];
} =>
  typeof parsed['repositoryRoot'] === 'string' &&
  typeof parsed['nodeExecutable'] === 'string' &&
  typeof parsed['logFile'] === 'string' &&
  Array.isArray(parsed['agents']) &&
  parsed['agents'].every(isAgentHost);

const readConfig = (configFile: string): AutoUpdateConfig | undefined => {
  if (!fs.existsSync(configFile)) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!isRecord(parsed) || !hasCommonConfigFields(parsed)) {
    throw new Error(`Invalid automatic-update configuration: ${configFile}`);
  }

  const packageManager = parsed['packageManager'];
  if (
    parsed['schemaVersion'] === 2 &&
    isRecord(packageManager) &&
    typeof packageManager['executable'] === 'string' &&
    Array.isArray(packageManager['arguments']) &&
    packageManager['arguments'].every((argument) => typeof argument === 'string')
  ) {
    return {
      schemaVersion: 2,
      repositoryRoot: parsed.repositoryRoot,
      nodeExecutable: parsed.nodeExecutable,
      packageManager: {
        executable: packageManager['executable'],
        arguments: [...packageManager['arguments']],
      },
      logFile: parsed.logFile,
      agents: [...parsed.agents],
    };
  }

  const legacyPnpmExecutable = parsed['pnpmExecutable'];
  if (parsed['schemaVersion'] === 1 && typeof legacyPnpmExecutable === 'string') {
    return {
      schemaVersion: 2,
      repositoryRoot: parsed.repositoryRoot,
      nodeExecutable: parsed.nodeExecutable,
      packageManager: { executable: legacyPnpmExecutable, arguments: [] },
      logFile: parsed.logFile,
      agents: [...parsed.agents],
    };
  }

  throw new Error(`Invalid automatic-update configuration: ${configFile}`);
};

const writeConfig = (configFile: string, config: AutoUpdateConfig): void => {
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
};

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`;

const renderUnixPackageManager = (config: AutoUpdateConfig): string =>
  [config.packageManager.executable, ...config.packageManager.arguments]
    .map((argument) => shellQuote(argument))
    .join(' ');

export const renderUnixRunner = (config: AutoUpdateConfig): string => {
  const pathValue = [
    path.dirname(config.nodeExecutable),
    path.dirname(config.packageManager.executable),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].join(':');
  const commands = [
    '#!/bin/sh',
    'set -eu',
    `export PATH=${shellQuote(pathValue)}`,
    `cd ${shellQuote(config.repositoryRoot)}`,
    `${renderUnixPackageManager(config)} install --frozen-lockfile`,
  ];
  for (const agent of config.agents) {
    commands.push(
      `${renderUnixPackageManager(config)} skills:update -- --agent ${agent} --apply --scheduled`,
      `${renderUnixPackageManager(config)} install --frozen-lockfile`
    );
  }
  return `${commands.join('\n')}\n`;
};

const quoteCommand = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const renderWindowsPackageManager = (config: AutoUpdateConfig): string =>
  [config.packageManager.executable, ...config.packageManager.arguments]
    .map((argument) => quoteCommand(argument))
    .join(' ');

export const renderWindowsRunner = (config: AutoUpdateConfig): string => {
  const commands = [
    '@echo off',
    `call :run >> ${quoteCommand(config.logFile)} 2>&1`,
    'exit /b %ERRORLEVEL%',
    ':run',
    `set "PATH=${path.win32.dirname(config.nodeExecutable)};${path.win32.dirname(config.packageManager.executable)};%PATH%"`,
    `cd /d ${quoteCommand(config.repositoryRoot)} || exit /b 1`,
    `call ${renderWindowsPackageManager(config)} install --frozen-lockfile || exit /b 1`,
  ];
  for (const agent of config.agents) {
    commands.push(
      `call ${renderWindowsPackageManager(config)} skills:update -- --agent ${agent} --apply --scheduled || exit /b 1`,
      `call ${renderWindowsPackageManager(config)} install --frozen-lockfile || exit /b 1`
    );
  }
  commands.push('exit /b 0');
  return `${commands.join('\r\n')}\r\n`;
};

const replaceCronEntry = (
  runnerFile: string | undefined,
  logFile: string,
  runProcess: ProcessRunner
): void => {
  const current = runProcess('crontab', ['-l']);
  if (current.status !== 0 && current.status !== 1) {
    throw new Error('Unable to read the current user crontab.');
  }
  const retainedLines = current.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.includes(CRON_MARKER));
  if (runnerFile) {
    retainedLines.push(
      `0 9 * * * ${shellQuote(runnerFile)} >> ${shellQuote(logFile)} 2>&1 ${CRON_MARKER}`
    );
  }
  const nextCrontab = retainedLines.length > 0 ? `${retainedLines.join('\n')}\n` : '';
  const updated = runProcess('crontab', ['-'], { input: nextCrontab });
  if (updated.status !== 0) {
    throw new Error('Unable to update the current user crontab.');
  }
};

const replaceWindowsTask = (runnerFile: string | undefined, runProcess: ProcessRunner): void => {
  if (!runnerFile) {
    const removed = runProcess('schtasks', ['/Delete', '/TN', WINDOWS_TASK_NAME, '/F']);
    if (removed.status !== 0 && removed.status !== 1) {
      throw new Error('Unable to remove the automatic-update scheduled task.');
    }
    return;
  }
  const created = runProcess('schtasks', [
    '/Create',
    '/TN',
    WINDOWS_TASK_NAME,
    '/TR',
    `"${runnerFile}"`,
    '/SC',
    'DAILY',
    '/ST',
    '09:00',
    '/RL',
    'LIMITED',
    '/F',
  ]);
  if (created.status !== 0) {
    throw new Error('Unable to create the automatic-update scheduled task.');
  }
};

const installSchedule = (
  platform: NodeJS.Platform,
  runnerFile: string | undefined,
  logFile: string,
  runProcess: ProcessRunner
): void => {
  if (platform === 'win32') {
    replaceWindowsTask(runnerFile, runProcess);
  } else {
    replaceCronEntry(runnerFile, logFile, runProcess);
  }
};

const hasInstalledSchedule = (platform: NodeJS.Platform, runProcess: ProcessRunner): boolean => {
  if (platform === 'win32') {
    const result = runProcess('schtasks', ['/Query', '/TN', WINDOWS_TASK_NAME]);
    if (result.status !== 0 && result.status !== 1) {
      throw new Error('Unable to inspect the automatic-update scheduled task.');
    }
    return result.status === 0;
  }

  const result = runProcess('crontab', ['-l']);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error('Unable to inspect the current user crontab.');
  }
  return result.status === 0 && result.stdout.includes(CRON_MARKER);
};

const readFileIfPresent = (file: string): Buffer | undefined =>
  fs.existsSync(file) ? fs.readFileSync(file) : undefined;

const restoreFile = (file: string, contents: Buffer | undefined): void => {
  if (contents) {
    fs.writeFileSync(file, contents);
  } else {
    fs.rmSync(file, { force: true });
  }
};

const writeRunner = (
  platform: NodeJS.Platform,
  stateDirectory: string,
  config: AutoUpdateConfig
): string => {
  const windows = platform === 'win32';
  const runnerFile = path.join(stateDirectory, windows ? WINDOWS_RUNNER_FILE : UNIX_RUNNER_FILE);
  fs.writeFileSync(runnerFile, windows ? renderWindowsRunner(config) : renderUnixRunner(config), {
    mode: 0o700,
  });
  return runnerFile;
};

export const configureAutoUpdate = (
  repositoryRoot: string,
  options: AutoUpdateOptions,
  dependencies: AutoUpdateDependencies = {}
): AutoUpdateConfig | undefined => {
  const platform = dependencies.platform ?? process.platform;
  const runProcess = dependencies.runProcess ?? runProcessCommand;
  const stateDirectory =
    dependencies.stateDirectory ??
    defaultStateDirectory(platform, dependencies.homeDirectory, process.env);
  const configFile = path.join(stateDirectory, CONFIG_FILE);
  const existing = readConfig(configFile);
  if (options.action === 'status') {
    const scheduleInstalled = hasInstalledSchedule(platform, runProcess);
    if ((existing !== undefined) !== scheduleInstalled) {
      throw new Error(
        'Automatic-update configuration and the user schedule disagree. Disable and re-enable it.'
      );
    }
    return existing;
  }

  const agent = options.agent;
  if (!agent) {
    throw new Error('An agent host is required to change automatic updates.');
  }
  if (options.action === 'enable') {
    const validateCheckout = (): void => {
      const preview = runSkillsUpdate(repositoryRoot, {
        agent,
        apply: false,
        scheduled: false,
      });
      if (!preview.plan.managedInstallation) {
        throw new Error(
          `Install and approve the managed ${agent} skill set before enabling automatic updates.`
        );
      }
    };
    (dependencies.validateCheckout ?? validateCheckout)();
  }

  const configuredAgents = new Set(existing?.agents ?? []);
  if (options.action === 'enable') {
    configuredAgents.add(agent);
  } else {
    configuredAgents.delete(agent);
  }
  const agents = [...configuredAgents].sort();
  const logFile = path.join(stateDirectory, LOG_FILE);

  if (agents.length === 0) {
    installSchedule(platform, undefined, logFile, runProcess);
    fs.rmSync(stateDirectory, { recursive: true, force: true });
    return undefined;
  }

  fs.mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const requiredPnpmVersion =
    dependencies.requiredPnpmVersion ?? readRequiredPnpmVersion(repositoryRoot);
  const packageManager =
    dependencies.packageManager ?? findPackageManager(platform, requiredPnpmVersion, runProcess);
  validatePackageManager(packageManager, requiredPnpmVersion, runProcess);
  const config: AutoUpdateConfig = {
    schemaVersion: 2,
    repositoryRoot: path.resolve(repositoryRoot),
    nodeExecutable: dependencies.nodeExecutable ?? process.execPath,
    packageManager,
    logFile,
    agents,
  };
  const runnerFile = path.join(
    stateDirectory,
    platform === 'win32' ? WINDOWS_RUNNER_FILE : UNIX_RUNNER_FILE
  );
  const previousConfig = readFileIfPresent(configFile);
  const previousRunner = readFileIfPresent(runnerFile);
  try {
    writeConfig(configFile, config);
    writeRunner(platform, stateDirectory, config);
    installSchedule(platform, runnerFile, logFile, runProcess);
  } catch (error) {
    restoreFile(configFile, previousConfig);
    restoreFile(runnerFile, previousRunner);
    if (!existing && fs.readdirSync(stateDirectory).length === 0) {
      fs.rmSync(stateDirectory, { recursive: true, force: true });
    }
    throw error;
  }
  return config;
};

/* v8 ignore start -- exercised by command-level usage; reusable behavior is unit tested above */
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const options = parseAutoUpdateArgs(process.argv.slice(2));
    const config = configureAutoUpdate(repositoryRoot, options);
    if (!config) {
      console.log('Automatic Headstart skill updates are not configured.');
    } else {
      const stateDirectory = defaultStateDirectory();
      console.log(`Automatic updates enabled for: ${config.agents.join(', ')}`);
      console.log('Schedule: daily at 09:00 local time');
      console.log(`State: ${path.join(stateDirectory, CONFIG_FILE)}`);
      console.log(`Log: ${path.join(stateDirectory, LOG_FILE)}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
/* v8 ignore stop */
