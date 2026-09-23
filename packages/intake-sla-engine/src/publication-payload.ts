import { sha256Json } from './json-fingerprint.js';
import type {
  PublicationGateBinding,
  PublicationLoadedCall,
  PublicationManifest,
  PublicationPayload,
  PublicationStage,
} from './publication-readback-types.js';

export function assertPublicationStagePayload(
  stage: PublicationStage,
  stagePayload: PublicationPayload,
  callPayloads: readonly PublicationLoadedCall[] = []
): true {
  if (sha256Json(stagePayload) !== stage.payloadHash)
    throw new Error(`Prepared stage payload hash changed for ${stage.id}`);
  if (callPayloads.length !== (stage.calls ?? []).length)
    throw new Error(`Prepared call count changed for ${stage.id}`);
  const requests: unknown[] = [];
  for (const [index, loaded] of callPayloads.entries()) {
    const expected = stage.calls?.at(index);
    if (
      expected === undefined ||
      loaded.file !== expected.file ||
      sha256Json(loaded.payload) !== expected.payloadHash
    )
      throw new Error(`Prepared call payload hash changed for ${String(expected?.file)}`);
    if (
      sha256Json({ ...loaded.payload, requests: [] }) !==
      sha256Json({ ...stagePayload, requests: [] })
    )
      throw new Error(`Prepared call controls changed for ${String(expected.file)}`);
    requests.push(...(loaded.payload.requests ?? []));
  }
  if (sha256Json({ ...stagePayload, requests }) !== stage.payloadHash)
    throw new Error(`Prepared calls do not reconstruct stage ${stage.id}`);
  return true;
}
/** This identity check remains usable for read-only recovery even when the write lease expires. */
export function assertPublicationGateBinding(
  manifest: Pick<PublicationManifest, 'runId' | 'spreadsheetId' | 'planHash'>,
  gate?: PublicationGateBinding | null
): true {
  if (gate?.passed !== true) throw new Error('Publication gate has not passed');
  if (gate.runId !== manifest.runId) throw new Error('Publication gate targets a different run');
  if (gate.spreadsheetId !== manifest.spreadsheetId)
    throw new Error('Publication gate targets a different spreadsheet');
  if (gate.planHash !== manifest.planHash)
    throw new Error('Publication gate targets a different prepared plan');
  return true;
}
