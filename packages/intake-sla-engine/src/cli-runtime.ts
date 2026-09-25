import { createArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';

import { resolveArtifactRuntime, recordArtifactRuntimePreflight } from './artifact-runtime.js';
import {
  intakeStringArgument,
  optionalIntakeArgument,
  parseIntakeArguments,
} from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { smokeIntakeWorkbookRuntime } from './workbook-smoke.js';

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

export async function runWorkbookRuntimeSmokeCommand(
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  const output = intakeStringArgument(
    parseIntakeArguments(argv),
    'output-dir',
    'review:workbook-runtime-smoke --output-dir <new-directory>'
  );
  const { module, identity } = await resolveArtifactRuntime();
  const result = await smokeIntakeWorkbookRuntime(createArtifactWorkbookProvider(module), output);
  return {
    exitCode: result.passed ? 0 : 2,
    stdout: `${JSON.stringify({ passed: result.passed, runtime: identity, sheetsRendered: result.sheetsRendered.length, formulaErrorCount: result.formulaErrorCount }, null, 2)}\n`,
    stderr: '',
  };
}
