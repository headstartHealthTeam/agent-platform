import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureAutoUpdate,
  defaultStateDirectory,
  parseAutoUpdateArgs,
  readRequiredPnpmVersion,
  renderUnixRunner,
  renderWindowsRunner,
  type AutoUpdateConfig,
  type ProcessResult,
} from '../configure-auto-update.js';

const temporaryDirectories: string[] = [];

const config = (overrides: Partial<AutoUpdateConfig> = {}): AutoUpdateConfig => ({
  schemaVersion: 2,
  repositoryRoot: '/workspace/agent-skills',
  nodeExecutable: '/tools/node',
  packageManager: { executable: '/tools/corepack', arguments: ['pnpm'] },
  logFile: '/state/auto-update.log',
  agents: ['codex'],
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('parseAutoUpdateArgs', () => {
  it('parses enable, disable, and status actions', () => {
    expect(parseAutoUpdateArgs(['--enable', '--agent', 'codex'])).toEqual({
      action: 'enable',
      agent: 'codex',
    });
    expect(parseAutoUpdateArgs(['--disable', '--agent', 'cursor'])).toEqual({
      action: 'disable',
      agent: 'cursor',
    });
    expect(parseAutoUpdateArgs(['--status'])).toEqual({ action: 'status' });
  });

  it('rejects ambiguous or incomplete configuration changes', () => {
    expect(() => parseAutoUpdateArgs(['--enable', '--disable', '--agent', 'codex'])).toThrow(
      'exactly one'
    );
    expect(() => parseAutoUpdateArgs(['--enable'])).toThrow('--agent is required');
    expect(() => parseAutoUpdateArgs(['--status', '--agent', 'codex'])).toThrow('does not accept');
    expect(() => parseAutoUpdateArgs([])).toThrow('Choose an auto-update action');
    expect(() => parseAutoUpdateArgs(['--enable', '--agent', 'other'])).toThrow(
      'Unsupported agent host'
    );
    expect(() => parseAutoUpdateArgs(['--enable', '--agent'])).toThrow('requires a value');
    expect(() => parseAutoUpdateArgs(['--unknown'])).toThrow('Unknown argument');
  });
});

describe('scheduled runner rendering', () => {
  it('updates every configured Unix host sequentially', () => {
    const runner = renderUnixRunner(
      config({ agents: ['claude-code', 'codex'], repositoryRoot: "/workspace/team's skills" })
    );

    expect(runner).toContain("cd '/workspace/team'\"'\"'s skills'");
    expect(runner).toContain("'/tools/corepack' 'pnpm' install --frozen-lockfile");
    expect(runner).toContain('skills:update -- --agent claude-code --apply');
    expect(runner).toContain('skills:update -- --agent codex --apply');
    expect(runner).toContain('--agent claude-code --apply --scheduled');
    expect(runner).toContain('--agent codex --apply --scheduled');
    expect(runner.match(/install --frozen-lockfile/g)).toHaveLength(3);
  });

  it('renders a fail-fast Windows command runner', () => {
    const runner = renderWindowsRunner(
      config({
        repositoryRoot: 'C:\\Work\\Agent Skills',
        nodeExecutable: 'C:\\Tools\\node.exe',
        packageManager: {
          executable: 'C:\\Tools\\corepack.cmd',
          arguments: ['pnpm'],
        },
        agents: ['cursor'],
      })
    );

    expect(runner).toContain('cd /d "C:\\Work\\Agent Skills" || exit /b 1');
    expect(runner).toContain('call "C:\\Tools\\corepack.cmd" "pnpm" install');
    expect(runner).toContain('skills:update -- --agent cursor --apply --scheduled || exit /b 1');
    expect(runner).toContain('call :run >> "/state/auto-update.log" 2>&1');
  });
});

describe('package-manager contract', () => {
  it('reads one exact pnpm version from packageManager and engines', () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-pnpm-contract-'));
    temporaryDirectories.push(repositoryRoot);
    fs.writeFileSync(
      path.join(repositoryRoot, 'package.json'),
      `${JSON.stringify({ packageManager: 'pnpm@9.15.0', engines: { pnpm: '9.15.0' } })}\n`
    );

    expect(readRequiredPnpmVersion(repositoryRoot)).toBe('9.15.0');
  });

  it('rejects divergent packageManager and engines versions', () => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-pnpm-mismatch-'));
    temporaryDirectories.push(repositoryRoot);
    fs.writeFileSync(
      path.join(repositoryRoot, 'package.json'),
      `${JSON.stringify({ packageManager: 'pnpm@9.15.0', engines: { pnpm: '9.12.3' } })}\n`
    );

    expect(() => readRequiredPnpmVersion(repositoryRoot)).toThrow(
      'packageManager and engines.pnpm'
    );
  });
});

describe('platform state locations', () => {
  it('uses user-level native state roots on macOS, Linux, and Windows', () => {
    expect(defaultStateDirectory('darwin', '/home/user', {})).toBe(
      path.join('/home/user', 'Library', 'Application Support', 'Headstart Agent Skills')
    );
    expect(defaultStateDirectory('linux', '/home/user', {})).toBe(
      path.join('/home/user', '.local', 'state', 'headstart-agent-skills')
    );
    expect(
      defaultStateDirectory('win32', 'C:\\Users\\User', {
        LOCALAPPDATA: 'C:\\Users\\User\\AppData\\Local',
      })
    ).toBe(path.join('C:\\Users\\User\\AppData\\Local', 'Headstart', 'AgentSkills'));
    expect(defaultStateDirectory('win32', 'C:\\Users\\User', {})).toBe(
      path.join('C:\\Users\\User', 'AppData', 'Local', 'Headstart', 'AgentSkills')
    );
    expect(defaultStateDirectory('linux', '/home/user', { XDG_STATE_HOME: '/state' })).toBe(
      path.join('/state', 'headstart-agent-skills')
    );
  });
});

describe('automatic update configuration', () => {
  it('adds hosts to one user-level daily schedule and removes it when empty', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-auto-update-'));
    temporaryDirectories.push(stateDirectory);
    const processCalls: { command: string; arguments_: string[]; input?: string }[] = [];
    let crontab = '';
    const runProcess = (
      command: string,
      arguments_: string[],
      options: { input?: string } = {}
    ): ProcessResult => {
      processCalls.push(
        options.input === undefined
          ? { command, arguments_ }
          : { command, arguments_, input: options.input }
      );
      if (command === 'crontab' && arguments_[0] === '-l') {
        return { status: crontab.length > 0 ? 0 : 1, stdout: crontab };
      }
      if (command === 'crontab' && arguments_[0] === '-') {
        crontab = options.input ?? '';
      }
      if (command === '/tools/corepack' && arguments_.at(-1) === '--version') {
        return { status: 0, stdout: '9.15.0' };
      }
      return { status: 0, stdout: '' };
    };
    const validateCheckout = vi.fn();
    const dependencies = {
      platform: 'linux' as const,
      stateDirectory,
      nodeExecutable: '/tools/node',
      packageManager: { executable: '/tools/corepack', arguments: ['pnpm'] },
      requiredPnpmVersion: '9.15.0',
      runProcess,
      validateCheckout,
    };

    const first = configureAutoUpdate(
      '/workspace/agent-skills',
      { action: 'enable', agent: 'codex' },
      dependencies
    );
    const second = configureAutoUpdate(
      '/workspace/agent-skills',
      { action: 'enable', agent: 'cursor' },
      dependencies
    );

    expect(first?.agents).toEqual(['codex']);
    expect(second?.agents).toEqual(['codex', 'cursor']);
    expect(crontab).toContain('# headstart-agent-skills-auto-update');
    expect(crontab.match(/headstart-agent-skills-auto-update/g)).toHaveLength(1);
    expect(validateCheckout).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(path.join(stateDirectory, 'run-auto-update.sh'), 'utf8')).toContain(
      'skills:update -- --agent cursor --apply'
    );
    expect(
      configureAutoUpdate('/workspace/agent-skills', { action: 'status' }, dependencies)?.agents
    ).toEqual(['codex', 'cursor']);

    configureAutoUpdate(
      '/workspace/agent-skills',
      { action: 'disable', agent: 'codex' },
      dependencies
    );
    const removed = configureAutoUpdate(
      '/workspace/agent-skills',
      { action: 'disable', agent: 'cursor' },
      dependencies
    );

    expect(removed).toBeUndefined();
    expect(crontab).toBe('');
    expect(fs.existsSync(stateDirectory)).toBe(false);
    expect(processCalls.some((call) => call.command === 'crontab')).toBe(true);
  });

  it('creates a least-privilege Windows task for the generated batch runner', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-windows-update-'));
    temporaryDirectories.push(stateDirectory);
    const calls: { command: string; arguments_: string[] }[] = [];
    const runProcess = (command: string, arguments_: string[]): ProcessResult => {
      calls.push({ command, arguments_ });
      if (command === 'C:\\Tools\\corepack.cmd' && arguments_.at(-1) === '--version') {
        return { status: 0, stdout: '9.15.0' };
      }
      return { status: 0, stdout: '' };
    };

    const result = configureAutoUpdate(
      'C:\\Work\\Agent Skills',
      { action: 'enable', agent: 'claude-code' },
      {
        platform: 'win32',
        stateDirectory,
        nodeExecutable: 'C:\\Tools\\node.exe',
        packageManager: {
          executable: 'C:\\Tools\\corepack.cmd',
          arguments: ['pnpm'],
        },
        requiredPnpmVersion: '9.15.0',
        runProcess,
        validateCheckout: vi.fn(),
      }
    );

    expect(result?.agents).toEqual(['claude-code']);
    const task = calls.find((call) => call.command === 'schtasks');
    expect(task?.arguments_).toContain('/Create');
    expect(task?.arguments_).toContain('/SC');
    expect(task?.arguments_).toContain('DAILY');
    expect(fs.readFileSync(path.join(stateDirectory, 'run-auto-update.cmd'), 'utf8')).toContain(
      'skills:update -- --agent claude-code --apply'
    );
    expect(
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'status' },
        {
          platform: 'win32',
          stateDirectory,
          runProcess,
        }
      )?.agents
    ).toEqual(['claude-code']);
  });

  it('rolls back local state when scheduler registration fails', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-failed-update-'));
    temporaryDirectories.push(stateDirectory);
    const runProcess = (command: string, arguments_: string[]): ProcessResult => {
      if (command === '/tools/corepack' && arguments_.at(-1) === '--version') {
        return { status: 0, stdout: '9.15.0' };
      }
      if (command === 'crontab' && arguments_[0] === '-l') {
        return { status: 1, stdout: '' };
      }
      return { status: 2, stdout: '' };
    };

    expect(() =>
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'enable', agent: 'codex' },
        {
          platform: 'linux',
          stateDirectory,
          nodeExecutable: '/tools/node',
          packageManager: { executable: '/tools/corepack', arguments: ['pnpm'] },
          requiredPnpmVersion: '9.15.0',
          runProcess,
          validateCheckout: vi.fn(),
        }
      )
    ).toThrow('Unable to update the current user crontab');
    expect(fs.existsSync(stateDirectory)).toBe(false);
  });

  it('rejects status when local configuration and the scheduler disagree', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-stale-update-'));
    temporaryDirectories.push(stateDirectory);
    fs.writeFileSync(
      path.join(stateDirectory, 'auto-update.json'),
      `${JSON.stringify(config({ logFile: path.join(stateDirectory, 'auto-update.log') }))}\n`
    );

    expect(() =>
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'status' },
        {
          platform: 'linux',
          stateDirectory,
          runProcess: () => ({ status: 1, stdout: '' }),
        }
      )
    ).toThrow('configuration and the user schedule disagree');
  });

  it('rejects malformed automatic-update configuration', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-invalid-update-'));
    temporaryDirectories.push(stateDirectory);
    fs.writeFileSync(path.join(stateDirectory, 'auto-update.json'), '{"schemaVersion":1}\n');

    expect(() =>
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'status' },
        {
          platform: 'linux',
          stateDirectory,
          runProcess: () => ({ status: 1, stdout: '' }),
        }
      )
    ).toThrow('Invalid automatic-update configuration');
  });

  it('discovers pnpm when an explicit executable is not supplied', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-pnpm-update-'));
    temporaryDirectories.push(stateDirectory);
    let crontab = '';
    const runProcess = (
      command: string,
      arguments_: string[],
      options: { input?: string } = {}
    ): ProcessResult => {
      if (command === 'which') {
        return arguments_[0] === 'corepack'
          ? { status: 0, stdout: '/tools/corepack\n' }
          : { status: 1, stdout: '' };
      }
      if (command === '/tools/corepack' && arguments_.at(-1) === '--version') {
        return { status: 0, stdout: '9.15.0' };
      }
      if (arguments_[0] === '-l') {
        return { status: crontab ? 0 : 1, stdout: crontab };
      }
      crontab = options.input ?? '';
      return { status: 0, stdout: '' };
    };

    expect(
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'enable', agent: 'codex' },
        {
          platform: 'linux',
          stateDirectory,
          nodeExecutable: '/tools/node',
          requiredPnpmVersion: '9.15.0',
          runProcess,
          validateCheckout: vi.fn(),
        }
      )?.packageManager
    ).toEqual({ executable: path.resolve('/tools/corepack'), arguments: ['pnpm'] });
  });

  it('uses an exact direct pnpm installation when Corepack is unavailable', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-direct-pnpm-'));
    temporaryDirectories.push(stateDirectory);
    let crontab = '';
    const runProcess = (
      command: string,
      arguments_: string[],
      options: { input?: string } = {}
    ): ProcessResult => {
      if (command === 'which') {
        return arguments_[0] === 'pnpm'
          ? { status: 0, stdout: '/tools/pnpm\n' }
          : { status: 1, stdout: '' };
      }
      if (command === '/tools/pnpm' && arguments_[0] === '--version') {
        return { status: 0, stdout: '9.15.0' };
      }
      if (arguments_[0] === '-l') {
        return { status: crontab ? 0 : 1, stdout: crontab };
      }
      crontab = options.input ?? '';
      return { status: 0, stdout: '' };
    };

    expect(
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'enable', agent: 'codex' },
        {
          platform: 'linux',
          stateDirectory,
          nodeExecutable: '/tools/node',
          requiredPnpmVersion: '9.15.0',
          runProcess,
          validateCheckout: vi.fn(),
        }
      )?.packageManager
    ).toEqual({ executable: path.resolve('/tools/pnpm'), arguments: [] });
  });

  it('fails clearly when pnpm cannot be found', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-no-pnpm-update-'));
    temporaryDirectories.push(stateDirectory);

    expect(() =>
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'enable', agent: 'codex' },
        {
          platform: 'linux',
          stateDirectory,
          nodeExecutable: '/tools/node',
          requiredPnpmVersion: '9.15.0',
          runProcess: () => ({ status: 1, stdout: '' }),
          validateCheckout: vi.fn(),
        }
      )
    ).toThrow('Unable to locate Corepack or pnpm 9.15.0');
  });

  it('rejects a package-manager command that resolves the wrong pnpm version', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-wrong-pnpm-'));
    temporaryDirectories.push(stateDirectory);

    expect(() =>
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'enable', agent: 'codex' },
        {
          platform: 'linux',
          stateDirectory,
          nodeExecutable: '/tools/node',
          packageManager: { executable: '/tools/pnpm', arguments: [] },
          requiredPnpmVersion: '9.15.0',
          runProcess: () => ({ status: 0, stdout: '9.12.3' }),
          validateCheckout: vi.fn(),
        }
      )
    ).toThrow('require pnpm 9.15.0');
  });

  it('normalizes legacy pnpm-only configuration for status reporting', () => {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-legacy-update-'));
    temporaryDirectories.push(stateDirectory);
    fs.writeFileSync(
      path.join(stateDirectory, 'auto-update.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        repositoryRoot: '/workspace/agent-skills',
        nodeExecutable: '/tools/node',
        pnpmExecutable: '/tools/pnpm',
        logFile: '/state/auto-update.log',
        agents: ['codex'],
      })}\n`
    );

    expect(
      configureAutoUpdate(
        '/workspace/agent-skills',
        { action: 'status' },
        {
          platform: 'linux',
          stateDirectory,
          runProcess: () => ({ status: 0, stdout: '# headstart-agent-skills-auto-update' }),
        }
      )?.packageManager
    ).toEqual({ executable: '/tools/pnpm', arguments: [] });
  });
});
