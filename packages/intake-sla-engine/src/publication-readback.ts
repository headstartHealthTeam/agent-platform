import { sha256Json } from './json-fingerprint.js';
import { actualHashForPublicationAssertion } from './publication-actual-hash.js';
import { publicationPlanHash } from './publication-plan.js';
import type {
  PublicationActual,
  PublicationManifest,
  PublicationObservations,
  PublicationReadback,
  PublicationStage,
  PublicationStageObservation,
  PublicationStageStatus,
  VerifiedPublicationAssertion,
} from './publication-readback-types.js';

export const PUBLICATION_READBACK_VERSION = 1;
function observedList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
function observedAssertion(value: unknown): [unknown, unknown] {
  if (value === undefined || value === null) throw new TypeError('Invalid observed assertion');
  if (typeof value !== 'object' && typeof value !== 'function') return [undefined, undefined];
  const id: unknown = Reflect.get(value, 'id');
  const hash: unknown = Reflect.get(value, 'actualHash');
  return [id, hash];
}
function hasEvidenceHash(value: unknown): boolean {
  return /^[a-f0-9]{64}$/.test(String(value));
}
function observedStage(
  expected: PublicationStage,
  observed: PublicationStageObservation
): PublicationStageStatus {
  if (observed.payloadHash !== expected.payloadHash)
    throw new Error(`Publication payload hash mismatch for ${expected.id}`);
  if (observed.captureVersion !== 1 || !hasEvidenceHash(observed.evidenceHash))
    throw new Error(
      `Publication readback for ${expected.id} was not produced from captured live evidence`
    );
  const assertions = observed.assertions ?? [];
  if (!observedList(assertions)) throw new TypeError('Invalid observed assertions');
  const actual = new Map(assertions.map(observedAssertion));
  const mismatches = (expected.assertions ?? []).filter(
    (assertion) => actual.get(assertion.id) !== assertion.expectedHash
  );
  if (mismatches.length > 0)
    throw new Error(
      `Publication readback mismatch for ${expected.id}: ${mismatches.map((item) => item.id).join(', ')}`
    );
  return {
    id: expected.id,
    verified: true,
    verifiedAt: observed.verifiedAt ?? null,
    source: 'stage-readback',
  };
}
function observationMap(
  manifest: PublicationManifest,
  observations: PublicationObservations
): Map<string, PublicationStageObservation> {
  if (manifest.spreadsheetId !== observations.spreadsheetId)
    throw new Error('Publication readback targets a different spreadsheet');
  if (manifest.runId !== observations.runId)
    throw new Error('Publication readback targets a different run');
  if (manifest.planHash !== publicationPlanHash(manifest.stages, manifest.finalAssertions))
    throw new Error('Publication manifest plan hash is missing or invalid');
  if (observations.planHash !== manifest.planHash)
    throw new Error('Publication readback targets a different prepared plan');
  const byStage = new Map((observations.stages ?? []).map((stage) => [stage.id, stage]));
  if (byStage.size !== (observations.stages ?? []).length)
    throw new Error('Publication readback contains duplicate stage observations');
  const expected = new Set(manifest.stages.map((stage) => stage.id));
  const unknown = [...byStage.keys()].filter((id) => !expected.has(id));
  if (unknown.length > 0)
    throw new Error(`Publication readback contains unknown stages: ${unknown.join(', ')}`);
  return byStage;
}
export function evaluatePublicationReadback(
  manifest: PublicationManifest,
  observations: PublicationObservations = {}
): PublicationReadback {
  const byStage = observationMap(manifest, observations);
  const stages: PublicationStageStatus[] = [];
  let incomplete = false;
  for (const expected of manifest.stages) {
    const observed = byStage.get(expected.id);
    if (incomplete && observed !== undefined)
      throw new Error(`Publication readback is out of order at ${expected.id}`);
    const alreadySatisfied = Boolean(expected.alreadySatisfied);
    if (alreadySatisfied) {
      stages.push({ id: expected.id, verified: true, source: 'current-state' });
      continue;
    }
    if (observed === undefined) {
      incomplete = true;
      stages.push({ id: expected.id, verified: false, reason: 'not-applied-or-not-read-back' });
      continue;
    }
    stages.push(observedStage(expected, observed));
  }
  const complete = stages.every((stage) => stage.verified);
  return {
    schemaVersion: PUBLICATION_READBACK_VERSION,
    runId: manifest.runId,
    spreadsheetId: manifest.spreadsheetId,
    planHash: manifest.planHash,
    publicationStatus: complete ? 'Published' : 'In Progress',
    complete,
    stages,
    nextStage: complete ? null : (stages.find((stage) => !stage.verified)?.id ?? null),
  };
}
export function nextPublicationStage<T extends PublicationStage>(
  manifest: Omit<PublicationManifest, 'stages'> & { readonly stages: readonly T[] },
  observations: PublicationObservations = {}
): { complete: true; stage: null } | { complete: false; stage: T | undefined } {
  const status = evaluatePublicationReadback(manifest, observations);
  if (status.complete) return { complete: true, stage: null };
  return {
    complete: false,
    stage: manifest.stages.find((candidate) => candidate.id === status.nextStage),
  };
}
export function verifyPublicationStageActual(
  stage: Pick<PublicationStage, 'assertions'>,
  actual: PublicationActual = {}
): VerifiedPublicationAssertion[] {
  const byId = new Map((actual.assertions ?? []).map((assertion) => [assertion.id, assertion]));
  if (byId.size !== (actual.assertions ?? []).length)
    throw new Error('Actual stage readback contains duplicate assertion IDs');
  const assertions = (stage.assertions ?? []).map((expected) => {
    const captured = byId.get(expected.id);
    if (captured === undefined) throw new Error(`Actual stage readback is missing ${expected.id}`);
    const actualHash = actualHashForPublicationAssertion(expected, captured);
    if (actualHash !== expected.expectedHash)
      throw new Error(`Actual live readback does not match ${expected.id}`);
    return { id: expected.id, actualHash };
  });
  const ids = new Set((stage.assertions ?? []).map((item) => item.id));
  const extra = [...byId.keys()].filter((id) => !ids.has(id));
  if (extra.length > 0)
    throw new Error(`Actual stage readback contains unknown assertions: ${extra.join(', ')}`);
  return assertions;
}
export function verifyFinalPublicationActual(
  manifest: PublicationManifest,
  actual: PublicationActual = {}
): {
  captureVersion: 1;
  evidenceHash: string;
  assertions: VerifiedPublicationAssertion[];
} {
  if (actual.runId !== manifest.runId || actual.spreadsheetId !== manifest.spreadsheetId)
    throw new Error('Final publication readback targets a different run or spreadsheet');
  if ((manifest.finalAssertions ?? []).length === 0)
    throw new Error('Publication manifest has no final-state assertion contract');
  const finalAssertions = manifest.finalAssertions ?? [];
  const ids = finalAssertions.map((assertion) => assertion.id);
  if (new Set(ids).size !== ids.length)
    throw new Error('Publication manifest contains duplicate final-state assertions');
  const assertions = verifyPublicationStageActual({ assertions: finalAssertions }, actual);
  return {
    captureVersion: PUBLICATION_READBACK_VERSION,
    evidenceHash: sha256Json(actual),
    assertions,
  };
}
export function recordPublicationStageReadback({
  manifest,
  observations,
  stageId,
  appliedPayload,
  actual,
  verifiedAt = new Date().toISOString(),
}: {
  readonly manifest: PublicationManifest;
  readonly observations: PublicationObservations;
  readonly stageId: string;
  readonly appliedPayload: unknown;
  readonly actual: PublicationActual;
  readonly verifiedAt?: string;
}): PublicationObservations & { readonly stages: PublicationStageObservation[] } {
  const next = nextPublicationStage(manifest, observations);
  if (next.complete) throw new Error('Publication readback is already complete');
  if (next.stage === undefined) throw new Error('Publication next stage is missing');
  if (next.stage.id !== stageId)
    throw new Error(`Expected readback for ${next.stage.id}, not ${stageId}`);
  const payloadHash = sha256Json(appliedPayload);
  if (payloadHash !== next.stage.payloadHash)
    throw new Error(`Applied publication payload does not match ${stageId}`);
  const assertions = verifyPublicationStageActual(next.stage, actual);
  const updated = {
    schemaVersion: PUBLICATION_READBACK_VERSION,
    runId: manifest.runId,
    spreadsheetId: manifest.spreadsheetId,
    planHash: manifest.planHash,
    stages: [
      ...(observations.stages ?? []),
      {
        id: stageId,
        payloadHash,
        verifiedAt,
        captureVersion: PUBLICATION_READBACK_VERSION,
        evidenceHash: sha256Json(actual),
        assertions,
      },
    ],
  };
  evaluatePublicationReadback(manifest, updated);
  return updated;
}
