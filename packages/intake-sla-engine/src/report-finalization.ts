import path from 'node:path';

import type { ArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';
import { z } from 'zod';

import { renderCaseHistoryReview } from './case-history-review.js';
import type { ConversationSearchResult, SearchMatch } from './conversation-search-result.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import type { EvidenceEvent } from './evidence.js';
import {
  writeGenerationLedgerState,
  type GenerationLedgerBaseline,
} from './generation-ledger-storage.js';
import type { GenerationLedgerRow } from './generation-ledger.js';
import type { InterpreterConfig } from './interpretation-binding.js';
import type { NoteAdjudicator } from './note-adjudication-types.js';
import {
  atomicPrivateWrite,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
} from './private-run-storage.js';
import {
  assembleReport,
  type ReportAssembly,
  type ReportAssemblyInput,
} from './report-assembly.js';
import {
  buildReportMetadata,
  type ReportMetadataInput,
  type ReportMetadataInterpretation,
} from './report-metadata.js';
import type { ReportRecommendationSource } from './report-recommendation.js';
import { loadReportRunHistory } from './report-saved-state.js';
import {
  REPORT_HISTORY_HEADERS,
  reportDataDictionary,
  reportHeaderNotes,
} from './report-vocabulary.js';
import { exportIntakeWorkbook } from './workbook-export.js';

export interface ReportInterpretationRecord<Interpretation> {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly mode: string;
  readonly enabled: boolean;
  readonly events: readonly EvidenceEvent[];
  readonly interpretations: readonly Interpretation[];
  readonly failures: readonly string[];
}
export type ReportInterpretationExecution =
  | { readonly apiEnabled: true; readonly config: Pick<InterpreterConfig, 'provider' | 'model'> }
  | {
      readonly apiEnabled: false;
      readonly config?: Pick<InterpreterConfig, 'provider' | 'model'> | null | undefined;
    };
export interface ReportCollectedSourceOutcome extends ReportRecommendationSource {
  readonly runId: string;
  readonly collectedAt: string;
  readonly opportunityId: string;
  readonly opportunityName: string;
}
export interface ReportFinalizationInput<Evidence, Interpretation> extends Omit<
  ReportAssemblyInput<Evidence>,
  | 'combinedGenerationLedgerRows'
  | 'noteAdjudications'
  | 'priorRunHistoryRows'
  | 'sourceStatusRecords'
> {
  readonly runDirectory: string;
  readonly historyStatePath: string;
  readonly noteAdjudicator: NoteAdjudicator;
  readonly sourceStatusRecords: readonly ReportCollectedSourceOutcome[];
  readonly generationLedgerBaseline: GenerationLedgerBaseline;
  readonly currentGenerationLedgerRows: readonly GenerationLedgerRow[];
  readonly conversationSearchRecords: readonly ConversationSearchResult<SearchMatch>[];
  readonly interpretation: ReportInterpretationExecution;
  readonly precomputedInterpretations: {
    readonly rows?: readonly unknown[] | null | undefined;
    readonly executionProvenance?: unknown;
  };
  readonly interpretationUsage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly interpretationRecords: readonly ReportInterpretationRecord<Interpretation>[];
  readonly firefliesArtifactHealth: ReportMetadataInput['firefliesArtifactHealth'];
}
export interface FinalizedReportArtifacts<Evidence> {
  readonly report: ReportAssembly<Evidence>;
  readonly workbook: {
    readonly runId: string;
    readonly generatedAt: string;
    readonly sheets: Readonly<Record<string, readonly (readonly unknown[])[]>>;
  };
}
function interpretationMetadata<Evidence, Interpretation>(
  input: ReportFinalizationInput<Evidence, Interpretation>
): ReportMetadataInterpretation {
  return input.interpretation.apiEnabled
    ? { mode: 'api', config: input.interpretation.config, usage: input.interpretationUsage }
    : { mode: 'precomputed', rows: input.precomputedInterpretations.rows?.length ?? 0 };
}

/** Finalize already evaluated rows. This never collects sources, interprets packets or publishes. */
export async function finalizeIntakeReportArtifacts<Evidence, Interpretation>(
  input: ReportFinalizationInput<Evidence, Interpretation>,
  now: () => Date = () => new Date()
): Promise<FinalizedReportArtifacts<Evidence>> {
  const directory = await privateDirectory(input.runDirectory);
  await requireMutableRun(directory);
  const write = (name: string, value: unknown): Promise<void> =>
    atomicPrivateWrite(path.join(directory, name), JSON.stringify(value, null, 2));
  const adjudicator = input.noteAdjudicator;
  adjudicator.assertConsumed();
  await write('note_adjudication_packets.json', {
    runId: input.runId,
    sourceCutoff: input.runAt.toISOString(),
    packets: adjudicator.packets,
  });
  await write('note_adjudication_receipts.json', adjudicator.receipts);
  // Keep collection order here; the report tables are sorted only after these audit artifacts.
  await write(
    'normalized_evidence_rows.json',
    input.entries.flatMap((entry) => entry.normalizedEvidence)
  );
  await write('source_status_rows.json', input.sourceStatusRecords);
  await write('delay_history_rows.json', input.delayHistoryRows);
  await write('conversation_search_results.json', input.conversationSearchRecords);
  const combinedGenerationLedgerRows = await writeGenerationLedgerState({
    runDir: directory,
    baseline: input.generationLedgerBaseline,
    currentRows: input.currentGenerationLedgerRows,
  });
  await write('ai_interpretation_rows.json', {
    apiEnabled: input.interpretation.apiEnabled,
    precomputedRows: input.precomputedInterpretations.rows?.length ?? 0,
    model: input.interpretation.config?.model ?? null,
    provider: input.interpretation.config?.provider ?? null,
    engineVersion: EVIDENCE_ENGINE_VERSION,
    precomputedExecutionProvenance: input.precomputedInterpretations.executionProvenance ?? null,
    usage: input.interpretationUsage,
    rows: input.interpretationRecords,
  });
  const assembled = assembleReport({
    ...input,
    combinedGenerationLedgerRows,
    noteAdjudications: adjudicator,
    priorRunHistoryRows: [],
  });
  await write('run_manifest.json', assembled.runManifest);
  const prior = await loadReportRunHistory(input.historyStatePath, REPORT_HISTORY_HEADERS);
  const report = {
    ...assembled,
    runHistoryRows: [...assembled.runHistoryRows, ...prior.filter((row) => row[0] !== input.runId)],
  };
  const metadata = buildReportMetadata({
    runId: input.runId,
    runAtEastern: input.runAtEastern,
    firefliesArtifactHealth: input.firefliesArtifactHealth,
    interpretation: interpretationMetadata(input),
    activeRows: assembled.runManifest.expectedActiveRows,
    onHoldRows: assembled.runManifest.expectedOnHoldRows,
    totalRows: assembled.runManifest.processedRows,
  });
  await write('header_notes.json', reportHeaderNotes());
  await atomicPrivateWrite(
    path.join(directory, 'case-history-review.html'),
    renderCaseHistoryReview({
      sheets: { 'Review Queue': report.rows, 'On-Hold Review': report.onHoldRows },
      generatedAt: input.runAt.toISOString(),
    })
  );
  const workbook = {
    runId: input.runId,
    generatedAt: now().toISOString(),
    sheets: {
      'Review Queue': report.rows,
      'On-Hold Review': report.onHoldRows,
      'Evidence Detail': report.evidenceRows,
      'Source & Run Notes': metadata,
      'Data Dictionary': reportDataDictionary(),
      'Run History': report.runHistoryRows,
      'Generation Ledger': report.ledgerRows,
    },
  };
  await write('workbook-values.json', workbook);
  return { report, workbook };
}

const cells = z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])));
const workbookValuesSchema = z.object({
  sheets: z.object({
    'Review Queue': cells,
    'On-Hold Review': cells,
    'Evidence Detail': cells,
    'Source & Run Notes': cells,
    'Data Dictionary': cells,
    'Run History': cells,
    'Generation Ledger': cells,
  }),
});

/** Export the persisted report values; JSON's empty cells stay null, never text-coerced. */
export async function exportSavedIntakeReportWorkbook(
  provider: ArtifactWorkbookProvider,
  runDirectory: string
): Promise<{ readonly workbookPath: string; readonly inspection: unknown }> {
  await requireMutableRun(runDirectory);
  const result = workbookValuesSchema.safeParse(
    await readPrivateJson(path.join(runDirectory, 'workbook-values.json'))
  );
  if (!result.success)
    throw new Error('Saved workbook values are incompatible with the workbook cell contract');
  return exportIntakeWorkbook(provider, result.data.sheets, runDirectory);
}
