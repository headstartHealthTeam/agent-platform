import path from 'node:path';

import {
  createStructuredResponsesClient,
  type StructuredResponsesClient,
} from '@headstart-health/openai-platform/responses';
import { z } from 'zod';

import { interpretTranscriptPacketWithAI } from './ai-interpretation.js';
import {
  groupInterpretationsByOpportunity,
  planInterpretationDelta,
  type InterpretationDeltaInput,
  type InterpretationDeltaPlan,
  type OpportunityInterpretations,
} from './bounded-delta-interpretation.js';
import { runBoundedWorkers, type WorkerProgress } from './bounded-worker-pool.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { interpreterConfigFromEnv } from './interpretation-binding.js';
import {
  readDeltaArtifacts,
  requireDeltaPreflight,
  type DeltaCheckpoint,
  type StoredDeltaInterpretation,
} from './interpretation-delta-storage.js';
import type { PreparedInterpretationPacket } from './interpretation-packet.js';
import {
  privateDirectory,
  requireMutableRun,
  withCacheLock,
  writePrivateJson,
} from './private-run-storage.js';

export interface InterpretSavedDeltaInput {
  readonly runDirectory: string;
  readonly priorRunDirectory: string;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly createClient?: (key: string | undefined) => StructuredResponsesClient;
  readonly onProgress?: (progress: WorkerProgress) => void;
}
type DeltaPlan = InterpretationDeltaPlan<StoredDeltaInterpretation, unknown, unknown>;
type Telemetry = Omit<WorkerProgress, 'concurrencyLimit'> & { readonly concurrencyLimit?: number };
export interface SavedDeltaArtifact {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly apiEnabled: true;
  readonly provider: string;
  readonly model: string;
  readonly engineVersion: string;
  readonly bindingVersion: string | null;
  readonly store: false;
  readonly counts: DeltaPlan['counts'];
  readonly resolvedCounts: DeltaPlan['counts'];
  readonly rows: readonly OpportunityInterpretations<StoredDeltaInterpretation, unknown>[];
}
const preparedShape = z.object({
  transcriptSegment: z.string().nullish(),
  source: z
    .object({ matchQuality: z.string().nullish(), eventDate: z.string().nullish() })
    .nullish(),
  opportunity: z.object({ id: z.string().nullish() }).nullish(),
});
function assertPreparedPacket(value: unknown): asserts value is PreparedInterpretationPacket {
  if (!preparedShape.safeParse(value).success)
    throw new Error('Invalid prepared transcript interpretation packet');
}
function deltaClient(key: string | undefined): StructuredResponsesClient {
  if (!key) throw new Error('OPENAI_API_KEY is required for AI transcript interpretation.');
  return createStructuredResponsesClient({ apiKey: key });
}
async function runFresh(input: {
  readonly initialPlan: DeltaPlan;
  readonly checkpoint: DeltaCheckpoint;
  readonly directory: string;
  readonly config: { readonly model: string; readonly provider: string };
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly createClient: (key: string | undefined) => StructuredResponsesClient;
  readonly onProgress: InterpretSavedDeltaInput['onProgress'];
}): Promise<Telemetry> {
  const { initialPlan, checkpoint, directory, config, env } = input;
  const client = input.createClient(env['OPENAI_API_KEY']);
  const controller = new AbortController();
  let telemetry: Telemetry = {
    completed: 0,
    required: initialPlan.counts.fresh,
    retries: 0,
    elapsedMs: 0,
  };
  const cancel = (): void => {
    controller.abort();
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    await runBoundedWorkers({
      items: initialPlan.items.filter((item) => item.mode === 'fresh'),
      concurrency: Number(env['SLA_INTERPRETER_CONCURRENCY'] ?? 2),
      signal: controller.signal,
      work: async (item, { signal }) => {
        const packet = item.envelope.packet;
        assertPreparedPacket(packet);
        return interpretTranscriptPacketWithAI({
          packet,
          client,
          ...config,
          engineVersion: EVIDENCE_ENGINE_VERSION,
          ...(signal === undefined ? {} : { signal }),
        });
      },
      persist: async (item, interpretation) => {
        checkpoint.interpretations = [
          ...(checkpoint.interpretations ?? []).filter(
            (candidate) =>
              candidate.opportunityId !== item.envelope.opportunityId ||
              candidate.sourceRecordId !== item.envelope.sourceRecordId
          ),
          {
            opportunityId: item.envelope.opportunityId,
            sourceRecordId: item.envelope.sourceRecordId,
            meetingId: item.envelope.meetingId,
            ...interpretation,
          },
        ];
        await writePrivateJson(
          path.join(directory, 'ai_interpretation_delta_checkpoint.json'),
          checkpoint
        );
      },
      onProgress: (counts) => {
        telemetry = counts;
        input.onProgress?.(counts);
      },
    });
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
  return telemetry;
}
async function interpretLocked(
  directory: string,
  input: InterpretSavedDeltaInput,
  config: { readonly model: string; readonly provider: string },
  env: Readonly<NodeJS.ProcessEnv>
): Promise<SavedDeltaArtifact> {
  await requireMutableRun(directory);
  await requireDeltaPreflight(directory, config);
  const artifacts = await readDeltaArtifacts(
    directory,
    path.resolve(input.priorRunDirectory),
    config
  );
  const planInput: InterpretationDeltaInput<StoredDeltaInterpretation, unknown, unknown> = {
    ...artifacts,
    ...config,
    engineVersion: EVIDENCE_ENGINE_VERSION,
  };
  const initialPlan = planInterpretationDelta(planInput);
  const workerTelemetry = await runFresh({
    initialPlan,
    checkpoint: artifacts.checkpoint,
    directory,
    config,
    env,
    createClient: input.createClient ?? deltaClient,
    onProgress: input.onProgress,
  });
  const resolvedPlan = planInterpretationDelta(planInput);
  if (resolvedPlan.items.some((item) => item.mode === 'fresh'))
    throw new Error('Interpretation delta did not produce a bound result for every current packet');
  const artifact: SavedDeltaArtifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    apiEnabled: true,
    provider: config.provider,
    model: config.model,
    engineVersion: EVIDENCE_ENGINE_VERSION,
    bindingVersion: resolvedPlan.items[0]?.binding.bindingVersion ?? null,
    store: false,
    counts: initialPlan.counts,
    resolvedCounts: resolvedPlan.counts,
    rows: groupInterpretationsByOpportunity(resolvedPlan.items),
  };
  await writePrivateJson(path.join(directory, 'ai_interpretation_precomputed.json'), artifact);
  await writePrivateJson(path.join(directory, 'ai_interpretation_delta_execution.json'), {
    ...artifact,
    rows: undefined,
    currentPacketCount: resolvedPlan.items.length,
    allCurrentPacketsBound: true,
    workerTelemetry,
  });
  return artifact;
}
/** Only exact-bound API results may be reused; successful new results are checkpointed before failure. */
export async function interpretSavedDelta(
  input: InterpretSavedDeltaInput
): Promise<SavedDeltaArtifact> {
  const env = input.env ?? process.env;
  if (env['SLA_AI_INTERPRETATION'] !== 'on')
    throw new Error('SLA_AI_INTERPRETATION must be exactly on');
  const config = interpreterConfigFromEnv(env, { requireCredentialSource: true });
  const directory = await privateDirectory(input.runDirectory);
  return withCacheLock(directory, async () => interpretLocked(directory, input, config, env));
}
