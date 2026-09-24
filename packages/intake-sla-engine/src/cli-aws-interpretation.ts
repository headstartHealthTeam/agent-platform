import { fileURLToPath } from 'node:url';

import {
  runAwsInterpretation,
  type AwsInterpretationRunInput,
} from './aws-interpretation-runner.js';
import { intakeStringArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';

export async function runAwsInterpretationCommand(
  argv: readonly string[],
  run: (input: AwsInterpretationRunInput) => Promise<number> = runAwsInterpretation
): Promise<IntakeCommandResult> {
  try {
    const args = parseIntakeArguments(argv);
    const action = args['action'];
    const usage = 'Invalid interpretation action or run directory';
    if (action !== 'preflight' && action !== 'interpret') throw new Error(usage);
    const runDirectory = intakeStringArgument(args, 'run-dir', usage);
    const priorRunDirectory =
      action === 'interpret' ? intakeStringArgument(args, 'prior-run-dir', usage) : undefined;
    const exitCode = await run({
      action,
      runDirectory,
      ...(priorRunDirectory === undefined ? {} : { priorRunDirectory }),
      cliEntrypoint: fileURLToPath(new URL('./cli.js', import.meta.url)),
      profile: args['profile'],
      region: args['region'],
      secretId: args['secret-id'],
    });
    return { exitCode, stdout: '', stderr: '' };
  } catch (error) {
    const code =
      error instanceof Error && error.message === 'AWS_OPENAI_CREDENTIAL_UNAVAILABLE'
        ? error.message
        : 'AWS_OPENAI_RUN_FAILED';
    return { exitCode: 1, stdout: '', stderr: `${JSON.stringify({ code })}\n` };
  }
}
