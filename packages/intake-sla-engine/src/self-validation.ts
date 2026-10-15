import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkIntakeDistribution } from './distribution-safety.js';

export type SyntheticSuiteCommand = (
  entry: string,
  args: readonly string[],
  cwd: string
) => Promise<void>;
const executeSuite: SyntheticSuiteCommand = (entry, args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [entry, ...args],
      {
        cwd,
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
        // Vitest merges a development|production condition into its worker defaults.
        // Installed self-tests must exercise built exports, never checkout-only source.
        env: { ...process.env, NODE_ENV: 'production' },
      },
      (error) => {
        if (error === null) resolve();
        else reject(new Error('Complete Intake synthetic suite failed'));
      }
    );
  });
export function intakeRuntimePackageDirectory(moduleUrl: string = import.meta.url): string {
  const directory = path.dirname(fileURLToPath(moduleUrl));
  return path.resolve(directory, path.basename(directory) === 'self-tests' ? '../..' : '..');
}
/** Re-run distribution checks and the complete canonical compiled suite, never a prior receipt. */
export async function validateIntakeRuntime(
  packageDirectory = intakeRuntimePackageDirectory(),
  command: SyntheticSuiteCommand = executeSuite
): Promise<void> {
  const distribution = await checkIntakeDistribution(packageDirectory);
  if (!distribution.passed) throw new Error('Intake distribution safety check failed');
  const entry = fileURLToPath(new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')));
  await command(
    entry,
    [
      'run',
      '--config',
      path.join(packageDirectory, 'dist/self-tests/self-test-config.js'),
      '--silent',
    ],
    packageDirectory
  );
}
