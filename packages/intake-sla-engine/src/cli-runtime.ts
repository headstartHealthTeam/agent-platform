import { resolveArtifactRuntime, recordArtifactRuntimePreflight } from './artifact-runtime.js';
import { optionalIntakeArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';

export async function runArtifactPreflightCommand(
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  try {
    const { identity } = await resolveArtifactRuntime();
    const runDirectory = optionalIntakeArgument(parseIntakeArguments(argv), 'run-dir');
    const result = await recordArtifactRuntimePreflight(identity, runDirectory);
    return { exitCode: 0, stdout: `${JSON.stringify(result)}\n`, stderr: '' };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : 'unknown error'}\n`,
    };
  }
}
