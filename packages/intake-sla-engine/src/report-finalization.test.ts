import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  ArtifactWorkbook,
  ArtifactWorkbookProvider,
  WorkbookMatrix,
  WorkbookRange,
  WorkbookWorksheet,
} from '@headstart-health/artifact-workbook';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConversationSearchResult } from './conversation-search-result.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import type { EvidenceEvent } from './evidence.js';
import { loadGenerationLedgerBaseline } from './generation-ledger-storage.js';
import { createNoteAdjudicator } from './note-adjudication.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import {
  exportSavedIntakeReportWorkbook,
  finalizeIntakeReportArtifacts,
  type ReportFinalizationInput,
} from './report-finalization.js';
import { projectReportRow } from './report-row.js';
import { reportRowFixture } from './report-row.test-support.js';
import { REPORT_HISTORY_HEADERS, REPORT_QUEUE_HEADERS } from './report-vocabulary.js';
import { sourceOutcome } from './source-outcome.js';
import { INTAKE_WORKBOOK_SHEETS } from './workbook-layout.js';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true }))
  );
});
async function input(): Promise<
  ReportFinalizationInput<EvidenceEvent, { readonly findings: readonly unknown[] }>
> {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'intake-final-report-'))
  );
  directories.push(directory);
  const rowInput = reportRowFixture();
  const projected = projectReportRow({
    ...rowInput,
    reviewerState: {
      needsCsmReview: false,
      copiedToSalesforce: null,
      reviewerNotes: '  Keep exactly  ',
    },
  });
  const baseline = await loadGenerationLedgerBaseline({ runDir: directory, runId: rowInput.runId });
  return {
    runDirectory: directory,
    historyStatePath: path.join(directory, 'run_history_state.json'),
    runId: rowInput.runId,
    runAt: rowInput.runAt,
    runAtEastern: '09/24/2026, 12:00 PM EDT',
    expectedRows: 1,
    entries: [projected.entry],
    delayHistoryRows: [],
    sourceStatusRecords: [
      {
        ...sourceOutcome({
          source: 'Portal',
          asOf: rowInput.runAt.toISOString(),
          row: { searchedAt: rowInput.runAt.toISOString() },
          items: rowInput.combinedEvidence,
        }),
        opportunityId: rowInput.opp.Id,
        opportunityName: rowInput.opp.Name,
        runId: rowInput.runId,
        collectedAt: rowInput.runAt.toISOString(),
      },
    ],
    noteAdjudicator: createNoteAdjudicator({ runId: rowInput.runId, asOf: rowInput.runAt }),
    generationLedgerBaseline: baseline,
    currentGenerationLedgerRows: [projected.generationLedgerRow],
    conversationSearchRecords: [
      createConversationSearchResult({
        source: 'Fireflies',
        opportunityId: rowInput.opp.Id,
        searchedAt: rowInput.runAt.toISOString(),
      }),
    ],
    interpretation: { apiEnabled: false },
    precomputedInterpretations: {
      rows: [{}],
      executionProvenance: { kind: 'codex-current-run', api: false },
    },
    interpretationUsage: { inputTokens: 0, outputTokens: 0 },
    interpretationRecords: [
      {
        opportunityId: rowInput.opp.Id,
        opportunityName: rowInput.opp.Name,
        mode: 'precomputed',
        enabled: true,
        events: [],
        interpretations: [{ findings: [] }],
        failures: [],
      },
    ],
    firefliesArtifactHealth: { complete: true, retainedCount: 1, reason: null },
  };
}
function provider(): {
  provider: ArtifactWorkbookProvider;
  values: Map<string, WorkbookMatrix>;
  save: ReturnType<typeof vi.fn<(file: string) => Promise<void>>>;
} {
  const values = new Map<string, WorkbookMatrix>();
  const range = (name: string): WorkbookRange => ({
    setValues: (value): void => {
      values.set(name, value);
    },
    setNumberFormat: (): void => undefined,
    setFont: (): void => undefined,
    setFillColor: (): void => undefined,
    setFormat: (): void => undefined,
    autofitColumns: (): void => undefined,
  });
  const sheet = (name: string): WorkbookWorksheet => ({
    range: () => range(name),
    rangeByIndexes: () => range(name),
    usedRange: () => range(name),
    freezeRows: (): void => undefined,
    freezeColumns: (): void => undefined,
    showGridLines: (): void => undefined,
  });
  const save = vi.fn(async (_file: string): Promise<void> => undefined);
  const workbook: ArtifactWorkbook = {
    addWorksheet: sheet,
    worksheet: sheet,
    inspect: async () => 'synthetic-inspection',
    render: async () => new Uint8Array(),
    saveXlsx: save,
  };
  return { provider: { create: () => workbook, openXlsx: async () => workbook }, values, save };
}

describe('assembled report artifacts and saved workbook export', () => {
  it('composes real evaluated rows into all seven tables and binds files to the frozen cutoff', async () => {
    const supplied = await input();
    const generated = '2026-09-24T19:00:00.000Z';
    await writePrivateJson(supplied.historyStatePath, {
      headers: REPORT_HISTORY_HEADERS,
      rows: [
        ['prior', false, null],
        [supplied.runId, 'old draft'],
      ],
    });
    const result = await finalizeIntakeReportArtifacts(supplied, () => new Date(generated));
    expect(Object.keys(result.workbook.sheets)).toEqual(INTAKE_WORKBOOK_SHEETS);
    expect(result.workbook.generatedAt).toBe(generated);
    expect(result.report.runManifest.startedAt).toBe(supplied.runAt.toISOString());
    expect(result.report.runHistoryRows).toHaveLength(3);
    expect(result.report.runHistoryRows[2]).toEqual(['prior', false, null]);
    const queue = result.report.rows[1];
    expect(queue?.[REPORT_QUEUE_HEADERS.indexOf('Needs CSM Review')]).toBe(false);
    expect(queue?.[REPORT_QUEUE_HEADERS.indexOf('Copied to Salesforce?')]).toBeNull();
    expect(queue?.[REPORT_QUEUE_HEADERS.indexOf('Reviewer Notes')]).toBe('  Keep exactly  ');
    const expected = new Map<string, unknown>([
      [
        'normalized_evidence_rows.json',
        supplied.entries.flatMap((entry) => entry.normalizedEvidence),
      ],
      ['source_status_rows.json', supplied.sourceStatusRecords],
      ['delay_history_rows.json', supplied.delayHistoryRows],
      ['conversation_search_results.json', supplied.conversationSearchRecords],
      [
        'note_adjudication_packets.json',
        { runId: supplied.runId, sourceCutoff: supplied.runAt.toISOString(), packets: [] },
      ],
      ['note_adjudication_receipts.json', []],
      ['run_manifest.json', result.report.runManifest],
      ['workbook-values.json', result.workbook],
    ]);
    for (const [file, value] of expected)
      expect(await fs.readFile(path.join(supplied.runDirectory, file), 'utf8')).toBe(
        JSON.stringify(value, null, 2)
      );
    expect(
      await readPrivateJson(path.join(supplied.runDirectory, 'ai_interpretation_rows.json'))
    ).toEqual({
      apiEnabled: false,
      precomputedRows: 1,
      model: null,
      provider: null,
      engineVersion: EVIDENCE_ENGINE_VERSION,
      precomputedExecutionProvenance: { kind: 'codex-current-run', api: false },
      usage: supplied.interpretationUsage,
      rows: supplied.interpretationRecords,
    });
    const html = await fs.readFile(
      path.join(supplied.runDirectory, 'case-history-review.html'),
      'utf8'
    );
    expect(html).toContain(`Source cutoff: ${supplied.runAt.toISOString()}`);
    expect(html).toContain('Synthetic Avery');
    if (process.platform !== 'win32')
      expect(
        (await fs.stat(path.join(supplied.runDirectory, 'workbook-values.json'))).mode & 0o077
      ).toBe(0);
    const vendor = provider();
    expect(await exportSavedIntakeReportWorkbook(vendor.provider, supplied.runDirectory)).toEqual({
      workbookPath: path.join(supplied.runDirectory, 'intake_sla_review_queue.xlsx'),
      inspection: 'synthetic-inspection',
    });
    // Compare exact persisted matrices, including false/null/whitespace and historical blanks.
    const savedTables = new Map(Object.entries(result.workbook.sheets));
    for (const [name, matrix] of vendor.values)
      expect(JSON.stringify(matrix)).toBe(JSON.stringify(savedTables.get(name)));
    expect([...vendor.values.keys()]).toEqual(INTAKE_WORKBOOK_SHEETS);
    expect(vendor.save).toHaveBeenCalledOnce();
  }, 30_000);
  it('preserves API audit metadata and replaces only current ledger drafts on rebuild', async () => {
    const supplied = await input();
    const apiInput = {
      ...supplied,
      interpretation: {
        apiEnabled: true as const,
        config: { provider: 'openai-responses' as const, model: 'gpt-5.6-sol' as const },
      },
      interpretationUsage: { inputTokens: 27, outputTokens: 5 },
    };
    await finalizeIntakeReportArtifacts(apiInput);
    await finalizeIntakeReportArtifacts(apiInput);
    expect(
      await readPrivateJson(path.join(supplied.runDirectory, 'generation_ledger_state.json'))
    ).toEqual(supplied.currentGenerationLedgerRows);
    expect(
      await readPrivateJson(path.join(supplied.runDirectory, 'ai_interpretation_rows.json'))
    ).toMatchObject({
      apiEnabled: true,
      model: 'gpt-5.6-sol',
      provider: 'openai-responses',
      usage: { inputTokens: 27, outputTokens: 5 },
    });
    const values = await fs.readFile(
      path.join(supplied.runDirectory, 'workbook-values.json'),
      'utf8'
    );
    expect(values).toContain('27 input and 5 output tokens used.');
  }, 30_000);
  it('asserts note consumption before writing and never modifies a published run', async () => {
    const supplied = await input();
    await expect(
      finalizeIntakeReportArtifacts({
        ...supplied,
        noteAdjudicator: {
          ...supplied.noteAdjudicator,
          assertConsumed: () => {
            throw new Error('unconsumed synthetic decision');
          },
        },
      })
    ).rejects.toThrow('unconsumed');
    await expect(
      fs.access(path.join(supplied.runDirectory, 'note_adjudication_packets.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await writePrivateJson(path.join(supplied.runDirectory, 'publication-readback.json'), {
      passed: true,
    });
    await expect(finalizeIntakeReportArtifacts(supplied)).rejects.toThrow('immutable');
    const vendor = provider();
    await expect(
      exportSavedIntakeReportWorkbook(vendor.provider, supplied.runDirectory)
    ).rejects.toThrow('immutable');
    expect(vendor.save).not.toHaveBeenCalled();
  }, 30_000);
  it('does not fabricate a workbook when a required table or a supported cell is missing', async () => {
    const supplied = await input();
    const result = await finalizeIntakeReportArtifacts(supplied);
    const vendor = provider();
    await writePrivateJson(path.join(supplied.runDirectory, 'workbook-values.json'), {
      ...result.workbook,
      sheets: { ...result.workbook.sheets, 'Review Queue': [['header'], [{ notACell: true }]] },
    });
    await expect(
      exportSavedIntakeReportWorkbook(vendor.provider, supplied.runDirectory)
    ).rejects.toThrow('workbook cell contract');
    expect(vendor.save).not.toHaveBeenCalled();
    await writePrivateJson(path.join(supplied.runDirectory, 'workbook-values.json'), {
      ...result.workbook,
      sheets: { 'Review Queue': result.report.rows },
    });
    await expect(
      exportSavedIntakeReportWorkbook(vendor.provider, supplied.runDirectory)
    ).rejects.toThrow('workbook cell contract');
    expect(vendor.values.size).toBe(0);
  }, 30_000);
});
