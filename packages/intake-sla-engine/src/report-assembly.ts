import type { DelayHistoryReceipt } from './delay-history-types.js';
import { generationLedgerRows, type GenerationLedgerProjection } from './generation-ledger.js';
import { sha256Json } from './json-fingerprint.js';
import type { NoteAdjudicationReceipt } from './note-adjudication-types.js';
import {
  REPORT_EVIDENCE_HEADERS,
  REPORT_HISTORY_HEADERS,
  REPORT_HOLD_HEADERS,
  REPORT_HOLD_INSERT_INDEX,
  REPORT_QUEUE_HEADERS,
} from './report-vocabulary.js';
import type { SourceOutcome } from './source-outcome.js';

/** The report producer supplies these columns; later columns include raw reviewer values. */
export type ReportMainRow = readonly [
  name: string,
  salesforce: string,
  practice: string,
  provider: string,
  owner: string,
  stage: string,
  daysBreached: number,
  blocker: string | null | undefined,
  freshness: string,
  latestDate: string,
  ...remaining: unknown[],
];
export interface ReportQueueEntry<Evidence = unknown> {
  readonly main: ReportMainRow;
  readonly evidence: readonly unknown[];
  readonly normalizedEvidence: readonly Evidence[];
  readonly onHold: boolean;
  readonly holdFields: readonly [reason: string, start: string, days: number | '', restart: string];
}
export type ReportSourceCountRow = Pick<SourceOutcome, 'source' | 'status'>;
export interface ReportAssemblyInput<Evidence = unknown> {
  readonly runId: string;
  readonly runAt: Date;
  readonly runAtEastern: string;
  readonly expectedRows: number;
  readonly entries: readonly ReportQueueEntry<Evidence>[];
  readonly sourceStatusRecords: readonly ReportSourceCountRow[];
  readonly combinedGenerationLedgerRows: readonly GenerationLedgerProjection[];
  readonly delayHistoryRows: readonly DelayHistoryReceipt[];
  readonly noteAdjudications: {
    readonly inputHash: string;
    readonly receipts: readonly NoteAdjudicationReceipt[];
  };
  /** Already loaded using the approved header check and 99-row bound. */
  readonly priorRunHistoryRows: readonly (readonly unknown[])[];
}
export interface ReportRunManifest {
  readonly runId: string;
  readonly startedAt: string;
  readonly expectedRows: number;
  readonly expectedActiveRows: number;
  readonly expectedOnHoldRows: number;
  readonly processedRows: number;
  readonly blockedRows: number;
  readonly sourceCounts: Readonly<Record<string, string>>;
  readonly publishStatus: 'Built - Pending Publish';
  readonly delayHistory: {
    readonly version: 1;
    readonly rows: number;
    readonly artifactHash: string;
  };
  readonly noteAdjudications: {
    readonly inputHash: string;
    readonly receiptsHash: string;
    readonly accepted: number;
  };
}
export interface ReportAssembly<Evidence = unknown> {
  readonly entries: readonly ReportQueueEntry<Evidence>[];
  readonly rows: readonly (readonly unknown[])[];
  readonly onHoldRows: readonly (readonly unknown[])[];
  readonly evidenceRows: readonly (readonly unknown[])[];
  readonly ledgerRows: readonly (readonly unknown[])[];
  readonly runHistoryRows: readonly (readonly unknown[])[];
  readonly runManifest: ReportRunManifest;
}

const FRESHNESS_RANK: ReadonlyMap<string, number> = new Map([
  ['Missing', 0],
  ['Stale', 1],
  ['Semi-Stale', 2],
  ['Current', 3],
]);
function compareRows(a: ReportQueueEntry, b: ReportQueueEntry): number {
  const rank = (FRESHNESS_RANK.get(a.main[8]) ?? 3) - (FRESHNESS_RANK.get(b.main[8]) ?? 3);
  if (rank) return rank;
  const dateDifference = new Date(a.main[9] || 0).getTime() - new Date(b.main[9] || 0).getTime();
  return dateDifference || a.main[0].localeCompare(b.main[0]);
}
function sourceSummary(rows: readonly ReportSourceCountRow[], includeUnsupported = false): string {
  const count = (status: string): number => rows.filter((row) => row.status === status).length;
  const text = `Found ${String(count('Found'))}; Not Found ${String(count('Searched - Not Found'))}; Blocked ${String(count('Blocked'))}; Timed Out ${String(count('Timed Out'))}`;
  return includeUnsupported ? `${text}; Unsupported ${String(count('Unsupported'))}` : text;
}
function historyRow(
  input: ReportAssemblyInput,
  manifest: ReportRunManifest,
  sourceNames: readonly string[]
): readonly unknown[] {
  const { sourceStatusRecords: sources } = input;
  const summary = (source: string): string =>
    sourceSummary(sources.filter((row) => row.source === source));
  const salesforceNames = sourceNames.filter((source) =>
    /Salesforce|Authorization|VOB|Clinical|RBT|Ticket|Talent|Staffing|SLA \/ Intake/.test(source)
  );
  return [
    input.runId,
    input.runAtEastern,
    manifest.expectedActiveRows,
    manifest.expectedOnHoldRows,
    manifest.processedRows,
    manifest.blockedRows,
    sourceSummary(
      sources.filter((row) => salesforceNames.includes(row.source)),
      true
    ),
    summary('Portal'),
    summary('Fireflies'),
    summary('Linked Billing / Claims'),
    ['Slack', 'Gmail', 'Linked Files'].map((source) => `${source}: ${summary(source)}`).join(' | '),
    'Built - Pending Publish',
  ];
}

/** Frozen report assembly only. Publication and live concurrency checks remain separate. */
export function assembleReport<Evidence>(
  input: ReportAssemblyInput<Evidence>
): ReportAssembly<Evidence> {
  const entries = [...input.entries].sort(compareRows);
  const active = entries.filter((entry) => !entry.onHold);
  const held = entries.filter((entry) => entry.onHold);
  const sourceNames = [...new Set(input.sourceStatusRecords.map((row) => row.source))];
  const runManifest: ReportRunManifest = {
    runId: input.runId,
    startedAt: input.runAt.toISOString(),
    expectedRows: input.expectedRows,
    expectedActiveRows: active.length,
    expectedOnHoldRows: held.length,
    processedRows: entries.length,
    blockedRows: entries.filter(
      (entry) => entry.main[REPORT_QUEUE_HEADERS.indexOf('Ready to Copy')] === 'Blocked'
    ).length,
    sourceCounts: Object.fromEntries(
      sourceNames.map((source) => [
        source,
        sourceSummary(input.sourceStatusRecords.filter((row) => row.source === source)),
      ])
    ),
    publishStatus: 'Built - Pending Publish',
    delayHistory: {
      version: 1,
      rows: input.delayHistoryRows.length,
      artifactHash: sha256Json(input.delayHistoryRows),
    },
    noteAdjudications: {
      inputHash: input.noteAdjudications.inputHash,
      receiptsHash: sha256Json(input.noteAdjudications.receipts),
      accepted: input.noteAdjudications.receipts.length,
    },
  };
  return {
    entries,
    rows: [REPORT_QUEUE_HEADERS, ...active.map((entry) => entry.main)],
    onHoldRows: [
      REPORT_HOLD_HEADERS,
      ...held.map((entry) => [
        ...entry.main.slice(0, REPORT_HOLD_INSERT_INDEX),
        ...entry.holdFields,
        ...entry.main.slice(REPORT_HOLD_INSERT_INDEX),
      ]),
    ],
    evidenceRows: [REPORT_EVIDENCE_HEADERS, ...entries.map((entry) => entry.evidence)],
    ledgerRows: generationLedgerRows(input.combinedGenerationLedgerRows),
    runHistoryRows: [
      REPORT_HISTORY_HEADERS,
      historyRow(input, runManifest, sourceNames),
      ...input.priorRunHistoryRows.filter((row) => row[0] !== input.runId),
    ],
    runManifest,
  };
}
