import { requireContract as check } from './connector-checkpoint.js';
import type { PublicationCohortChanges } from './publication-gate-types.js';

function arrayValue(value: unknown): boolean {
  return Array.isArray(value);
}

export interface PostCutoffRecord {
  readonly Id: string;
  readonly LastModifiedDate: string;
  readonly StageName?: string | null | undefined;
  readonly On_Hold__c?: boolean | null | undefined;
}
export interface PostCutoffDisposition {
  readonly schemaVersion: 1;
  readonly runCutoff: string;
  readonly disposition: 'defer-to-next-run';
  readonly nextRunRequired: true;
  readonly salesforceReadOnly: true;
  readonly checkedAt: string;
  readonly records: {
    readonly opportunityId: string;
    readonly observedModifiedAt: string;
    readonly stage: string | null;
    readonly onHold: boolean | null;
  }[];
}
export function postCutoffDisposition(
  {
    runCutoff,
    changes,
    records,
    checkedAt,
    salesforceReadOnly,
  }: {
    readonly runCutoff: string;
    readonly changes: PublicationCohortChanges;
    readonly records: readonly PostCutoffRecord[];
    readonly checkedAt: string;
    readonly salesforceReadOnly: unknown;
  },
  now: () => number = Date.now
): PostCutoffDisposition {
  const ids = [
    ...new Set(
      [changes.added, changes.removed, changes.stage, changes.onHold, changes.currentSla].flatMap(
        (values) => (values ?? []).map((row) => (typeof row === 'string' ? row : row?.id))
      )
    ),
  ].sort();
  check(
    ids.length > 0 &&
      ids.every(Boolean) &&
      arrayValue(records) &&
      records.length === ids.length &&
      new Set(records.map((row) => row.Id)).size === ids.length &&
      salesforceReadOnly === true &&
      Date.parse(checkedAt) >= Date.parse(runCutoff) &&
      Date.parse(checkedAt) <= now() &&
      ids.every((id) => records.some((row) => row.Id === id)),
    'Incomplete post-cutoff reconciliation'
  );
  check(
    records.every(
      (row) =>
        Date.parse(row.LastModifiedDate) > Date.parse(runCutoff) &&
        Date.parse(row.LastModifiedDate) <= Date.parse(checkedAt)
    ),
    'Unverifiable or pre-cutoff material change'
  );
  return {
    schemaVersion: 1,
    runCutoff,
    disposition: 'defer-to-next-run',
    nextRunRequired: true,
    salesforceReadOnly: true,
    checkedAt,
    records: records.map((row) => ({
      opportunityId: row.Id,
      observedModifiedAt: row.LastModifiedDate,
      stage: row.StageName ?? null,
      onHold: row.On_Hold__c ?? null,
    })),
  };
}
