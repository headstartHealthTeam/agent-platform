import { intakeStringArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { interpretSavedDelta } from './interpretation-delta.js';
import { preflightInterpretation } from './interpretation-preflight.js';
import { finalizeSavedCurrentRunPrecomputed } from './precomputed-storage.js';

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

export async function runFinalizePrecomputedCommand(
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  const runDirectory = intakeStringArgument(
    parseIntakeArguments(argv),
    'run-dir',
    'review:finalize-precomputed --run-dir <private-run-directory>'
  );
  const artifact = await finalizeSavedCurrentRunPrecomputed(runDirectory);
  let interpretations = 0;
  for (const row of artifact.rows) interpretations += row.interpretations.length;
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(
      {
        rows: artifact.rows.length,
        interpretations,
        allCurrentPacketsBound: true,
        executionProvenance: artifact.executionProvenance,
      },
      null,
      2
    )}\n`,
    stderr: '',
  };
}

export async function runInterpretationDeltaCommand(
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  try {
    const args = parseIntakeArguments(argv);
    const usage =
      'review:interpret-delta --run-dir <private-current> --prior-run-dir <private-prior>';
    const artifact = await interpretSavedDelta({
      runDirectory: intakeStringArgument(args, 'run-dir', usage),
      priorRunDirectory: intakeStringArgument(args, 'prior-run-dir', usage),
      onProgress: (counts) => {
        process.stdout.write(`${JSON.stringify({ phase: 'fresh-progress', ...counts })}\n`);
      },
    });
    return {
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify({
        phase: 'complete',
        counts: artifact.counts,
        resolvedCounts: artifact.resolvedCounts,
        rows: artifact.rows.length,
      })}\n`,
    };
  } catch {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify({ code: 'INTERPRETATION_DELTA_FAILED', checkpointsRetained: true })}\n`,
    };
  }
}
