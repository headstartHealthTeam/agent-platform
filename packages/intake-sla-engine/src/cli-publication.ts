import {
  intakeStringArgument,
  optionalIntakeArgument,
  parseIntakeArguments,
} from './cli-arguments.js';
import { prepareSavedGooglePublication } from './google-publication-storage.js';
import { saveGoogleStateCapture } from './google-state-persistence.js';
import { readNextPublicationStage } from './publication-next-command.js';
import {
  capturePreparedStageReadback,
  verifyPreparedPublication,
} from './publication-readback-commands.js';

export interface IntakeCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
const GOOGLE_CAPTURE_COMMAND = 'review:google-capture';
function jsonResult(value: unknown, exitCode = 0, pretty = true): IntakeCommandResult {
  return {
    exitCode,
    stdout: `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`,
    stderr: '',
  };
}
function required(
  args: Readonly<Record<string, string | boolean>>,
  key: string,
  command: string,
  flags: string
): string {
  return intakeStringArgument(args, key, `Usage: headstart-intake-sla ${command} ${flags}`);
}
async function captureState(
  args: Readonly<Record<string, string | boolean>>
): Promise<IntakeCommandResult> {
  try {
    // Revalidation does not consume --input. An absent/value-less input only fails if needed.
    const rawInput = args['input'];
    const inputFile = typeof rawInput === 'string' ? rawInput : undefined;
    const revalidateFile = optionalIntakeArgument(args, 'revalidate');
    const result = await saveGoogleStateCapture({
      runDirectory: required(
        args,
        'run-dir',
        GOOGLE_CAPTURE_COMMAND,
        '--run-dir <run> --input <capture> --spreadsheet-id <sheet> --run-id <id>'
      ),
      spreadsheetId: required(
        args,
        'spreadsheet-id',
        GOOGLE_CAPTURE_COMMAND,
        '--spreadsheet-id <sheet>'
      ),
      runId: required(args, 'run-id', GOOGLE_CAPTURE_COMMAND, '--run-id <id>'),
      ...(inputFile === undefined ? {} : { inputFile }),
      ...(revalidateFile === undefined ? {} : { revalidateFile }),
    });
    return jsonResult(result, 0, false);
  } catch {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify({ code: 'GOOGLE_STATE_CAPTURE_FAILED' })}\n`,
    };
  }
}
/** These routes only inspect/prepare local files or accept supplied readbacks. No provider writes. */
export async function runSavedPublicationCommand(
  command: string,
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  if (command === 'build-google-payloads') {
    const runDirectory = argv[0];
    if (!runDirectory)
      throw new Error(
        'Usage: headstart-intake-sla build-google-payloads <run-directory> [rejection-file]'
      );
    return jsonResult(
      await prepareSavedGooglePublication({
        runDirectory,
        ...(argv[1] === undefined ? {} : { rejectionFile: argv[1] }),
      })
    );
  }
  const args = parseIntakeArguments(argv);
  if (command === GOOGLE_CAPTURE_COMMAND) return captureState(args);
  if (command === 'review:next-publish-stage')
    return jsonResult(
      await readNextPublicationStage(required(args, 'run-dir', command, '--run-dir <run>'))
    );
  if (command === 'review:capture-publish-readback') {
    const usage = '--run-dir <run> --stage-id <stage> --actual <capture>';
    return jsonResult(
      await capturePreparedStageReadback({
        runDirectory: required(args, 'run-dir', command, usage),
        stageId: required(args, 'stage-id', command, usage),
        actualFile: required(args, 'actual', command, usage),
      })
    );
  }
  if (command === 'review:verify-publish') {
    const usage = '--run-dir <run> --actual <capture>';
    const result = await verifyPreparedPublication({
      runDirectory: required(args, 'run-dir', command, usage),
      actualFile: required(args, 'actual', command, usage),
    });
    return jsonResult(result.result, result.exitCode);
  }
  throw new Error('Unknown Intake command');
}
