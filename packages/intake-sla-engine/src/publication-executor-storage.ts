import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import { localArtifactPath, optionalPrivateJson, readPrivateJson } from './private-run-storage.js';
import type {
  ExecutionManifest,
  ExecutionGate,
  LoadedPublication,
  LoadedPublicationPayload,
  PublicationExecutionJournal,
} from './publication-executor-types.js';
import {
  assertPublicationGateBinding,
  assertPublicationStagePayload,
} from './publication-payload.js';
import type {
  PublicationLoadedCall,
  PublicationObservations,
  PublicationPayload,
} from './publication-readback-types.js';
import { evaluatePublicationReadback } from './publication-readback.js';

const coordinate = z.number().optional();
const assertion = z.object({
  id: z.string(),
  expectedHash: z.string(),
  kind: z.string().optional(),
  title: z.string().optional(),
  sheetId: coordinate,
  startRowIndex: coordinate,
  endRowIndex: coordinate,
  startColumnIndex: coordinate,
  endColumnIndex: coordinate,
  rowCount: coordinate,
  columnCount: coordinate,
  dimension: z.string().optional(),
  blankBooleanCellsAsFalse: z.array(z.tuple([z.number(), z.number()])).nullish(),
});
const manifestSchema = z.object({
  runId: z.string(),
  spreadsheetId: z.string(),
  planHash: z.string(),
  stages: z.array(
    z.object({
      id: z.string(),
      file: z.unknown(),
      calls: z.array(z.object({ file: z.unknown(), payloadHash: z.unknown().optional() })),
      assertions: z.array(assertion).nullish(),
    })
  ),
  finalAssertions: z.array(assertion).optional(),
});
const gateSchema = z.object({
  runId: z.string().optional(),
  spreadsheetId: z.string().optional(),
  planHash: z.string().optional(),
});
const observationsSchema = z.object({
  runId: z.string().optional(),
  spreadsheetId: z.string().optional(),
  planHash: z.string().optional(),
  stages: z.array(z.object({ id: z.string() })).nullish(),
});
function assertManifest(value: unknown): asserts value is ExecutionManifest {
  check(manifestSchema.safeParse(value).success, 'Invalid prepared publication manifest');
}
function assertGate(value: unknown): asserts value is ExecutionGate {
  check(gateSchema.safeParse(value).success, 'Invalid publication gate');
}
function assertObservations(value: unknown): asserts value is PublicationObservations {
  check(observationsSchema.safeParse(value).success, 'Invalid publication observations');
}
function assertPayload(value: unknown): asserts value is PublicationPayload {
  check(
    z.object({ requests: z.array(z.unknown()).nullish() }).safeParse(value).success,
    'Invalid prepared publication payload'
  );
}
/** Narrow consumed contracts without reconstructing JSON: raw controls, keys and hashes are retained. */
export async function loadPublication(runDirectory: string): Promise<LoadedPublication> {
  const manifest = await readPrivateJson(
    path.join(runDirectory, 'publication_stages_manifest.json')
  );
  const gate = await readPrivateJson(path.join(runDirectory, 'publication-gate.json'));
  assertManifest(manifest);
  assertGate(gate);
  assertPublicationGateBinding(manifest, gate);
  const observations = (await optionalPrivateJson(
    path.join(runDirectory, 'publication_stage_readbacks.json')
  )) ?? {
    schemaVersion: 1,
    runId: manifest.runId,
    spreadsheetId: manifest.spreadsheetId,
    planHash: manifest.planHash,
    stages: [],
  };
  assertObservations(observations);
  const payloads = new Map<string, LoadedPublicationPayload>();
  for (const stage of manifest.stages) {
    const payload = await readPrivateJson(localArtifactPath(runDirectory, stage.file));
    assertPayload(payload);
    const calls = await Promise.all(
      stage.calls.map(async (call) => {
        const value = await readPrivateJson(localArtifactPath(runDirectory, call.file));
        assertPayload(value);
        return { file: call.file, payload: value };
      })
    );
    assertPublicationStagePayload(stage, payload, calls);
    payloads.set(stage.id, { payload, calls });
  }
  check(
    manifest.runHistoryLast === true &&
      manifest.stages.at(-1)?.id === '09-run-history' &&
      manifest.stages.at(-2)?.id === '08-terminal-marker',
    'Publication terminal ordering is invalid'
  );
  evaluatePublicationReadback(manifest, observations);
  return { manifest, gate, observations, payloads };
}
const journalSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  planHash: z.string(),
  stageId: z.string(),
  appliedCalls: z.array(z.string()),
  inFlight: z.unknown().optional(),
});
function assertJournal(value: unknown): asserts value is PublicationExecutionJournal {
  check(journalSchema.safeParse(value).success, 'Publication execution journal changed');
}
export async function loadExecutionJournal(
  file: string,
  manifest: ExecutionManifest,
  stageId: string,
  calls: readonly PublicationLoadedCall[]
): Promise<PublicationExecutionJournal> {
  const journal = (await optionalPrivateJson(file)) ?? {
    version: 1,
    runId: manifest.runId,
    planHash: manifest.planHash,
    stageId,
    appliedCalls: [],
    inFlight: null,
  };
  assertJournal(journal);
  check(
    journal.planHash === manifest.planHash &&
      journal.runId === manifest.runId &&
      journal.stageId === stageId &&
      journal.appliedCalls.length <= calls.length &&
      journal.appliedCalls.every((hash, index) => hash === sha256Json(calls.at(index)?.payload)),
    'Publication execution journal changed'
  );
  return journal;
}
