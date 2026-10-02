import path from 'node:path';

import { FirefliesReadError } from '@headstart-health/fireflies-data';

import { intakeStringArgument, parseIntakeArguments } from './cli-arguments.js';
import { readCaptureInput } from './cli-capture-input.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { connectorCheckpoint } from './connector-checkpoint.js';
import {
  acceptCandidateBodies,
  boundedCollectionStatus,
  captureCandidateResponse,
  finalizeBoundedCollection,
  planBoundedCollection,
} from './fireflies-bounded-storage.js';
import { FirefliesCacheError } from './fireflies-cache-contract.js';
import { privateDirectory, readPrivateJson } from './private-run-storage.js';
import {
  saveNormalizedFirefliesDiscovery,
  saveSlackDelta,
  saveSlackSearchCapture,
} from './source-capture-storage.js';

const NORMALIZE = 'review:fireflies-normalize';
const BODY = 'review:fireflies-body-capture';
const BOUNDED = 'review:fireflies-bounded';
const codes = new Map([
  ['review:checkpoint', 'CONNECTOR_CHECKPOINT_FAILED'],
  [NORMALIZE, 'DISCOVERY_NORMALIZATION_FAILED'],
  [BODY, 'FIREFLIES_BODY_CAPTURE_FAILED'],
  [BOUNDED, 'BOUNDED_FIREFLIES_FAILED'],
  ['review:slack-capture', 'SLACK_CAPTURE_FAILED'],
  ['review:slack-delta', 'SLACK_DELTA_FAILED'],
]);
type Arguments = ReturnType<typeof parseIntakeArguments>;
function required(args: Arguments, name: string): string {
  return intakeStringArgument(args, name, `A --${name} value is required`);
}
export function isSourceCaptureCommand(command: string): boolean {
  return codes.has(command);
}
async function checkpoint(args: Arguments, stream: AsyncIterable<unknown>): Promise<object> {
  const plan = await readPrivateJson(required(args, 'plan'));
  const hasInput = Boolean(args['input']);
  const capture = hasInput ? await readCaptureInput(required(args, 'input'), stream) : undefined;
  const status = await connectorCheckpoint({
    runDir: required(args, 'run-dir'),
    action: required(args, 'action'),
    plan,
    capture,
  });
  return {
    planHash: status.planHash,
    expected: status.expected,
    saved: status.saved,
    pending: status.pending,
    blocked: status.blocked,
  };
}
async function body(args: Arguments, stream: AsyncIterable<unknown>): Promise<object> {
  const directory = await privateDirectory(required(args, 'run-dir'));
  const index = Number(args['index']);
  if (args['index'] === undefined || !Number.isSafeInteger(index) || index < 0)
    throw new Error('Invalid capture index');
  let capture: unknown;
  const hasInput = Boolean(args['input']);
  if (hasInput) {
    const input = required(args, 'input');
    if (input !== '-' && path.dirname(path.resolve(input)) !== directory)
      throw new Error('Invalid capture input');
    capture = await readCaptureInput(input, stream);
  }
  return captureCandidateResponse(directory, { index, capture });
}
async function bounded(args: Arguments, stream: AsyncIterable<unknown>): Promise<object> {
  const directory = await privateDirectory(required(args, 'run-dir'));
  switch (required(args, 'action')) {
    case 'plan':
      return planBoundedCollection(directory);
    case 'status':
      return boundedCollectionStatus(directory);
    case 'finalize':
      return finalizeBoundedCollection(directory);
    case 'accept':
      return acceptCandidateBodies(
        directory,
        await readCaptureInput(required(args, 'input'), stream)
      );
    default:
      throw new Error('Choose plan, status, accept, or finalize');
  }
}
function captureFailure(command: string, code: string, error: unknown): object {
  if (command === BODY)
    return error instanceof FirefliesReadError
      ? {
          code: error.code,
          status: error.status,
          retryAfterMs: Math.max(error.retryAfterMs, error.status === 429 ? 60_000 : 0),
          stopDispatch: true,
        }
      : { code, stopDispatch: true };
  if (command === NORMALIZE)
    return {
      status: 'Blocked',
      code: error instanceof FirefliesCacheError ? error.code : code,
      message:
        'Discovery normalization did not complete. Inspect private inputs; do not infer source completeness.',
    };
  if (command === BOUNDED)
    return {
      status: 'Blocked',
      code,
      message:
        'Bounded collection did not advance. Inspect protected inputs; never infer source completion from a failed checkpoint.',
    };
  return { code };
}
/** Local acceptance of agent-supplied captures; never dispatches a provider read or write. */
export async function runSourceCaptureCommand(
  command: string,
  argv: readonly string[],
  stream: AsyncIterable<unknown> = process.stdin
): Promise<IntakeCommandResult> {
  const code = codes.get(command);
  if (!code) throw new Error('Unknown source capture command');
  try {
    const args = parseIntakeArguments(argv);
    let result: object;
    switch (command) {
      case 'review:checkpoint':
        result = await checkpoint(args, stream);
        break;
      case BODY:
        result = await body(args, stream);
        break;
      case BOUNDED:
        result = await bounded(args, stream);
        break;
      case NORMALIZE:
        result = await saveNormalizedFirefliesDiscovery(required(args, 'run-dir'));
        break;
      case 'review:slack-capture':
        result = await saveSlackSearchCapture({
          runDirectory: required(args, 'run-dir'),
          inputFile: required(args, 'input'),
          resume: Boolean(args['resume']),
        });
        break;
      case 'review:slack-delta':
        result = await saveSlackDelta({
          runDirectory: required(args, 'run-dir'),
          baseFile: required(args, 'base'),
          deltaFile: required(args, 'delta'),
          proofFile: required(args, 'proof'),
        });
        break;
      default:
        throw new Error('Unknown source capture command');
    }
    const pretty = command === NORMALIZE || command === BOUNDED;
    return {
      exitCode: 0,
      stdout: `${JSON.stringify(result, null, pretty ? 2 : undefined)}\n`,
      stderr: '',
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify(captureFailure(command, code, error))}\n`,
    };
  }
}
