import type {
  GooglePreparedStage,
  GooglePublicationRequest,
  GooglePublicationPayload,
} from './google-publication-types.js';
import { publicationPayload, publicationPayloadBytes } from './google-publication-values.js';
import { sha256Json } from './json-fingerprint.js';
import type { PublicationAssertion } from './publication-readback-types.js';

export function publicationStage(
  id: string,
  requests: readonly GooglePublicationRequest[],
  assertions: readonly PublicationAssertion[],
  options: { readonly dependsOn?: string | null; readonly terminal?: boolean } = {}
): GooglePreparedStage {
  const payload = publicationPayload(requests);
  return {
    id,
    dependsOn: options.dependsOn ?? null,
    terminal: Boolean(options.terminal),
    alreadySatisfied: requests.length === 0,
    payload,
    payloadHash: sha256Json(payload),
    assertions,
  };
}
export interface GooglePublicationCall {
  readonly call: number;
  readonly payload: GooglePublicationPayload;
  readonly payloadHash: string;
}
export function splitStageCalls(
  stage: Pick<GooglePreparedStage, 'id' | 'payload'>,
  maxBytes = 100_000
): GooglePublicationCall[] {
  const calls: GooglePublicationRequest[][] = [];
  let requests: GooglePublicationRequest[] = [];
  for (const request of stage.payload.requests) {
    const candidate = [...requests, request];
    const bytes = publicationPayloadBytes(candidate);
    if (requests.length === 0 && bytes > maxBytes)
      throw new Error(`Publication request in ${stage.id} exceeds the bounded call size`);
    if (requests.length > 0 && bytes > maxBytes) {
      calls.push(requests);
      requests = [request];
    } else requests = candidate;
  }
  if (requests.length > 0) calls.push(requests);
  return calls.map((callRequests, index) => {
    const payload = publicationPayload(callRequests);
    return { call: index + 1, payload, payloadHash: sha256Json(payload) };
  });
}
