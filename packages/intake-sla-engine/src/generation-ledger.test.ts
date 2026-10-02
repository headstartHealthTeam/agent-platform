import { describe, expect, it } from 'vitest';

import {
  classifyCurrentSlaNote,
  createGenerationLedgerRow,
  generationHash,
  generationLedgerRows,
  GENERATION_LEDGER_HEADERS,
} from './generation-ledger.js';

const base = {
  runId: 'prior',
  slaId: 'sla',
  opportunityId: 'opp',
  generatedAt: '2026-09-01T12:00:00Z',
  generatedSummary: 'Authorization is pending. Follow up with payer.',
};
describe('generated SLA note provenance', () => {
  it('retains exact canonical hashes and all persisted ledger columns', () => {
    const row = createGenerationLedgerRow({
      ...base,
      generatedSummary: '  Áuthorization\n is pending.  ',
      operationalSummary: '  Check\t payer  ',
    });
    expect(row.summaryHash).toBe(generationHash('authorization IS pending!'));
    expect(row.generatedSummary).toBe('Áuthorization is pending.');
    expect(row.operationalSummary).toBe('Check payer');
    expect(Object.hasOwn(row, 'engineVersion')).toBe(true);
    expect(row.engineVersion).toBeUndefined();
    expect(generationLedgerRows([row])).toEqual([
      GENERATION_LEDGER_HEADERS,
      [
        'prior',
        'sla',
        'opp',
        undefined,
        undefined,
        base.generatedAt,
        row.generatedSummary,
        row.summaryHash,
        'Check payer',
        row.operationalSummaryHash,
        'Built - Pending Publish',
      ],
    ]);
    expect(generationLedgerRows()).toEqual([GENERATION_LEDGER_HEADERS]);
    expect(generationLedgerRows([{}])[1]?.[8]).toBe('');
    expect(
      createGenerationLedgerRow({ runId: 'run', slaId: 'sla', opportunityId: 'opp' }).generatedAt
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('excludes exact generated notes but admits genuinely independent or appended human evidence', () => {
    const row = createGenerationLedgerRow(base);
    expect(classifyCurrentSlaNote({ note: base.generatedSummary, ledgerRows: [row] })).toEqual({
      provenance: 'Generated - Exact',
      admittedText: '',
      excludedText: base.generatedSummary,
      matchedRunId: 'prior',
    });
    expect(
      classifyCurrentSlaNote({
        note: `${base.generatedSummary} Family confirmed a new address.`,
        ledgerRows: [row],
      })
    ).toMatchObject({
      provenance: 'Generated - Human Addition',
      admittedText: 'Family confirmed a new address.',
      excludedText: base.generatedSummary,
    });
    expect(
      classifyCurrentSlaNote({ note: 'Unrelated new staffing evidence', ledgerRows: [row] })
    ).toEqual({
      provenance: 'Human',
      admittedText: 'Unrelated new staffing evidence',
      excludedText: '',
    });
    expect(
      classifyCurrentSlaNote({
        note: base.generatedSummary,
        opportunityId: 'other',
        ledgerRows: [row],
      }).provenance
    ).toBe('Human');
    expect(
      classifyCurrentSlaNote({ note: base.generatedSummary, slaId: 'other', ledgerRows: [row] })
        .provenance
    ).toBe('Human');
    expect(
      classifyCurrentSlaNote({
        note: base.generatedSummary,
        slaId: 'other',
        ledgerRows: [{ ...row, slaId: null }],
      }).provenance
    ).toBe('Generated - Exact');
  });
  it('retains similarity thresholds, clause preservation, stable ties and legacy fallback precedence', () => {
    const rows = [
      { ...createGenerationLedgerRow(base), summaryHash: 'not-exact' },
      { ...createGenerationLedgerRow({ ...base, runId: 'second' }), summaryHash: 'not-exact' },
    ];
    expect(
      classifyCurrentSlaNote({
        note: base.generatedSummary,
        ledgerRows: rows,
        generatedPatternMatch: true,
      })
    ).toMatchObject({ provenance: 'Generated - Similar', matchedRunId: 'prior', similarity: 1 });
    expect(classifyCurrentSlaNote({ note: 'Legacy output', generatedPatternMatch: true })).toEqual({
      provenance: 'Generated - Unverified Legacy',
      admittedText: '',
      excludedText: 'Legacy output',
    });
    expect(classifyCurrentSlaNote({ note: '', generatedPatternMatch: true })).toEqual({
      provenance: 'Empty',
      admittedText: '',
      excludedText: '',
    });
    expect(classifyCurrentSlaNote({}).provenance).toBe('Empty');
    expect(classifyCurrentSlaNote({ note: null }).admittedText).toBe('null');
    expect(
      classifyCurrentSlaNote({
        note: '!!!',
        ledgerRows: [{ generatedSummary: '???' }],
        similarityThreshold: 0.84,
      })
    ).toMatchObject({ provenance: 'Generated - Similar', similarity: 1, matchedRunId: undefined });
    expect(
      classifyCurrentSlaNote({
        note: 'completely different',
        ledgerRows: rows,
        similarityThreshold: 0,
      })
    ).toMatchObject({ provenance: 'Generated - Similar' });
  });
});
