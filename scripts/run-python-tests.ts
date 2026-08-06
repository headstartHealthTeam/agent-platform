import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PythonCommand {
  command: string;
  prefixArgs: string[];
}

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
