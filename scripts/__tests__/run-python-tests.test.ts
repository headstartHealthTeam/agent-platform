import { describe, expect, it } from 'vitest';

import { pythonCandidates, withoutRepositoryLocalGitEnvironment } from '../run-python-tests.js';

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
