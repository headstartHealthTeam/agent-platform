import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  findPython,
  pythonCandidates,
  runCollectorTests,
  withoutRepositoryLocalGitEnvironment,
  type CommandResult,
} from '../run-python-tests.js';

describe('pythonCandidates', () => {
  it('prefers the Python launcher on Windows', () => {
    expect(pythonCandidates('win32')).toEqual([
      { command: 'py', prefixArgs: ['-3'] },
      { command: 'python', prefixArgs: [] },
      { command: 'python3', prefixArgs: [] },
    ]);
  });

  it('prefers python3 on Unix-like platforms', () => {
    expect(pythonCandidates('darwin')).toEqual([
      { command: 'python3', prefixArgs: [] },
      { command: 'python', prefixArgs: [] },
    ]);
  });
});

describe('withoutRepositoryLocalGitEnvironment', () => {
  it('removes repository-local Git state inherited from hooks', () => {
    const environment = {
      GIT_DIR: '/repo/.git',
      git_work_tree: '/repo',
      GIT_INDEX_FILE: '/repo/.git/index',
      GIT_PAGER: 'cat',
      PATH: '/usr/bin',
    };

    expect(withoutRepositoryLocalGitEnvironment(environment)).toEqual({
      GIT_PAGER: 'cat',
      PATH: '/usr/bin',
    });
    expect(environment.GIT_DIR).toBe('/repo/.git');
  });
});

describe('Python process execution', () => {
  it('falls back through candidates and selects the first successful interpreter', () => {
    const runner = vi
      .fn<(command: string, arguments_: string[]) => CommandResult>()
      .mockReturnValueOnce({ status: 1 })
      .mockReturnValueOnce({ status: 0 });

    expect(findPython('win32', runner)).toEqual({ command: 'python', prefixArgs: [] });
    expect(runner).toHaveBeenNthCalledWith(1, 'py', ['-3', '--version']);
    expect(runner).toHaveBeenNthCalledWith(2, 'python', ['--version']);
  });

  it('fails clearly when no supported Python interpreter is available', () => {
    expect(() => findPython('linux', () => ({ status: 1 }))).toThrow('Python 3.10 or newer');
  });

  it('runs the collector with isolated Git state and returns its status', () => {
    const previousGitDirectory = process.env['GIT_DIR'];
    process.env['GIT_DIR'] = '/synthetic/repository/.git';
    const runner = vi
      .fn<
        (
          command: string,
          arguments_: string[],
          options?: {
            cwd?: string;
            environment?: NodeJS.ProcessEnv;
            inheritStdio?: boolean;
          }
        ) => CommandResult
      >()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 7 });

    try {
      expect(runCollectorTests('/repository', 'linux', runner)).toBe(7);
    } finally {
      if (previousGitDirectory === undefined) {
        delete process.env['GIT_DIR'];
      } else {
        process.env['GIT_DIR'] = previousGitDirectory;
      }
    }
    const execution = runner.mock.calls[1];
    expect(execution?.[0]).toBe('python3');
    expect(execution?.[1]).toEqual([
      path.join(
        '/repository',
        'skills',
        'headstart-dev-to-main-pr',
        'scripts',
        'test_collect_release_notes.py'
      ),
    ]);
    expect(execution?.[2]?.environment?.['GIT_DIR']).toBeUndefined();
    expect(execution?.[2]?.inheritStdio).toBe(true);
  });

  it('propagates collector process errors and maps a missing status to failure', () => {
    const processError = new Error('synthetic spawn failure');
    const errorRunner = vi
      .fn<(command: string, arguments_: string[]) => CommandResult>()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: null, error: processError });
    expect(() => runCollectorTests('/repository', 'linux', errorRunner)).toThrow(processError);

    const nullStatusRunner = vi
      .fn<(command: string, arguments_: string[]) => CommandResult>()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: null });
    expect(runCollectorTests('/repository', 'linux', nullStatusRunner)).toBe(1);
  });
});
