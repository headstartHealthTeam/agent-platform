import { createArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';

import { resolveArtifactRuntime, recordArtifactRuntimePreflight } from './artifact-runtime.js';
import {
  intakeStringArgument,
  optionalIntakeArgument,
  parseIntakeArguments,
} from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import type { StructuredCollectionSource } from './collection-initial.js';
import { privateDirectory, requireMutableRun } from './private-run-storage.js';
import { buildIntakeReport } from './report-build.js';
import { loadReportIdentityRegistries, loadReportInterpreter } from './report-runtime-inputs.js';
import { connectIntakeSalesforce, intakeSalesforceTargetFromEnv } from './salesforce-reader.js';

export async function runBuildReportCommand(
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): Promise<IntakeCommandResult> {
  const args = parseIntakeArguments(argv);
  const usage =
    'review:build --run-dir <private-run-directory> [--run-at <frozen-cutoff>] [--use-existing-structured]';
  const runDirectory = await privateDirectory(intakeStringArgument(args, 'run-dir', usage));
  await requireMutableRun(runDirectory);
  const selectedCutoff = optionalIntakeArgument(args, 'run-at') ?? environment['RUN_AT'];
  const cutoffText = selectedCutoff === '' ? undefined : selectedCutoff;
  const runAt = new Date(cutoffText ?? Date.now());
  if (!Number.isFinite(runAt.getTime())) throw new Error('Invalid frozen report cutoff');
  const clientRegistryPath =
    optionalIntakeArgument(args, 'client-registry') ??
    environment['SLA_CLIENT_IDENTITY_ALIASES_PATH'];
  const providerRegistryPath =
    optionalIntakeArgument(args, 'provider-registry') ??
    environment['SLA_PROVIDER_IDENTITY_ALIASES_PATH'];
  if (!clientRegistryPath || !providerRegistryPath)
    throw new Error('Explicit private client and provider identity registry paths are required');
  let phase = 'workbook-runtime';
  try {
    const runtime = await resolveArtifactRuntime({ env: environment });
    await recordArtifactRuntimePreflight(runtime.identity, runDirectory);
    phase = 'private-identity-inputs';
    const registries = await loadReportIdentityRegistries({
      clientRegistryPath,
      providerRegistryPath,
    });
    phase = 'interpretation-setup';
    const interpretation = await loadReportInterpreter({ runDirectory, environment });
    phase = 'source-setup';
    const useSaved =
      Boolean(args['use-existing-structured']) ||
      environment['SLA_USE_EXISTING_STRUCTURED'] === '1';
    const source: StructuredCollectionSource = useSaved
      ? { mode: 'saved' }
      : {
          mode: 'live',
          reader: await connectIntakeSalesforce(intakeSalesforceTargetFromEnv(environment)),
        };
    const ledgerInputPath = environment['SLA_GENERATION_LEDGER_PATH'];
    phase = 'report-build';
    await buildIntakeReport({
      runDirectory,
      runAt,
      source,
      registries,
      interpretation,
      requireReviewerState: true,
      workbookProvider: createArtifactWorkbookProvider(runtime.module),
      ...(ledgerInputPath === undefined ? {} : { ledgerInputPath }),
    });
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ built: true, runDir: runDirectory })}\n`,
      stderr: '',
    };
  } catch {
    // Decoder/provider messages can contain private record values. Never forward raw errors.
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify({ code: 'INTAKE_REPORT_BUILD_FAILED', phase, checkpointsRetained: true })}\n`,
    };
  }
}
