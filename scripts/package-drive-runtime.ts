import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { packageWorkspaceRuntime, type RuntimeCommand } from './runtime-packaging.js';

export async function packageDriveRuntime(input: {
  readonly sourceRoot: string;
  readonly target: string;
  readonly command?: RuntimeCommand;
}): Promise<Readonly<Record<string, unknown>>> {
  return packageWorkspaceRuntime({
    ...input,
    packageName: '@headstart-health/google-drive-data',
    packageDirectory: 'packages/google-drive-data',
    schemaVersion: 'headstart-drive-runtime/v1',
    buildEntries: ['cli.js', 'index.js'],
    entrypoints: { 'headstart-drive-read': 'dist/cli.js' },
  });
}
async function main(): Promise<void> {
  const parsed = parseArgs({ options: { target: { type: 'string' } }, strict: true });
  if (!parsed.values.target) throw new Error('--target is required');
  const receipt = await packageDriveRuntime({
    sourceRoot: fileURLToPath(new URL('..', import.meta.url)),
    target: parsed.values.target,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Runtime packaging failed'}\n`
    );
    process.exitCode = 1;
  });
}
