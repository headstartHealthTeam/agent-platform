import { describe, expect, it } from 'vitest';

import type { CorrectionRunInput } from './correction-run.js';
import { prepareCorrection } from './correction-run.js';
import type { GenerationLedgerRow } from './generation-ledger.js';
import {
  createGenerationLedgerRow,
  GENERATION_LEDGER_HEADERS,
  generationLedgerRows,
} from './generation-ledger.js';
import { googleCellValue } from './google-publication-values.js';
import { sha256Json } from './json-fingerprint.js';
import { publicationPlanHash } from './publication-plan.js';

interface Fixture extends CorrectionRunInput {
  readonly ledger: GenerationLedgerRow[];
  readonly finalReceipt: {
    readonly runId: string;
    readonly spreadsheetId: string;
    readonly planHash: string;
    readonly complete: boolean;
    readonly publicationStatus: string;
    readonly finalReadback: {
      readonly captureVersion: number;
      readonly evidenceHash: string;
      readonly assertions: { readonly id: string; readonly actualHash: string }[];
    };
  };
}
function ledgerRow(): GenerationLedgerRow {
  return createGenerationLedgerRow({
    runId: 'base',
    opportunityId: 'opp-a',
    slaId: 'sla-a',
    generatedSummary: 'Synthetic',
    generatedAt: '2026-01-01T12:00:00Z',
  });
}
function fixture(): Fixture {
  const row = ledgerRow();
  const values = generationLedgerRows([{ ...row, publicationStatus: 'Published' }]).at(1);
  if (!values) throw new Error('Fixture projection missing');
  const expectedHash = sha256Json([
    values.map(
      (value, index) =>
        googleCellValue(value, GENERATION_LEDGER_HEADERS.at(index)).userEnteredValue ?? null
    ),
  ]);
  const finalAssertions = [
    {
      id: 'final',
      expectedHash,
      title: 'Generation Ledger',
      kind: 'values',
      rowCount: 1,
      columnCount: GENERATION_LEDGER_HEADERS.length,
    },
  ];
  const stageManifest = {
    runId: 'base',
    spreadsheetId: 'synthetic',
    stages: [],
    finalAssertions,
    planHash: publicationPlanHash([], finalAssertions),
  };
  return {
    baseManifest: {
      runId: 'base',
      startedAt: '2026-01-01T12:00:00Z',
      expectedRows: 1,
      processedRows: 1,
    },
    stageManifest,
    gate: { ...stageManifest, passed: true },
    observations: { ...stageManifest, stages: [] },
    finalReceipt: {
      ...stageManifest,
      complete: true,
      publicationStatus: 'Published',
      finalReadback: {
        captureVersion: 1,
        evidenceHash: 'b'.repeat(64),
        assertions: [{ id: 'final', actualHash: expectedHash }],
      },
    },
    ledger: [row],
    runId: 'correction',
    asOf: '2026-01-01T13:00:00Z',
  };
}
const now = (): number => Date.parse('2026-01-01T14:00:00Z');
describe('published-base correction initialization', () => {
  it('binds the exact immutable base and publishes its ledger copy without mutating the source', () => {
    const input = fixture();
    const original = structuredClone(input);
    const result = prepareCorrection(input, now);
    expect(result.ledgerState).toEqual([{ ...ledgerRow(), publicationStatus: 'Published' }]);
    expect(result.provenance).toEqual({
      version: 1,
      runId: input.runId,
      asOf: input.asOf,
      baseRunId: 'base',
      baseCutoff: input.baseManifest.startedAt,
      baseManifestHash: sha256Json(input.baseManifest),
      baseReadbackHash: sha256Json(input.finalReceipt),
      baseLedgerHash: sha256Json(input.ledger),
      ledgerHash: sha256Json(result.ledgerState),
      sourceReuse: false,
      interpretationReuse: 'exact-api-binding-only',
      firefliesMode: 'bounded-fresh',
      cacheReuse: false,
      salesforceReadOnly: true,
      status: 'Initialized',
    });
    expect(input).toEqual(original);
  });
  it('preserves published historical rows and their additional audit metadata', () => {
    const input = fixture();
    const historical = {
      ...ledgerRow(),
      runId: 'historical',
      publicationStatus: 'Published',
      extra: { retained: true },
    };
    const result = prepareCorrection({ ...input, ledger: [...input.ledger, historical] }, now);
    expect(result.ledgerState.at(1)).toEqual(historical);
    expect(() =>
      prepareCorrection(
        { ...input, ledger: [...input.ledger, { ...historical, publicationStatus: 'Draft' }] },
        now
      )
    ).toThrow('Unpublished historical');
  });
  it('requires a distinct valid run and a strictly later, nonfuture fixed cutoff', () => {
    const input = fixture();
    for (const runId of ['', 'x', 'base', '../invalid'])
      expect(() => prepareCorrection({ ...input, runId }, now)).toThrow('new run');
    for (const asOf of [
      'invalid',
      input.baseManifest.startedAt,
      '2026-01-01T11:00:00Z',
      '2026-01-01T15:00:00Z',
    ])
      expect(() => prepareCorrection({ ...input, asOf }, now)).toThrow('new run');
  });
  it('requires complete and matching cohort, gate and staged readback', () => {
    const input = fixture();
    expect(() =>
      prepareCorrection(
        { ...input, baseManifest: { ...input.baseManifest, processedRows: 0 } },
        now
      )
    ).toThrow('Base cohort');
    expect(() =>
      prepareCorrection({ ...input, baseManifest: { ...input.baseManifest, runId: 'other' } }, now)
    ).toThrow('Base cohort');
    expect(() =>
      prepareCorrection({ ...input, gate: { ...input.gate, passed: false } }, now)
    ).toThrow('has not passed');
    expect(() =>
      prepareCorrection(
        { ...input, observations: { ...input.observations, spreadsheetId: 'other' } },
        now
      )
    ).toThrow('different spreadsheet');
    expect(() =>
      prepareCorrection({ ...input, finalReceipt: { ...input.finalReceipt, complete: false } }, now)
    ).toThrow('Base publication');
    expect(() =>
      prepareCorrection({ ...input, finalReceipt: { ...input.finalReceipt, runId: 'other' } }, now)
    ).toThrow('Base publication');
  });
  it('requires every exact final assertion and its capture proof', () => {
    const input = fixture();
    const final = input.finalReceipt.finalReadback;
    for (const finalReadback of [
      undefined,
      { ...final, captureVersion: 0 },
      { ...final, evidenceHash: 'invalid' },
      { ...final, assertions: [] },
      { ...final, assertions: [...final.assertions, ...final.assertions] },
      { ...final, assertions: [{ id: 'final', actualHash: 'wrong' }] },
    ]) {
      expect(() =>
        prepareCorrection({ ...input, finalReceipt: { ...input.finalReceipt, finalReadback } }, now)
      ).toThrow('exact assertion');
    }
  });
  it('rejects unsupported, corrupt, duplicated and incorrectly counted ledgers', () => {
    const input = fixture();
    for (const ledger of [
      null,
      [[]],
      [{}],
      [{ ...ledgerRow(), summaryHash: 'wrong' }],
      [{ ...ledgerRow(), operationalSummaryHash: 'wrong' }],
    ]) {
      expect(() => prepareCorrection({ ...input, ledger }, now)).toThrow('corrupt object-form');
    }
    for (const ledger of [
      [],
      [ledgerRow(), ledgerRow()],
      [{ ...ledgerRow(), runId: 'historical', publicationStatus: 'Published' }],
    ]) {
      expect(() => prepareCorrection({ ...input, ledger }, now)).toThrow('count or identity');
    }
  });
  it('requires Published cell values covered by a complete one-row ledger assertion', () => {
    const input = fixture();
    const final = input.stageManifest.finalAssertions?.at(0);
    if (!final) throw new Error('Fixture assertion missing');
    for (const changes of [
      { title: 'other' },
      { kind: 'other' },
      { rowCount: 2 },
      { columnCount: 1 },
    ]) {
      const finalAssertions = [{ ...final, ...changes }];
      const planHash = publicationPlanHash([], finalAssertions);
      const altered = {
        ...input,
        stageManifest: { ...input.stageManifest, finalAssertions, planHash },
        gate: { ...input.gate, planHash },
        observations: { ...input.observations, planHash },
        finalReceipt: { ...input.finalReceipt, planHash },
      };
      expect(() => prepareCorrection(altered, now)).toThrow('exact Published');
    }
    const row = createGenerationLedgerRow({ ...ledgerRow(), generatedSummary: 'Changed' });
    expect(() => prepareCorrection({ ...input, ledger: [row] }, now)).toThrow('exact Published');
  });
});
