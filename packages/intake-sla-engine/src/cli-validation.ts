import { createArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';

import { resolveArtifactRuntime } from './artifact-runtime.js';
import {
  intakeStringArgument,
  optionalIntakeArgument,
  parseIntakeArguments,
} from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { checkIntakeDistribution } from './distribution-safety.js';
import { privateDirectory } from './private-run-storage.js';
import { prepareIntakePublication } from './publication-preparation.js';
import { validateSavedIntakeReport } from './report-validation.js';
import { intakeRuntimePackageDirectory, validateIntakeRuntime } from './self-validation.js';

export function isValidationCommand(command: string): boolean {
  return ['check:distribution', 'review:validate', 'review:prepare-publish'].includes(command);
}
function result(value: object, passed = true): IntakeCommandResult {
  return { exitCode: passed ? 0 : 1, stdout: `${JSON.stringify(value, null, 2)}\n`, stderr: '' };
}
/** Local validation/preparation only; prepared calls still require separate authorized execution. */
export async function runValidationCommand(
  command: string,
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): Promise<IntakeCommandResult> {
  if (!isValidationCommand(command)) throw new Error('Unknown validation command');
  if (command === 'check:distribution') {
    const checked = await checkIntakeDistribution(intakeRuntimePackageDirectory());
    return result(checked, checked.passed);
  }
  let phase = 'configuration';
  try {
    const args = parseIntakeArguments(argv);
    const runDirectory = optionalIntakeArgument(args, 'run-dir');
    const prepare = command === 'review:prepare-publish';
    if (prepare) intakeStringArgument(args, 'run-dir', 'review:prepare-publish requires --run-dir');
    const spreadsheetId = environment['SLA_SPREADSHEET_ID'];
    const fingerprint =
      optionalIntakeArgument(args, 'fingerprint') ?? environment['SLA_PRODUCTION_FINGERPRINT_PATH'];
    if (prepare && (!spreadsheetId || !fingerprint))
      throw new Error('Explicit Sheet and private approved fingerprint configuration required');
    phase = 'distribution-and-synthetic-suite';
    await validateIntakeRuntime();
    if (!runDirectory) return result({ passed: true, scope: 'synthetic' });
    const directory = await privateDirectory(runDirectory);
    phase = 'workbook-runtime';
    const runtime = await resolveArtifactRuntime({ env: environment });
    const provider = createArtifactWorkbookProvider(runtime.module);
    phase = 'saved-report-validation';
    if (!prepare) {
      const validated = await validateSavedIntakeReport(provider, directory);
      return result(validated, validated.passed);
    }
    if (!spreadsheetId || !fingerprint) throw new Error('Publication configuration missing');
    const primaryRejection = optionalIntakeArgument(args, 'replan-rejection') ?? '';
    const rejectionFile =
      primaryRejection || optionalIntakeArgument(args, 'capacity-replan-rejection');
    phase = 'publication-preparation';
    return result(
      await prepareIntakePublication({
        runDirectory: directory,
        expectedSpreadsheetId: spreadsheetId,
        approvedFingerprintFile: fingerprint,
        workbookProvider: provider,
        ...(rejectionFile === undefined ? {} : { rejectionFile }),
      })
    );
  } catch {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify({ code: 'INTAKE_VALIDATION_FAILED', phase })}\n`,
    };
  }
}
