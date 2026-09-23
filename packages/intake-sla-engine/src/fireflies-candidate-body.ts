import { transcriptMetadata } from '@headstart-health/fireflies-data';
import type { CompleteFirefliesTranscript } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import { requireBounded } from './fireflies-bounded-contract.js';
import type { FirefliesCandidateManifest } from './fireflies-bounded-contract.js';
import { cacheTimestamp } from './fireflies-cache-contract.js';
import { normalizeCacheTranscript } from './fireflies-cache-transcript.js';
import { sha256Json } from './json-fingerprint.js';

export function validateCandidateBody(
  manifest: FirefliesCandidateManifest,
  input: unknown,
  completedAt = new Date().toISOString()
): CompleteFirefliesTranscript {
  const record = normalizeCacheTranscript(input);
  const candidate = manifest.meetings.find(
    (meeting) => meeting.transcriptId === record.transcriptId
  );
  requireBounded(
    candidate?.metadataHash === sha256Json(transcriptMetadata(record)),
    'Body identity or metadata does not match the candidate manifest'
  );
  requireBounded(
    cacheTimestamp(record.retrievedAt) >= cacheTimestamp(manifest.retrievalNotBefore) &&
      cacheTimestamp(record.retrievedAt) <= cacheTimestamp(completedAt),
    'Body retrieval is not bound to this current collection'
  );
  return record;
}
export function verifyCandidateInventory(
  manifest: FirefliesCandidateManifest,
  records: readonly unknown[]
): true {
  const parsed = z.array(z.looseObject({ transcriptId: z.string() })).safeParse(records);
  requireBounded(
    parsed.success &&
      records.length === manifest.meetings.length &&
      new Set(parsed.data.map((record) => record.transcriptId)).size === records.length,
    'Candidate inventory is incomplete, duplicated, or contains unexpected bodies'
  );
  const validated = records.map((record) => validateCandidateBody(manifest, record));
  for (const proof of manifest.fallbackSkips)
    requireBounded(
      proof.usableMeetingIds.every((id) =>
        validated.some(
          (record) =>
            record.transcriptId === id &&
            record.fullTranscript.trim().length > 0 &&
            !record.transcriptEmpty
        )
      ),
      'Skipped fallback depended on a silent or unavailable transcript; collect the required fallback'
    );
  return true;
}
