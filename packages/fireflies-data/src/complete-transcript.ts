import { z } from 'zod';

import { FirefliesBodyError, retrievalEndpointSchema, transcriptMetadata } from './transcript.js';
import type { TranscriptMetadata } from './transcript.js';

const bodySchema = z.object({
  complete: z.literal(true),
  fullTranscript: z.string(),
  transcriptEmpty: z.unknown().optional(),
  retrievalEndpoint: retrievalEndpointSchema,
  retrievedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
});
export interface CompleteFirefliesTranscript extends TranscriptMetadata {
  readonly complete: true;
  readonly fullTranscript: string;
  readonly transcriptEmpty: boolean;
  readonly retrievalEndpoint: z.infer<typeof retrievalEndpointSchema>;
  readonly retrievedAt: string;
}
/** Normalize complete provider content; no cache age, run binding or source eligibility decision. */
export function normalizeCompleteFirefliesTranscript(value: unknown): CompleteFirefliesTranscript {
  try {
    const metadata = transcriptMetadata(value);
    const body = bodySchema.parse(value);
    const validEmpty = body.fullTranscript.trim()
      ? body.transcriptEmpty !== true
      : body.transcriptEmpty === true;
    if (metadata.isLive || !validEmpty) throw new FirefliesBodyError();
    return {
      ...metadata,
      complete: true,
      fullTranscript: body.fullTranscript,
      transcriptEmpty: body.transcriptEmpty === true,
      retrievalEndpoint: body.retrievalEndpoint,
      retrievedAt: new Date(body.retrievedAt).toISOString(),
    };
  } catch {
    throw new FirefliesBodyError();
  }
}
