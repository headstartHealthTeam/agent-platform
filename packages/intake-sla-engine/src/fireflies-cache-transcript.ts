import { normalizeCompleteFirefliesTranscript } from '@headstart-health/fireflies-data';
import type { CompleteFirefliesTranscript } from '@headstart-health/fireflies-data';

import { FirefliesCacheError } from './fireflies-cache-contract.js';

/** Keep the Intake command failure category while shared code owns provider normalization. */
export function normalizeCacheTranscript(input: unknown): CompleteFirefliesTranscript {
  try {
    return normalizeCompleteFirefliesTranscript(input);
  } catch {
    throw new FirefliesCacheError(
      'CACHE_VALIDATION_FAILED',
      'A complete processed transcript or explicit empty confirmation is required'
    );
  }
}
