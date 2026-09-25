import path from 'node:path';

import type { ArtifactWorkbookProvider } from '@headstart-health/artifact-workbook';

import type { StructuredCollectionSource } from './collection-initial.js';
import type { EvidenceEvent } from './evidence.js';
import type { FirefliesSuppliedInterpretation } from './fireflies-evidence-types.js';
import { loadGenerationLedgerBaseline } from './generation-ledger-storage.js';
import { createNoteAdjudicator } from './note-adjudication.js';
import { optionalPrivateJson, privateDirectory, requireMutableRun } from './private-run-storage.js';
import { verifyRecoveryInputs } from './recovery-input-verification.js';
import { prepareCollectedReportContext } from './report-billing.js';
import { evaluateReportOpportunity, type EvaluatedReportRow } from './report-evaluation.js';
import {
  finalizeIntakeReportArtifacts,
  exportSavedIntakeReportWorkbook,
  type FinalizedReportArtifacts,
} from './report-finalization.js';
import type { ReportIdentityRegistries } from './report-identity.js';
import type { PreparedReportInterpreter } from './report-interpreter-setup.js';
import { indexReportStructuredSources } from './report-opportunity-context.js';
import { loadReportReviewerState } from './report-saved-state.js';
import { loadSavedReportSources } from './saved-source-context.js';
import { savedSourceArtifacts } from './saved-source-storage.js';
import { collectStructuredEvidence } from './structured-collection.js';

export interface IntakeReportBuildInput<T extends FirefliesSuppliedInterpretation> {
  readonly runDirectory: string;
  readonly runAt: Date;
  readonly source: StructuredCollectionSource;
  readonly registries?: ReportIdentityRegistries;
  readonly interpretation: PreparedReportInterpreter<T>;
  readonly requireReviewerState: boolean;
  readonly ledgerInputPath?: string;
  readonly workbookProvider?: ArtifactWorkbookProvider;
  readonly now?: () => Date;
}

/** Full frozen build; native source capture and publication remain separate operator steps. */
export async function buildIntakeReport<T extends FirefliesSuppliedInterpretation>(
  input: IntakeReportBuildInput<T>
): Promise<FinalizedReportArtifacts<EvidenceEvent>> {
  const directory = await privateDirectory(input.runDirectory);
  const { runAt, interpretation } = input;
  const cutoff = runAt.toISOString();
  const runId = `sla-review-${cutoff.replace(/[:.]/g, '-')}`;
  await requireMutableRun(directory);
  await verifyRecoveryInputs(directory, runId, cutoff);
  const baseline = await loadGenerationLedgerBaseline({
    runDir: directory,
    runId,
    inputPath: input.ledgerInputPath,
  });
  const reviewerState = await loadReportReviewerState(
    path.join(directory, 'reviewer_state.json'),
    runAt,
    input.requireReviewerState
  );
  const artifacts = savedSourceArtifacts(directory);
  const data = await collectStructuredEvidence({ source: input.source, artifacts, cutoff });
  const { identities, billingRows } = await prepareCollectedReportContext(
    data,
    artifacts,
    runAt,
    input.registries
  );
  const saved = await loadSavedReportSources({
    artifacts,
    collection: data,
    profiles: identities,
    runId,
    runAt,
  });
  const noteAdjudicator = createNoteAdjudicator({
    runId,
    asOf: runAt,
    artifact: (await optionalPrivateJson(path.join(directory, 'note_adjudications.json'))) ?? null,
  });
  const context = {
    index: indexReportStructuredSources(data),
    identities: new Map(identities.map((row) => [row.opportunityId, row])),
    billing: new Map(billingRows.map((row) => [row.opportunityId, row])),
    saved,
    ledgerRows: baseline.rows,
    reviewerState,
    noteAdjudicator,
    interpretation,
    runId,
    runAt,
    sfBaseUrl: 'https://headstart-health.lightning.force.com/lightning/r/Opportunity',
  };
  const rows: EvaluatedReportRow<T>[] = [];
  const interpretationUsage = { inputTokens: 0, outputTokens: 0 };
  for (const opportunity of data.opportunities)
    rows.push(await evaluateReportOpportunity(opportunity, context));
  for (const row of rows) {
    interpretationUsage.inputTokens += row.interpretationUsage.inputTokens;
    interpretationUsage.outputTokens += row.interpretationUsage.outputTokens;
  }
  const finalized = await finalizeIntakeReportArtifacts(
    {
      runDirectory: directory,
      historyStatePath: path.join(directory, 'run_history_state.json'),
      runId,
      runAt,
      runAtEastern: new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(runAt),
      expectedRows: data.opportunities.length,
      entries: rows.map((row) => row.entry),
      delayHistoryRows: rows.map((row) => row.delayHistory),
      noteAdjudicator,
      sourceStatusRecords: rows.flatMap((row) => row.sources),
      generationLedgerBaseline: baseline,
      currentGenerationLedgerRows: rows.map((row) => row.generationLedgerRow),
      conversationSearchRecords: rows.flatMap((row) => row.searches),
      interpretation: interpretation.execution.apiEnabled
        ? interpretation.execution
        : { apiEnabled: false, config: interpretation.config },
      precomputedInterpretations: interpretation.artifact,
      interpretationUsage,
      interpretationRecords: rows.map((row) => row.interpretation),
      firefliesArtifactHealth: saved.transcriptHealth,
    },
    input.now
  );
  if (input.workbookProvider)
    await exportSavedIntakeReportWorkbook(input.workbookProvider, directory);
  return finalized;
}
