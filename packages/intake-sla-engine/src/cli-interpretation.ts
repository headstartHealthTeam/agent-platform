import { intakeStringArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { preflightInterpretation } from './interpretation-preflight.js';

export async function runInterpretationPreflightCommand(
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  const runDirectory = intakeStringArgument(
    parseIntakeArguments(argv),
    'run-dir',
    'review:ai-preflight --run-dir <private-run-directory>'
  );
  const result = await preflightInterpretation({ runDirectory });
  return result.passed
    ? { exitCode: 0, stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: '' }
    : { exitCode: 1, stdout: '', stderr: `${JSON.stringify(result)}\n` };
}
