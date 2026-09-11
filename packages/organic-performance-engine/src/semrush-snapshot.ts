import { z } from 'zod';

import type { OrganicPerformanceBundle } from './schemas.js';

/** Extraction time does not establish the effective date of a keyword snapshot. */
export function keywordSnapshotDate(
  semrush: OrganicPerformanceBundle['sources']['semrush']
): string | null {
  const value = semrush?.metadata['keywordSnapshotDate'];
  return value === undefined ? null : z.iso.date().parse(value);
}
