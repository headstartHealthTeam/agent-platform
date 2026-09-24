#!/usr/bin/env node
import { runAwsInterpretationCommand } from './cli-aws-interpretation.js';
import {
  runFinalizePrecomputedCommand,
  runInterpretationPreflightCommand,
  runInterpretationDeltaCommand,
} from './cli-interpretation.js';
import { runSavedPublicationCommand } from './cli-publication.js';
import { runArtifactPreflightCommand, runWorkbookRuntimeSmokeCommand } from './cli-runtime.js';

const [command = '', ...args] = process.argv.slice(2);
try {
  const result =
    command === 'review:runtime-preflight'
      ? await runArtifactPreflightCommand(args)
      : command === 'review:workbook-runtime-smoke'
        ? await runWorkbookRuntimeSmokeCommand(args)
        : command === 'review:ai-preflight'
          ? await runInterpretationPreflightCommand(args)
          : command === 'review:finalize-precomputed'
            ? await runFinalizePrecomputedCommand(args)
            : command === 'review:interpret-delta'
              ? await runInterpretationDeltaCommand(args)
              : command === 'review:interpret-with-aws'
                ? await runAwsInterpretationCommand(args)
                : await runSavedPublicationCommand(command, args);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}
