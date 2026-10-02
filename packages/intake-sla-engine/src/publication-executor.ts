import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import {
  localArtifactPath,
  optionalPrivateJson,
  privateDirectory,
  withCacheLock,
  writePrivateJson,
} from './private-run-storage.js';
import {
  capturePublicationActual,
  retainPublicationCapture,
} from './publication-executor-capture.js';
import { loadExecutionJournal, loadPublication } from './publication-executor-storage.js';
import type {
  ExecutionStage,
  LoadedPublication,
  LoadedPublicationPayload,
  PublicationAuthority,
  PublicationAdvanceResult,
  PublicationReadAdapter,
  PublicationWriteAdapter,
} from './publication-executor-types.js';
import { assertPublicationGateFreshness } from './publication-freshness.js';
import {
  evaluatePublicationReadback,
  nextPublicationStage,
  recordPublicationStageReadback,
  verifyFinalPublicationActual,
} from './publication-readback.js';

const FINAL_RECEIPT = 'publication-readback.json';

function authorize(loaded: LoadedPublication, authority?: PublicationAuthority | null): void {
  const { manifest } = loaded;
  check(
    authority?.approved === true &&
      authority.runId === manifest.runId &&
      authority.spreadsheetId === manifest.spreadsheetId &&
      authority.planHash === manifest.planHash,
    'Explicit authorization for this exact publication plan is required'
  );
}
async function concurrency(
  adapter: PublicationWriteAdapter,
  loaded: LoadedPublication
): Promise<void> {
  const { manifest, gate, observations } = loaded;
  const now = Date.now();
  assertPublicationGateFreshness({ evaluatedAt: String(gate.evaluatedAt) }, now);
  const result = await adapter.checkConcurrency({ manifest, observations });
  check(
    result?.passed === true &&
      result.runId === manifest.runId &&
      result.planHash === manifest.planHash &&
      result.spreadsheetId === manifest.spreadsheetId &&
      result.reviewerStateUnchanged === true &&
      result.markerMatchesExpectedStage === true &&
      result.noCompetingRun === true &&
      Date.parse(String(result.checkedAt)) >= now &&
      Date.parse(String(result.checkedAt)) <= Date.now(),
    'Live publication concurrency check failed'
  );
}
interface StageContext {
  readonly runDirectory: string;
  readonly adapter: PublicationWriteAdapter;
  readonly loaded: LoadedPublication;
  readonly stage: ExecutionStage;
  readonly prepared: LoadedPublicationPayload;
}
async function verifyStage(
  context: StageContext,
  recovered: boolean
): Promise<PublicationAdvanceResult> {
  const { runDirectory, adapter, loaded, stage, prepared } = context;
  const actual = await capturePublicationActual(
    adapter,
    loaded.manifest,
    stage.assertions,
    runDirectory
  );
  await retainPublicationCapture(runDirectory, `publication_actual_${stage.id}.json`, actual);
  const updated = recordPublicationStageReadback({
    manifest: loaded.manifest,
    observations: loaded.observations,
    stageId: stage.id,
    appliedPayload: prepared.payload,
    actual,
  });
  await writePrivateJson(path.join(runDirectory, 'publication_stage_readbacks.json'), updated);
  return {
    stageId: stage.id,
    ...(recovered ? { recoveredFromReadback: true as const } : {}),
    verifiedAssertions: actual.assertions.length,
  };
}
async function executeStage(context: StageContext): Promise<PublicationAdvanceResult> {
  const {
    runDirectory,
    adapter,
    loaded,
    stage,
    prepared: { calls },
  } = context;
  await concurrency(adapter, loaded);
  const file = localArtifactPath(runDirectory, `publication_execution_${stage.id}.json`);
  const journal = await loadExecutionJournal(file, loaded.manifest, stage.id, calls);
  // An uncertain append is never repeated. Only complete stage readback can advance it.
  if (journal.inFlight !== null) return verifyStage(context, true);
  for (let index = journal.appliedCalls.length; index < calls.length; index++) {
    await concurrency(adapter, loaded);
    const current = await loadPublication(runDirectory);
    check(
      current.manifest.planHash === loaded.manifest.planHash &&
        sha256Json(current.observations) === sha256Json(loaded.observations),
      'Prepared publication state changed during execution'
    );
    const call = calls.at(index);
    if (call === undefined) throw new Error('Prepared publication call is missing');
    journal.inFlight = index;
    await writePrivateJson(file, journal);
    const response = await adapter.apply({
      spreadsheetId: loaded.manifest.spreadsheetId,
      stageId: stage.id,
      callIndex: index,
      payload: structuredClone(call.payload),
    });
    check(
      response?.ok === true && response.spreadsheetId === loaded.manifest.spreadsheetId,
      'Publication call outcome is uncertain; inspect live readback before recovery'
    );
    journal.appliedCalls.push(sha256Json(call.payload));
    journal.inFlight = null;
    await writePrivateJson(file, journal);
  }
  return verifyStage(context, false);
}
export async function advancePublication(input: {
  readonly runDir: string;
  readonly authority?: PublicationAuthority | null;
  readonly adapter: PublicationWriteAdapter;
}): Promise<PublicationAdvanceResult> {
  const runDirectory = await privateDirectory(input.runDir);
  return withCacheLock(runDirectory, async () => {
    const loaded = await loadPublication(runDirectory);
    authorize(loaded, input.authority);
    check(
      (await optionalPrivateJson(path.join(runDirectory, FINAL_RECEIPT))) === undefined,
      'Published run cannot be written again'
    );
    const { adapter } = input;
    check(
      adapter.capabilities?.exactPreparedWrites === true &&
        adapter.capabilities.liveFilters === true &&
        adapter.capabilities.userEnteredValues === true &&
        adapter.capabilities.formats === true,
      'Publication connector lacks mandatory write/readback capabilities'
    );
    const next = nextPublicationStage(loaded.manifest, loaded.observations);
    if (next.complete) return { stagesComplete: true, finalReadbackRequired: true };
    if (next.stage === undefined) throw new Error('Publication next stage is missing');
    const prepared = loaded.payloads.get(next.stage.id);
    if (prepared === undefined) throw new Error('Prepared publication stage is missing');
    return executeStage({ runDirectory, adapter, loaded, stage: next.stage, prepared });
  });
}
export async function finalizePublication(input: {
  readonly runDir: string;
  readonly adapter: PublicationReadAdapter;
  readonly settleMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<unknown>;
}): Promise<{ readonly published: true; readonly verifiedAssertions: number }> {
  const { adapter, settleMs = 1000, sleep = delay } = input;
  check(
    Number.isInteger(settleMs) && settleMs >= 1000 && settleMs <= 30_000,
    'Invalid bounded final-readback interval'
  );
  const runDirectory = await privateDirectory(input.runDir);
  return withCacheLock(runDirectory, async () => {
    const { manifest, observations } = await loadPublication(runDirectory);
    check(
      (await optionalPrivateJson(path.join(runDirectory, FINAL_RECEIPT))) === undefined,
      'Published final receipt is immutable; use a separate read-only audit'
    );
    const status = evaluatePublicationReadback(manifest, observations);
    check(status.complete, 'Every publication stage must verify before final capture');
    const first = await capturePublicationActual(
      adapter,
      manifest,
      manifest.finalAssertions,
      runDirectory
    );
    await retainPublicationCapture(runDirectory, 'publication_final_first.json', first);
    verifyFinalPublicationActual(manifest, first);
    await sleep(settleMs);
    const final = await capturePublicationActual(
      adapter,
      manifest,
      manifest.finalAssertions,
      runDirectory
    );
    await retainPublicationCapture(runDirectory, 'publication_final_actual.json', final);
    const finalReadback = verifyFinalPublicationActual(manifest, final);
    const receipt = {
      ...status,
      verifiedAt: new Date().toISOString(),
      finalReadback,
      quiescentReadback: { samples: 2, intervalMs: settleMs, firstHash: sha256Json(first) },
    };
    await writePrivateJson(path.join(runDirectory, FINAL_RECEIPT), receipt);
    return { published: true, verifiedAssertions: finalReadback.assertions.length };
  });
}
