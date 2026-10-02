#!/usr/bin/env node
import { runAwsInterpretationCommand } from './cli-aws-interpretation.js';
import { runBuildReportCommand } from './cli-build.js';
import { runFirefliesPacketsCommand } from './cli-fireflies-packets.js';
import { runFirefliesCacheCommand, runFirefliesPlanCommand } from './cli-fireflies-planning.js';
import { runFirefliesReplayCommand } from './cli-fireflies-replay.js';
import {
  runFinalizePrecomputedCommand,
  runInterpretationPreflightCommand,
  runInterpretationDeltaCommand,
} from './cli-interpretation.js';
import { runPortalPlanningCommand } from './cli-portal-planning.js';
import { runSavedPublicationCommand } from './cli-publication.js';
import { isRecoveryCommand, runRecoveryCommand } from './cli-recovery.js';
import { runArtifactPreflightCommand, runWorkbookRuntimeSmokeCommand } from './cli-runtime.js';
import { runSlackPlanningCommand } from './cli-slack-planning.js';
import { isSourceCaptureCommand, runSourceCaptureCommand } from './cli-source-capture.js';
import { runGoogleReadCommand, runProductionDriftCommand } from './cli-source-read.js';
import { isValidationCommand, runValidationCommand } from './cli-validation.js';

const [command = '', ...args] = process.argv.slice(2);
try {
  const result =
    command === 'review:slack-plan' || command === 'review:slack-merge'
      ? await runSlackPlanningCommand(command, args)
      : command === 'review:portal-plan' || command === 'review:portal-materialize'
        ? await runPortalPlanningCommand(command, args)
        : command === 'review:fireflies-plan'
          ? await runFirefliesPlanCommand(args)
          : command === 'review:fireflies-cache'
            ? await runFirefliesCacheCommand(args)
            : command === 'review:fireflies-replay'
              ? await runFirefliesReplayCommand(args)
              : command === 'review:fireflies-packets'
                ? await runFirefliesPacketsCommand(args)
                : command === 'review:google-read'
                  ? await runGoogleReadCommand(args)
                  : command === 'review:drift'
                    ? await runProductionDriftCommand(args)
                    : command === 'review:build'
                      ? await runBuildReportCommand(args)
                      : command === 'review:runtime-preflight'
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
                                  : isRecoveryCommand(command)
                                    ? await runRecoveryCommand(command, args)
                                    : isSourceCaptureCommand(command)
                                      ? await runSourceCaptureCommand(command, args)
                                      : isValidationCommand(command)
                                        ? await runValidationCommand(command, args)
                                        : await runSavedPublicationCommand(command, args);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}
