import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import {
  finalizeCurrentRunPrecomputed,
  type CurrentRunPrecomputedArtifact,
  type CurrentRunPrecomputedInput,
} from './precomputed-interpretation.js';

const packetShape = z.object({
  packets: z
    .array(
      z.object({
        opportunityId: z.string(),
        sourceRecordId: z.string(),
        meetingId: z.unknown().optional(),
        packet: z.unknown(),
      })
    )
    .nullish(),
});
const candidateShape = z.object({
  rows: z
    .array(
      z.object({
        opportunityId: z.unknown().optional(),
        interpretations: z
          .array(z.object({ sourceRecordId: z.string(), findings: z.unknown().optional() }))
          .nullish(),
      })
    )
    .nullish(),
});
function assertPackets(
  value: unknown
): asserts value is CurrentRunPrecomputedInput<unknown>['packets'] {
  if (!packetShape.safeParse(value).success)
    throw new Error('Invalid current-run interpretation packet artifact');
}
function assertCandidates(
  value: unknown
): asserts value is CurrentRunPrecomputedInput<unknown>['candidates'] {
  if (!candidateShape.safeParse(value).success)
    throw new Error('Invalid current-run precomputed candidate artifact');
}
async function requireFile(file: string, label: string): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    throw new Error(`${label} is required: ${file}`);
  }
}
async function readJson(file: string): Promise<unknown> {
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  return value;
}
/** Preserve the original candidate/packet bytes for binding; schema checks never replace the objects. */
export async function finalizeSavedCurrentRunPrecomputed(
  runDirectory: string
): Promise<CurrentRunPrecomputedArtifact<unknown>> {
  const resolvedDirectory = path.resolve(runDirectory);
  const packetPath = path.join(resolvedDirectory, 'fireflies_interpretation_packets.json');
  const candidatePath = path.join(resolvedDirectory, 'ai_interpretation_candidate.json');
  await requireFile(packetPath, 'Current-run interpretation packets');
  await requireFile(candidatePath, 'Current-run Codex precomputed candidate');
  const packets = await readJson(packetPath);
  const candidates = await readJson(candidatePath);
  assertPackets(packets);
  assertCandidates(candidates);
  const artifact = finalizeCurrentRunPrecomputed({
    packets,
    candidates,
    engineVersion: EVIDENCE_ENGINE_VERSION,
  });
  await fs.writeFile(
    path.join(resolvedDirectory, 'ai_interpretation_precomputed.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    { mode: 0o600 }
  );
  return artifact;
}
