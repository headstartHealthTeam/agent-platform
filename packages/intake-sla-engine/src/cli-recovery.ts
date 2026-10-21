import { intakeStringArgument, parseIntakeArguments } from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import {
  initializeSavedCorrection,
  savePortalAuthCapture,
  savePostCutoffCapture,
  saveStructuredCorrectionDelta,
} from './recovery-storage.js';

const errorCodes = new Map([
  ['review:portal-auth-capture', 'PORTAL_AUTH_CAPTURE_FAILED'],
  ['review:correction-init', 'CORRECTION_INITIALIZATION_FAILED'],
  ['review:structured-delta', 'STRUCTURED_DELTA_FAILED'],
  ['review:post-cutoff-capture', 'POST_CUTOFF_CAPTURE_FAILED'],
]);
export function isRecoveryCommand(command: string): boolean {
  return errorCodes.has(command);
}
/** Accept saved captures only; provider access and additional investigation remain agent-owned. */
export async function runRecoveryCommand(
  command: string,
  argv: readonly string[]
): Promise<IntakeCommandResult> {
  const code = errorCodes.get(command);
  if (!code) throw new Error('Unknown Intake recovery command');
  try {
    const args = parseIntakeArguments(argv);
    const required = (name: string): string =>
      intakeStringArgument(args, name, `${command} requires --${name}`);
    const directory = required('run-dir');
    let result: unknown;
    switch (command) {
      case 'review:portal-auth-capture':
        result = await savePortalAuthCapture(directory, required('input'));
        break;
      case 'review:correction-init':
        result = await initializeSavedCorrection({
          runDirectory: directory,
          baseDirectory: required('base-run-dir'),
          runId: required('run-id'),
          asOf: required('as-of'),
        });
        break;
      case 'review:structured-delta':
        result = await saveStructuredCorrectionDelta(required('base-run-dir'), directory);
        break;
      case 'review:post-cutoff-capture':
        result = await savePostCutoffCapture(directory, required('input'));
        break;
      default:
        throw new Error('Unknown Intake recovery command');
    }
    return { exitCode: 0, stdout: `${JSON.stringify(result)}\n`, stderr: '' };
  } catch {
    return { exitCode: 1, stdout: '', stderr: `${JSON.stringify({ code })}\n` };
  }
}
