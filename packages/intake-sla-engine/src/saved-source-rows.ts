import { z } from 'zod';

import {
  preserveCollectionRecord,
  type StructuredCollectionArtifacts,
} from './collection-decoding.js';
import { normalizeRosterValue } from './roster-matching.js';

const rowSchema = z.looseObject({
  opportunityId: z.string().nullish(),
  opportunityName: z.string().nullish(),
});
/** Only the loader's identity fields are consumed here; adapters own payload decoding. */
export type SavedSourceRow = z.infer<typeof rowSchema>;
export interface SavedSourceIdentity {
  readonly opportunityId: string;
  readonly opportunityName: string;
}
export async function savedSourceJson(
  artifacts: Pick<StructuredCollectionArtifacts, 'read'>,
  name: string,
  fallback: unknown = null
): Promise<unknown> {
  const raw = await artifacts.read(name);
  return raw === undefined ? fallback : raw;
}
export async function loadSavedSourceRows(
  artifacts: Pick<StructuredCollectionArtifacts, 'read'>,
  name: string,
  profiles: readonly SavedSourceIdentity[] | null = null
): Promise<{
  readonly rows: readonly SavedSourceRow[];
  readonly byOpportunity: Map<string, SavedSourceRow>;
}> {
  const raw = await artifacts.read(name);
  const rows = z.array(preserveCollectionRecord(rowSchema)).parse(Array.isArray(raw) ? raw : []);
  const idsByName = new Map<string, string[]>();
  for (const profile of profiles ?? []) {
    const nameKey = normalizeRosterValue(profile.opportunityName);
    const ids = idsByName.get(nameKey) ?? [];
    ids.push(profile.opportunityId);
    idsByName.set(nameKey, ids);
  }
  const byOpportunity = new Map<string, SavedSourceRow>();
  for (const row of rows) {
    const hasId = Boolean(row.opportunityId);
    let key = hasId ? row.opportunityId : row.opportunityName;
    if (profiles && !row.opportunityId) {
      const ids = idsByName.get(normalizeRosterValue(row.opportunityName)) ?? [];
      key = ids.length === 1 ? ids[0] : null;
    }
    if (key) byOpportunity.set(key, row);
  }
  return { rows, byOpportunity };
}
