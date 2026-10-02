import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';

const OPPORTUNITIES = 'opportunity_rows.json';
export const STRUCTURED_CORRECTION_ARTIFACTS = [
  OPPORTUNITIES,
  'identity_profile_rows.json',
  'auth_rows.json',
  'authorization_review_rows.json',
  'vob_rows.json',
  'clinical_quality_rows.json',
  'rbt_rows.json',
  'staffing_rows.json',
  'billing_claim_records.json',
  'task_rows.json',
  'aircall_rows.json',
  'opportunity_history_rows.json',
  'contact_role_rows.json',
  'task_feed_rows.json',
  'ticket_match_rows.json',
  'first_interview_rows.json',
  'talent_acquisition_rows.json',
] as const;
export interface StructuredCorrectionRecord {
  readonly Id?: string | null | undefined;
  readonly opportunityId?: string | null | undefined;
}
export type StructuredCorrectionSnapshot = Readonly<
  Record<string, readonly StructuredCorrectionRecord[]>
>;
export interface StructuredCorrectionChange {
  readonly artifact: string;
  readonly recordId: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly opportunityIds: string[];
  readonly ownership: 'linked' | 'unresolved-all-cohort';
}
export interface StructuredCorrectionDelta {
  readonly version: 1;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly changes: StructuredCorrectionChange[];
  readonly affected: string[];
  readonly removed: string[];
  readonly unchanged: string[];
  readonly sourcePolicy: {
    readonly portal: 'fresh-current-run';
    readonly fireflies: 'fresh-discovery-and-candidate-bodies';
    readonly slack: 'refresh-unless-edit-and-deletion-complete-delta-proven';
    readonly interpretations: 'exact-api-binding-only';
    readonly qa: 'rebuild-all-current-rows';
  };
}
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(strings);
}
function indexRows(
  rows: readonly StructuredCorrectionRecord[]
): Map<string, StructuredCorrectionRecord> {
  const result = new Map<string, StructuredCorrectionRecord>();
  for (const row of rows) {
    const id = row.Id ?? row.opportunityId;
    check(
      typeof id === 'string' && Boolean(id) && !result.has(id),
      'Structured artifact has duplicate or unsupported identities'
    );
    result.set(id, row);
  }
  return result;
}
function linkOwners(row: StructuredCorrectionRecord, owners: Map<string, Set<string>>): boolean {
  const key = row.Id ?? row.opportunityId;
  if (!key) return false;
  const ids = owners.get(key) ?? new Set<string>();
  const count = ids.size;
  for (const reference of strings(row)) {
    for (const id of owners.get(reference) ?? []) ids.add(id);
  }
  owners.set(key, ids);
  return ids.size !== count;
}
function resolveOwners(
  cohort: ReadonlySet<string>,
  rows: readonly StructuredCorrectionRecord[]
): Map<string, Set<string>> {
  const owners = new Map([...cohort].map((id) => [id, new Set([id])]));
  // Both snapshots are necessary: a deleted or reassigned child still identifies its former owner.
  let passes = rows.length;
  while (passes-- > 0) {
    let changed = false;
    for (const row of rows) {
      if (linkOwners(row, owners)) changed = true;
    }
    if (!changed) break;
  }
  return owners;
}
function requiredRows(
  artifacts: ReadonlyMap<string, readonly StructuredCorrectionRecord[]>,
  name: string
): readonly StructuredCorrectionRecord[] {
  const rows = artifacts.get(name);
  check(
    rows !== undefined,
    'Every structured artifact must be explicitly supplied, including empty sources'
  );
  const isArray: boolean = Array.isArray(rows);
  check(isArray, 'Every structured artifact must be explicitly supplied, including empty sources');
  return rows;
}
function artifactChanges(
  name: string,
  before: readonly StructuredCorrectionRecord[],
  after: readonly StructuredCorrectionRecord[],
  owners: ReadonlyMap<string, ReadonlySet<string>>,
  cohort: ReadonlySet<string>
): StructuredCorrectionChange[] {
  const old = indexRows(before);
  const current = indexRows(after);
  const result: StructuredCorrectionChange[] = [];
  for (const id of new Set([...old.keys(), ...current.keys()])) {
    if (sha256Json(old.get(id) ?? null) === sha256Json(current.get(id) ?? null)) continue;
    const linked = owners.get(id);
    const scope = linked?.size ? [...linked] : [...cohort];
    result.push({
      artifact: name,
      recordId: id,
      kind: old.has(id) ? (current.has(id) ? 'changed' : 'removed') : 'added',
      opportunityIds: scope.sort(),
      ownership: linked?.size ? 'linked' : 'unresolved-all-cohort',
    });
  }
  return result;
}
export function structuredCorrectionDelta({
  before,
  after,
}: {
  readonly before: StructuredCorrectionSnapshot;
  readonly after: StructuredCorrectionSnapshot;
}): StructuredCorrectionDelta {
  const oldArtifacts = new Map(Object.entries(before));
  const newArtifacts = new Map(Object.entries(after));
  for (const name of STRUCTURED_CORRECTION_ARTIFACTS) {
    requiredRows(oldArtifacts, name);
    requiredRows(newArtifacts, name);
  }
  const oldOpportunities = requiredRows(oldArtifacts, OPPORTUNITIES);
  const newOpportunities = requiredRows(newArtifacts, OPPORTUNITIES);
  const cohort = new Set<string>();
  for (const row of [...oldOpportunities, ...newOpportunities]) {
    check(typeof row.Id === 'string', 'Structured cohort has missing identities');
    cohort.add(row.Id);
  }
  const owners = resolveOwners(cohort, [...Object.values(before), ...Object.values(after)].flat());
  const changes: StructuredCorrectionChange[] = [];
  const affected = new Set<string>();
  for (const name of STRUCTURED_CORRECTION_ARTIFACTS) {
    const found = artifactChanges(
      name,
      requiredRows(oldArtifacts, name),
      requiredRows(newArtifacts, name),
      owners,
      cohort
    );
    for (const change of found) {
      for (const id of change.opportunityIds) affected.add(id);
    }
    changes.push(...found);
  }
  const currentIds = new Set(indexRows(newOpportunities).keys());
  const oldIds = new Set(indexRows(oldOpportunities).keys());
  return {
    version: 1,
    beforeHash: sha256Json(before),
    afterHash: sha256Json(after),
    changes,
    affected: [...affected].filter((id) => currentIds.has(id)).sort(),
    removed: [...oldIds].filter((id) => !currentIds.has(id)).sort(),
    unchanged: [...currentIds].filter((id) => !affected.has(id)).sort(),
    sourcePolicy: {
      portal: 'fresh-current-run',
      fireflies: 'fresh-discovery-and-candidate-bodies',
      slack: 'refresh-unless-edit-and-deletion-complete-delta-proven',
      interpretations: 'exact-api-binding-only',
      qa: 'rebuild-all-current-rows',
    },
  };
}
