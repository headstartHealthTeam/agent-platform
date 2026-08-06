import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PythonCommand {
  command: string;
  prefixArgs: string[];
}

const REPOSITORY_LOCAL_GIT_ENVIRONMENT_VARIABLES = new Set([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_DIR',
  'GIT_GRAFT_FILE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PREFIX',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_WORK_TREE',
]);

export const withoutRepositoryLocalGitEnvironment = (
  environment: NodeJS.ProcessEnv
): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !REPOSITORY_LOCAL_GIT_ENVIRONMENT_VARIABLES.has(name.toUpperCase())
    )
  );

export const pythonCandidates = (platform: NodeJS.Platform): PythonCommand[] =>
  platform === 'win32'
    ? [
        { command: 'py', prefixArgs: ['-3'] },
        { command: 'python', prefixArgs: [] },
        { command: 'python3', prefixArgs: [] },
      ]
    : [
        { command: 'python3', prefixArgs: [] },
        { command: 'python', prefixArgs: [] },
      ];

export const findPython = (platform: NodeJS.Platform = process.platform): PythonCommand => {
  for (const candidate of pythonCandidates(platform)) {
    const probe = spawnSync(candidate.command, [...candidate.prefixArgs, '--version'], {
      encoding: 'utf8',
    });

    if (probe.status === 0) {
      return candidate;
    }
  }

  throw new Error('Python 3.10 or newer is required to test the release-note collector.');
};

export const runCollectorTests = (
  repositoryRoot: string,
  platform: NodeJS.Platform = process.platform
): number => {
  const python = findPython(platform);
  const testScript = path.join(
    repositoryRoot,
    'skills',
    'headstart-dev-to-main-pr',
    'scripts',
    'test_collect_release_notes.py'
  );
  const result = spawnSync(python.command, [...python.prefixArgs, testScript], {
    cwd: repositoryRoot,
    env: withoutRepositoryLocalGitEnvironment(process.env),
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
};

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.exitCode = runCollectorTests(repositoryRoot);
}
