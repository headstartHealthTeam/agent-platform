export const launcherTemplate = (): string => `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'agent-platform', 'main');
try {
  const requireSource = createRequire(path.join(source, 'package.json'));
  const loader = pathToFileURL(requireSource.resolve('tsx')).href;
  const result = spawnSync(process.execPath, ['--import', loader, path.join(source, 'scripts', 'workspace-cli.ts'), ...process.argv.slice(2), '--root', root], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch {
  console.error('Headstart runtime unavailable. In agent-platform/main, run pnpm install --frozen-lockfile, then retry.');
  process.exitCode = 1;
}
`;
