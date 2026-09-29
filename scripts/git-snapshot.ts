import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { withoutRepositoryLocalGitEnvironment } from './run-python-tests.js';

export const exportGitSnapshot = (
  repository: string,
  commit: string,
  destination: string,
  runGit: (cwd: string, args: string[]) => string
): void => {
  const snapshotRoot = path.resolve(destination);
  const entries = runGit(repository, ['ls-tree', '-r', '-z', commit, '--', 'README.md', 'skills'])
    .split('\0')
    .filter(Boolean);
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/.exec(entry);
    if (!match?.[2] || !match[3])
      throw new Error('Candidate skills contain an unsupported Git entry.');
    const target = path.resolve(snapshotRoot, match[3]);
    if (!target.startsWith(`${snapshotRoot}${path.sep}`))
      throw new Error('Candidate path escapes its snapshot.');
    const result = spawnSync('git', ['cat-file', 'blob', match[2]], {
      cwd: repository,
      env: withoutRepositoryLocalGitEnvironment(process.env),
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.status !== 0)
      throw new Error('Could not read a candidate skill blob.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result.stdout, {
      flag: 'wx',
      mode: match[1] === '100755' ? 0o755 : 0o644,
    });
  }
};
