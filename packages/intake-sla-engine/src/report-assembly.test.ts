import { describe, expect, it } from 'vitest';

import { createGenerationLedgerRow } from './generation-ledger.js';
import { sha256Json } from './json-fingerprint.js';
import {
  assembleReport,
  type ReportAssemblyInput,
  type ReportMainRow,
  type ReportQueueEntry,
} from './report-assembly.js';
import { reportNonNegativeDaysOnHold } from './report-display-values.js';
import { REPORT_HOLD_INSERT_INDEX, REPORT_QUEUE_HEADERS } from './report-vocabulary.js';
import { sourceOutcome } from './source-outcome.js';

function entry(
  name: string,
  freshness = 'Current',
  date = '2026-09-24',
  onHold = false
): ReportQueueEntry<string> {
  const remaining: unknown[] = Array.from({ length: 27 }, () => '');
  remaining[14] = 'Yes';
  return {
    main: [
      name,
      `https://example.test/${name}/view`,
      'Practice',
      'Provider',
      'Owner',
      'IA Scheduled',
      4,
      'IA',
      freshness,
      date,
      ...remaining,
    ],
    evidence: [name, `id-${name}`],
    normalizedEvidence: [`evidence-${name}`],
    onHold,
    holdFields: ['Family unavailable', '2026-09-20', 4, 'Confirm availability'],
  };
}
function input(entries: readonly ReportQueueEntry<string>[] = []): ReportAssemblyInput<string> {
  return {
    runId: 'synthetic-run',
    runAt: new Date('2026-09-24T16:00:00Z'),
    runAtEastern: '9/24/2026, 12:00 PM ET',
    expectedRows: entries.length,
    entries,
    sourceStatusRecords: [],
    combinedGenerationLedgerRows: [],
    delayHistoryRows: [],
    noteAdjudications: { inputHash: 'synthetic-hash', receipts: [] },
    priorRunHistoryRows: [],
  };
}
describe('approved report table and manifest assembly', () => {
  it('keeps all headers and a pending current history row for an empty report', () => {
    const result = assembleReport(input());
    expect(result.rows).toEqual([REPORT_QUEUE_HEADERS]);
    expect(result.onHoldRows[0]).toHaveLength(41);
    expect(result.evidenceRows[0]).toHaveLength(38);
    expect(result.ledgerRows[0]).toHaveLength(11);
    expect(result.runHistoryRows).toHaveLength(2);
    expect(result.runHistoryRows[0]).toHaveLength(12);
    expect(result.runHistoryRows[1]?.slice(0, 6)).toEqual([
      'synthetic-run',
      '9/24/2026, 12:00 PM ET',
      0,
      0,
      0,
      0,
    ]);
    expect(result.runHistoryRows[1]?.[11]).toBe('Built - Pending Publish');
  });
  it('sorts both queues and the shared evidence by freshness, date and then name without mutating input', () => {
    const supplied = input([
      entry('current'),
      entry('stale-new', 'Stale', '2026-09-02'),
      entry('missing', 'Missing', ''),
      entry('stale-old', 'Stale', '2026-09-01', true),
      entry('semi', 'Semi-Stale'),
      entry('a-tie', 'Current'),
      entry('z-unknown', 'Unknown'),
    ]);
    const before = structuredClone(supplied);
    const result = assembleReport(supplied);
    expect(result.entries.map((row) => row.main[0])).toEqual([
      'missing',
      'stale-old',
      'stale-new',
      'semi',
      'a-tie',
      'current',
      'z-unknown',
    ]);
    expect(result.rows.slice(1).map((row) => row[0])).toEqual([
      'missing',
      'stale-new',
      'semi',
      'a-tie',
      'current',
      'z-unknown',
    ]);
    expect(result.onHoldRows[1]?.[0]).toBe('stale-old');
    expect(result.evidenceRows.slice(1).map((row) => row[0])).toEqual(
      result.entries.map((row) => row.main[0])
    );
    expect(supplied).toEqual(before);
  });
  it('retains blank-date epoch ordering and invalid-date name fallback', () => {
    const result = assembleReport(
      input([
        entry('z-dated'),
        entry('b-invalid', 'Current', 'invalid'),
        entry('a-empty', 'Current', ''),
      ])
    );
    expect(result.entries.map((row) => row.main[0])).toEqual(['a-empty', 'b-invalid', 'z-dated']);
  });
  it('inserts hold fields after Needs CSM Review without coercing reviewer-owned cells', () => {
    const held = entry('held', 'Stale', '', true);
    const reviewerNotes = { deliberately: 'opaque saved value' };
    const main: [...ReportMainRow] = [...held.main];
    main[26] = reviewerNotes;
    main[27] = false;
    main[28] = null;
    main[35] = 0;
    const result = assembleReport(input([{ ...held, main }]));
    const row = result.onHoldRows[1];
    expect(row?.slice(REPORT_HOLD_INSERT_INDEX, REPORT_HOLD_INSERT_INDEX + 4)).toEqual(
      held.holdFields
    );
    expect(row?.[26]).toBe(reviewerNotes);
    expect(row?.[27]).toBe(false);
    expect(row?.[28]).toBeNull();
    expect(row?.[39]).toBe(0);
    expect(row).toHaveLength(41);
  });
  it('counts only exact Blocked readiness and keeps expected/processed mismatch visible', () => {
    const blocked = entry('blocked');
    const rest = blocked.main.slice(10);
    rest[14] = 'Blocked';
    const entries: ReportQueueEntry<string>[] = [
      { ...blocked, main: ['blocked', '', '', '', '', '', 0, '', '', '', ...rest] },
      entry('review'),
    ];
    const result = assembleReport({ ...input(entries), expectedRows: 3 });
    expect(result.runManifest).toMatchObject({
      expectedRows: 3,
      processedRows: 2,
      blockedRows: 1,
      expectedActiveRows: 2,
      expectedOnHoldRows: 0,
    });
    expect(result.runHistoryRows[1]?.[5]).toBe(1);
  });
  it('preserves the actual hold-duration helper blank result', () => {
    const held = entry('held', 'Current', '', true);
    const days = reportNonNegativeDaysOnHold({}, new Date('2026-09-24T16:00:00Z'));
    const result = assembleReport(input([{ ...held, holdFields: ['Hold', '', days, 'Restart'] }]));
    expect(days).toBe('');
    expect(result.onHoldRows[1]?.[REPORT_HOLD_INSERT_INDEX + 2]).toBe('');
  });
  it('binds frozen cutoff, delay histories and exact note receipts without choosing new policy', () => {
    const supplied = input();
    const histories = [{ opportunityId: 'synthetic-id', history: null }];
    const result = assembleReport({ ...supplied, delayHistoryRows: histories });
    expect(result.runManifest.startedAt).toBe(supplied.runAt.toISOString());
    expect(result.runManifest.delayHistory).toEqual({
      version: 1,
      rows: 1,
      artifactHash: sha256Json(histories),
    });
    expect(result.runManifest.noteAdjudications).toEqual({
      inputHash: 'synthetic-hash',
      receiptsHash: sha256Json([]),
      accepted: 0,
    });
  });
  it('retains source order and the original distinction between grouped and individual Unsupported counts', () => {
    const result = assembleReport({
      ...input(),
      sourceStatusRecords: [
        { source: 'Portal', status: 'Searched - Not Found' },
        { source: 'Salesforce', status: 'Found' },
        { source: 'Authorization', status: 'Unsupported' },
        { source: 'Clinical Quality', status: 'Blocked' },
        { source: 'Staffing', status: 'Timed Out' },
        { source: 'Slack', status: 'Found' },
        { source: 'Gmail', status: 'Unsupported' },
        { source: 'Fireflies', status: 'Blocked' },
        { source: 'Linked Billing / Claims', status: 'Found' },
      ],
    });
    expect(Object.keys(result.runManifest.sourceCounts)).toEqual([
      'Portal',
      'Salesforce',
      'Authorization',
      'Clinical Quality',
      'Staffing',
      'Slack',
      'Gmail',
      'Fireflies',
      'Linked Billing / Claims',
    ]);
    expect(result.runHistoryRows[1]?.[6]).toBe(
      'Found 1; Not Found 0; Blocked 1; Timed Out 1; Unsupported 1'
    );
    expect(result.runHistoryRows[1]?.[7]).toBe('Found 0; Not Found 1; Blocked 0; Timed Out 0');
    expect(result.runHistoryRows[1]?.[10]).toBe(
      'Slack: Found 1; Not Found 0; Blocked 0; Timed Out 0 | Gmail: Found 0; Not Found 0; Blocked 0; Timed Out 0 | Linked Files: Found 0; Not Found 0; Blocked 0; Timed Out 0'
    );
  });
  it('composes actual source outcomes and generated-ledger rows without changing saved historical values', () => {
    const outcome = sourceOutcome({
      source: 'Portal',
      row: { checkedAt: '2026-09-24T16:00:00Z' },
      asOf: '2026-09-24T16:00:00Z',
    });
    const generated = createGenerationLedgerRow({
      runId: 'synthetic-run',
      opportunityId: 'synthetic-id',
      slaId: 'synthetic-sla',
      generatedAt: '2026-09-24T16:00:00Z',
      generatedSummary: 'Summary',
    });
    const historical = { runId: 'old', slaId: false, opportunityId: 23, operationalSummary: null };
    const result = assembleReport({
      ...input(),
      sourceStatusRecords: [outcome],
      combinedGenerationLedgerRows: [historical, generated],
    });
    expect(result.runManifest.sourceCounts['Portal']).toBe(
      'Found 0; Not Found 1; Blocked 0; Timed Out 0'
    );
    expect(result.ledgerRows[1]?.slice(0, 3)).toEqual(['old', false, 23]);
    expect(result.ledgerRows[1]?.[8]).toBe('');
    expect(result.ledgerRows[2]?.[6]).toBe('Summary');
  });
  it('replaces current history while preserving prior order and values', () => {
    const prior = [
      ['older', false, 0, null],
      ['synthetic-run', 'obsolete'],
      ['oldest', 'value'],
    ];
    const result = assembleReport({ ...input(), priorRunHistoryRows: prior });
    expect(result.runHistoryRows.slice(2)).toEqual([prior[0], prior[2]]);
    expect(result.runHistoryRows[2]).toBe(prior[0]);
  });
});
