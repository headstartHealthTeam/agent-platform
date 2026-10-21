import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { withoutRepositoryLocalGitEnvironment } from './run-python-tests.js';
import { workspacePath } from './workspace-files.js';

export const workspaceSource = (root: string): string => workspacePath(root, 'agent-platform/main');

type RuntimeCommand = (
  command: string,
  args: string[],
  options: SpawnSyncOptions
) => { status: number | null; error?: Error };

export const installWorkspaceRuntime = (root: string, run: RuntimeCommand = spawnSync): void => {
  const source = workspaceSource(root);
  if (!fs.existsSync(path.join(source, 'scripts/workspace-cli.ts')))
    throw new Error('The pinned Agent Platform source does not include workspace commands.');
  // Node launches Corepack's JavaScript entrypoint directly on Windows as well as POSIX.
  const requireCorepack = path.join(
    path.dirname(createRequire(import.meta.url).resolve('corepack/package.json')),
    'dist/pnpm.js'
  );
  const result = run(process.execPath, [requireCorepack, 'install', '--frozen-lockfile'], {
    cwd: source,
    env: withoutRepositoryLocalGitEnvironment(process.env),
    stdio: 'inherit',
    timeout: 300_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      'Agent Platform runtime dependency installation failed. Retry pnpm install --frozen-lockfile in its main checkout.'
    );
};
