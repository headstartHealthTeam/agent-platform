import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { packageWorkspaceRuntime, type RuntimeCommand } from './runtime-packaging.js';
export {
  runRuntimeCommand,
  runRuntimeExecutable,
  runtimeFingerprint,
  verifyPortableRuntime,
  type RuntimeCommand,
} from './runtime-packaging.js';

export async function packageOrganicRuntime(input: {
  readonly sourceRoot: string;
  readonly target: string;
  readonly command?: RuntimeCommand;
}): Promise<Readonly<Record<string, unknown>>> {
  return packageWorkspaceRuntime({
    ...input,
    packageName: '@headstart-health/organic-performance-engine',
    packageDirectory: 'packages/organic-performance-engine',
    schemaVersion: 'headstart-organic-runtime/v1',
    buildEntries: ['cli.js', 'collect-cli.js', 'workbook-cli.js'],
    extraFileHashes: { templateSha256: 'templates/headstart-report.v1.json' },
    entrypoints: {
      'headstart-organic-analyze': 'dist/cli.js',
      'headstart-organic-collect': 'dist/collect-cli.js',
      'headstart-organic-workbook-plan': 'dist/workbook-cli.js',
      'headstart-gsc-report': 'node_modules/@headstart-health/google-search-console/dist/cli.js',
    },
  });
}

async function main(): Promise<void> {
  const parsed = parseArgs({ options: { target: { type: 'string' } }, strict: true });
  if (!parsed.values.target) throw new Error('--target is required');
  const sourceRoot = fileURLToPath(new URL('..', import.meta.url));
  const receipt = await packageOrganicRuntime({ sourceRoot, target: parsed.values.target });
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
