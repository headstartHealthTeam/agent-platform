import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { filesystemCode } from './private-run-storage.js';
import type { ExecutionGate } from './publication-executor-types.js';
import {
  assertPublicationGateBinding,
  assertPublicationStagePayload,
} from './publication-payload.js';
import type {
  PublicationLoadedCall,
  PublicationManifestInput,
  PublicationObservations,
  PublicationPayload,
  PublicationStageInput,
} from './publication-readback-types.js';

const assertion = z.object({ id: z.string() });
const manifestSchema = z.object({
  runId: z.string(),
  spreadsheetId: z.string(),
  planHash: z.string(),
  stages: z.array(
    z.object({
      id: z.string(),
      calls: z.array(z.object({})).nullish(),
      assertions: z.array(assertion).nullish(),
    })
  ),
  finalAssertions: z.array(assertion).optional(),
});
export async function readPublicationJson(file: string): Promise<unknown> {
  const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
  return value;
}
export function assertCommandManifest(value: unknown): asserts value is PublicationManifestInput {
  check(manifestSchema.safeParse(value).success, 'Invalid prepared publication manifest');
}
export function assertCommandGate(value: unknown): asserts value is ExecutionGate {
  check(
    z
      .object({
        runId: z.string().optional(),
        spreadsheetId: z.string().optional(),
        planHash: z.string().optional(),
      })
      .safeParse(value).success,
    'Invalid publication gate'
  );
}
export function assertCommandObservations(
  value: unknown
): asserts value is PublicationObservations {
  check(
    z
      .object({
        runId: z.string().optional(),
        spreadsheetId: z.string().optional(),
        planHash: z.string().optional(),
        stages: z.array(z.object({ id: z.string() })).nullish(),
      })
      .safeParse(value).success,
    'Invalid publication observations'
  );
}
export function assertCommandPayload(value: unknown): asserts value is PublicationPayload {
  check(
    z.object({ requests: z.array(z.unknown()).nullish() }).safeParse(value).success,
    'Invalid prepared publication payload'
  );
}
export function commandArtifactPath(runDirectory: string, file: unknown): string {
  if (typeof file !== 'string')
    throw new TypeError('Publication artifact filename must be a string');
  return path.join(runDirectory, file);
}
export async function loadPublicationCommandBinding(runDirectory: string): Promise<{
  manifest: PublicationManifestInput;
  gate: ExecutionGate;
}> {
  const manifest = await readPublicationJson(
    path.join(runDirectory, 'publication_stages_manifest.json')
  );
  const gate = await readPublicationJson(path.join(runDirectory, 'publication-gate.json'));
  assertCommandManifest(manifest);
  assertCommandGate(gate);
  assertPublicationGateBinding(manifest, gate);
  return { manifest, gate };
}
export async function loadPublicationCommandObservations(
  runDirectory: string,
  manifest: PublicationManifestInput,
  optional = true
): Promise<PublicationObservations> {
  let observations: unknown;
  try {
    observations = await readPublicationJson(
      path.join(runDirectory, 'publication_stage_readbacks.json')
    );
  } catch (error) {
    if (!optional || !filesystemCode(error, 'ENOENT')) throw error;
    observations = {
      schemaVersion: 1,
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      stages: [],
    };
  }
  assertCommandObservations(observations);
  return observations;
}
export async function loadPublicationCommandState(runDirectory: string): Promise<{
  manifest: PublicationManifestInput;
  gate: ExecutionGate;
  observations: PublicationObservations;
}> {
  const binding = await loadPublicationCommandBinding(runDirectory);
  return {
    ...binding,
    observations: await loadPublicationCommandObservations(runDirectory, binding.manifest),
  };
}
export async function loadCommandStagePayload(
  runDirectory: string,
  stage: PublicationStageInput
): Promise<PublicationPayload> {
  const payload = await readPublicationJson(commandArtifactPath(runDirectory, stage.file));
  assertCommandPayload(payload);
  const calls: PublicationLoadedCall[] = [];
  for (const call of stage.calls ?? []) {
    const value = await readPublicationJson(commandArtifactPath(runDirectory, call.file));
    assertCommandPayload(value);
    calls.push({ file: call.file, payload: value });
  }
  assertPublicationStagePayload(stage, payload, calls);
  return payload;
}
