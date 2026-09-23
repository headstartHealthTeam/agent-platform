import { publicationTimestamp } from './publication-freshness.js';
import type {
  PublicationGateCheck,
  PublicationRunManifest,
  PublicationCohortRefresh,
  PublicationCohortDisposition,
  PublicationCohortChanges,
} from './publication-gate-types.js';

function materialIds(changes: PublicationCohortChanges = {}): (string | null | undefined)[] {
  const fields = [
    changes.added,
    changes.removed,
    changes.stage,
    changes.onHold,
    changes.currentSla,
  ];
  return [
    ...new Set(
      fields.flatMap((field) =>
        (field ?? []).map((value) => (typeof value === 'string' ? value : value?.id))
      )
    ),
  ]
    .filter(Boolean)
    .sort();
}
export function evaluatePublicationCohort(
  check: PublicationGateCheck,
  runManifest: PublicationRunManifest,
  cohortRefresh: PublicationCohortRefresh
): PublicationCohortDisposition {
  if (cohortRefresh.material === false) {
    check(
      'cohort-count',
      cohortRefresh.liveCount === runManifest.expectedRows,
      'Refreshed Salesforce cohort count differs from the workbook'
    );
    return {
      mode: 'stable-live-cohort',
      sourceCutoff: runManifest.startedAt,
      liveCount: cohortRefresh.liveCount,
      deferredChangeCount: 0,
    };
  }
  check(
    'cohort-material-classified',
    cohortRefresh.material === true,
    'Salesforce cohort material-change state is invalid'
  );
  const disposition = cohortRefresh.postCutoffDisposition;
  check(
    'cohort-post-cutoff-disposition',
    disposition?.schemaVersion === 1 && disposition.disposition === 'defer-to-next-run',
    'Material Salesforce cohort change lacks a valid post-cutoff disposition'
  );
  check(
    'cohort-snapshot-cutoff',
    Boolean(runManifest.startedAt) && disposition.runCutoff === runManifest.startedAt,
    'Post-cutoff cohort disposition does not match the frozen run cutoff'
  );
  check(
    'cohort-read-only-verification',
    disposition.salesforceReadOnly === true,
    'Post-cutoff cohort disposition was not verified read-only'
  );
  const ids = materialIds(cohortRefresh.changes);
  const records = disposition.records ?? [];
  const dispositionIds = records.map((record) => record.opportunityId).sort();
  check(
    'cohort-post-cutoff-completeness',
    ids.length > 0 &&
      records.length === ids.length &&
      new Set(dispositionIds).size === records.length &&
      JSON.stringify(dispositionIds) === JSON.stringify(ids),
    'Post-cutoff cohort disposition does not cover every material record exactly once'
  );
  const cutoff = publicationTimestamp(runManifest.startedAt, 'Frozen run cutoff');
  check(
    'cohort-post-cutoff-timestamps',
    records.every(
      (record) =>
        publicationTimestamp(record.observedModifiedAt, 'Material cohort change timestamp') > cutoff
    ),
    'A material Salesforce cohort change occurred at or before the frozen run cutoff'
  );
  check(
    'cohort-delta-deferred',
    disposition.nextRunRequired === true,
    'Post-cutoff Salesforce changes were not retained for the next run'
  );
  return {
    mode: 'frozen-snapshot-with-post-cutoff-delta',
    sourceCutoff: runManifest.startedAt,
    liveCount: cohortRefresh.liveCount,
    deferredChangeCount: records.length,
  };
}
