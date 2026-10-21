import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { withAwsOpenAICredential, type AwsOpenAICredentialInput } from './aws-openai-credential.js';
import { privateDirectory, requireMutableRun } from './private-run-storage.js';

export interface InterpretationChild {
  kill(signal: NodeJS.Signals): boolean;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'close', listener: (code: number | null) => void): this;
}
export interface InterpretationSpawnOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: 'inherit';
}
export interface AwsInterpretationRunInput {
  readonly action: 'preflight' | 'interpret';
  readonly runDirectory: string;
  readonly priorRunDirectory?: string;
  readonly cliEntrypoint: string;
  readonly profile: unknown;
  readonly region: unknown;
  readonly secretId: unknown;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly executeAws?: AwsOpenAICredentialInput<number>['execFile'];
  readonly spawnChild?: (
    command: string,
    args: readonly string[],
    options: InterpretationSpawnOptions
  ) => InterpretationChild;
}
const nativeExecuteAws = promisify(execFile);
function spawnInterpretation(
  input: AwsInterpretationRunInput,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<number> {
  return new Promise((resolve, reject) => {
    const launch = input.spawnChild ?? spawn;
    const child = launch(process.execPath, args, {
      cwd: path.dirname(input.cliEntrypoint),
      env,
      stdio: 'inherit',
    });
    const interrupt = (): void => {
      child.kill('SIGINT');
    };
    const terminate = (): void => {
      child.kill('SIGTERM');
    };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    child.once('error', reject);
    child.once('close', (code) => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
      resolve(code ?? 1);
    });
  });
}
/** Approved credential is passed only to the selected interpretation child, never argv or receipts. */
export async function runAwsInterpretation(input: AwsInterpretationRunInput): Promise<number> {
  if (input.action === 'interpret' && !input.priorRunDirectory)
    throw new Error('Invalid interpretation action or run directory');
  const directory = await privateDirectory(input.runDirectory);
  await requireMutableRun(directory);
  const args = [
    input.cliEntrypoint,
    input.action === 'preflight' ? 'review:ai-preflight' : 'review:interpret-delta',
    '--run-dir',
    directory,
  ];
  if (input.action === 'interpret' && input.priorRunDirectory !== undefined)
    args.push('--prior-run-dir', path.resolve(input.priorRunDirectory));
  return withAwsOpenAICredential({
    profile: input.profile,
    region: input.region,
    secretId: input.secretId,
    ...(input.env === undefined ? {} : { env: input.env }),
    execFile: input.executeAws ?? nativeExecuteAws,
    run: async (env) => spawnInterpretation(input, args, env),
  });
}
