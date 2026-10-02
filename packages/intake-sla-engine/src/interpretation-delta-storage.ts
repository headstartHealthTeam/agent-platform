import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type {
  InterpretationArtifact,
  InterpretationEnvelope,
  SavedInterpretation,
} from './bounded-delta-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import { INTERPRETATION_BINDING_VERSION } from './interpretation-binding.js';
import { filesystemCode } from './private-run-storage.js';

export interface DeltaConfig {
  readonly model: string;
  readonly provider: string;
}
export type StoredDeltaInterpretation = SavedInterpretation<unknown> &
  Readonly<Record<string, unknown>>;
export interface DeltaCheckpoint {
  readonly [key: string]: unknown;
  readonly model: string;
  readonly provider: string;
  interpretations?: (StoredDeltaInterpretation & { readonly opportunityId: string })[] | null;
}
export interface DeltaPacketArtifact {
  readonly packets?: readonly InterpretationEnvelope<unknown, unknown>[] | null;
}
const packetShape = z.object({
  packets: z
    .array(
      z.object({
        opportunityId: z.string(),
        sourceRecordId: z.string(),
        packet: z.unknown(),
      })
    )
    .nullish(),
});
const savedShape = z.object({ sourceRecordId: z.string() });
const priorShape = z.object({
  rows: z
    .array(
      z.object({
        opportunityId: z.unknown().optional(),
        interpretations: z.array(savedShape).nullish(),
      })
    )
    .nullish(),
});
const checkpointShape = z.object({
  model: z.string(),
  provider: z.string(),
  interpretations: z.array(savedShape.extend({ opportunityId: z.string() })).nullish(),
});
function assertPackets(value: unknown): asserts value is DeltaPacketArtifact {
  if (!packetShape.safeParse(value).success)
    throw new Error('Invalid interpretation packet artifact');
}
function assertPrior(
  value: unknown
): asserts value is InterpretationArtifact<StoredDeltaInterpretation> {
  if (!priorShape.safeParse(value).success)
    throw new Error('Invalid prior interpretation artifact');
}
function assertCheckpoint(value: unknown): asserts value is DeltaCheckpoint {
  if (!checkpointShape.safeParse(value).success)
    throw new Error('Invalid interpretation checkpoint');
}
async function readJson(file: string): Promise<unknown> {
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  return value;
}
export async function requireDeltaPreflight(directory: string, config: DeltaConfig): Promise<void> {
  const file = path.join(directory, 'ai_interpretation_preflight.json');
  try {
    await fs.access(file);
  } catch {
    throw new Error(`Successful current-run AI preflight is required: ${file}`);
  }
  const value = await readJson(file);
  const result = z
    .object({
      passed: z.unknown(),
      model: z.unknown(),
      provider: z.unknown(),
      engineVersion: z.unknown(),
      bindingVersion: z.unknown(),
      store: z.unknown(),
      credentialSourceApproved: z.unknown(),
      checkedAt: z.unknown(),
    })
    .safeParse(value);
  const passed = result.success && Boolean(result.data.passed);
  if (
    !result.success ||
    !passed ||
    result.data.model !== config.model ||
    result.data.provider !== config.provider ||
    result.data.engineVersion !== EVIDENCE_ENGINE_VERSION ||
    result.data.bindingVersion !== INTERPRETATION_BINDING_VERSION ||
    result.data.store !== false ||
    result.data.credentialSourceApproved !== true
  )
    throw new Error('Current-run AI preflight does not match the interpretation contract');
  const age = Date.now() - Date.parse(String(result.data.checkedAt));
  if (!Number.isFinite(age) || age < 0 || age > 30 * 60 * 1000)
    throw new Error('Current-run AI preflight is missing, future-dated, or older than 30 minutes');
}
export async function readDeltaArtifacts(
  directory: string,
  priorDirectory: string,
  config: DeltaConfig
): Promise<{
  currentPackets: DeltaPacketArtifact;
  priorPackets: DeltaPacketArtifact;
  priorInterpretations: InterpretationArtifact<StoredDeltaInterpretation>;
  checkpoint: DeltaCheckpoint;
}> {
  const [currentPackets, priorPackets, priorInterpretations] = await Promise.all([
    readJson(path.join(directory, 'fireflies_interpretation_packets.json')),
    readJson(path.join(priorDirectory, 'fireflies_interpretation_packets.json')),
    readJson(path.join(priorDirectory, 'ai_interpretation_precomputed.json')),
  ]);
  let checkpoint: unknown = {
    schemaVersion: 1,
    model: config.model,
    provider: config.provider,
    interpretations: [],
  };
  try {
    checkpoint = await readJson(path.join(directory, 'ai_interpretation_delta_checkpoint.json'));
  } catch (error) {
    if (!filesystemCode(error, 'ENOENT')) throw error;
  }
  assertCheckpoint(checkpoint);
  if (checkpoint.model !== config.model || checkpoint.provider !== config.provider)
    throw new Error('Existing interpretation checkpoint uses a different model or provider');
  assertPackets(currentPackets);
  assertPackets(priorPackets);
  assertPrior(priorInterpretations);
  return { currentPackets, priorPackets, priorInterpretations, checkpoint };
}
