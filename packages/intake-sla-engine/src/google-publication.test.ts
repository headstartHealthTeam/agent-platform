import { describe, expect, it } from 'vitest';

import { appendOnlyPlan, finalizeRequests } from './google-publication-append.js';
import { prepareGooglePublicationArtifacts } from './google-publication-artifacts.js';
import { clearTail, updateRequests, valuesAssertion } from './google-publication-cells.js';
import { reviewerPreservationProof } from './google-publication-reviewer.js';
import { publicationStage, splitStageCalls } from './google-publication-stages.js';
import type { GooglePreparedStage, GooglePublicationPlan } from './google-publication-types.js';
import { googleCellValue } from './google-publication-values.js';
import { buildGooglePublicationPlan } from './google-publication.js';
import { sha256Json } from './json-fingerprint.js';
import { assertPublicationStagePayload } from './publication-payload.js';
import type {
  PublicationActualAssertion,
  PublicationAssertion,
} from './publication-readback-types.js';
import { verifyFinalPublicationActual } from './publication-readback.js';

const TITLES = [
  'Review Queue',
  'On-Hold Review',
  'Evidence Detail',
  'Data Dictionary',
  'Source & Run Notes',
  'Generation Ledger',
  'Run History',
] as const;
type Title = (typeof TITLES)[number];
const REVIEW = [
  'Opportunity Name',
  'Salesforce',
  'Freshness',
  'Needs CSM Review',
  'Reviewer Notes',
  'Copied to Salesforce?',
  'Reviewed By',
  'Reviewed At',
];
const LEDGER = [
  'Run ID',
  'SLA ID',
  'Opportunity ID',
  'Engine Version',
  'Source Cutoff',
  'Generated At',
  'Generated Summary',
  'Summary Hash',
  'Operational Summary',
  'Operational Summary Hash',
  'Publication Status',
];
const HISTORY = [
  'Run ID',
  'Started At (ET)',
  'Expected Active',
  'Expected On Hold',
  'Processed',
  'Blocked Rows',
  'Salesforce',
  'Portal',
  'Fireflies',
  'Linked Billing / Claims',
  'Escalation',
  'Publish Status',
];
interface Fixture {
  workbook: { sheets: Record<Title, unknown[][]> };
  manifest: { runId: string };
  metadata: {
    spreadsheetId: string;
    sheets: { title: Title; sheetId: number; rowCount: number; columnCount: number }[];
  };
  liveState: {
    spreadsheetId: string;
    sheets: { title: Title; sheetId: number; usedRowCount: number; values: unknown[][] }[];
  };
  currentReviewerState: {
    rows: {
      opportunityId: string;
      needsCsmReview?: unknown;
      reviewerNotes?: unknown;
      copiedToSalesforce?: unknown;
      reviewedBy?: unknown;
      reviewedAt?: unknown;
    }[];
  };
}
function fixture(): Fixture {
  const priorLedger = [
    'prior-run',
    'prior-sla',
    'prior-opportunity',
    'old',
    '2026-01-01',
    '2026-01-01',
    'Prior',
    'prior-summary',
    'Prior operational',
    'prior-operational',
    'Published',
  ];
  const currentLedger = [
    'current-run',
    'current-sla',
    'new-opportunity',
    'new',
    '2026-01-02',
    '2026-01-02',
    'Current',
    'current-summary',
    'Current operational',
    'current-operational',
    'Built - Pending Publish',
  ];
  const priorHistory = [
    'prior-run',
    'prior',
    1,
    0,
    1,
    0,
    'ok',
    'ok',
    'ok',
    'ok',
    'ok',
    'Published',
  ];
  const currentHistory = [
    'current-run',
    'current',
    2,
    0,
    2,
    0,
    'ok',
    'ok',
    'ok',
    'ok',
    'ok',
    'Built - Pending Publish',
  ];
  const notes = [
    ['Field', 'Value'],
    ['Last Refresh (ET)', 'prior refresh'],
    ['Run ID', 'prior-run'],
    ['Policy', 'prior'],
  ];
  const sheets: Record<Title, unknown[][]> = {
    'Review Queue': [
      REVIEW,
      [
        'Existing',
        'https://example.test/Opportunity/existingOpportunity/view',
        'Current',
        false,
        'Keep',
        'No',
        'Reviewer',
        '2026-01-01',
      ],
      [
        'New',
        'https://example.test/Opportunity/newOpportunity/view',
        'Missing',
        '',
        '',
        '',
        '',
        '',
      ],
    ],
    'On-Hold Review': [REVIEW],
    'Evidence Detail': [
      ['Opportunity', 'Evidence'],
      ['Existing', 'Synthetic'],
    ],
    'Data Dictionary': [
      ['Column', 'Meaning'],
      ['Synthetic', 'Synthetic'],
    ],
    'Source & Run Notes': [
      ['Field', 'Value'],
      ['Last Refresh (ET)', 'current refresh'],
      ['Run ID', 'current-run'],
      ['Policy', 'current'],
    ],
    'Generation Ledger': [LEDGER, priorLedger, currentLedger],
    'Run History': [HISTORY, currentHistory, priorHistory],
  };
  const byTitle = new Map(Object.entries(sheets));
  return structuredClone<Fixture>({
    workbook: { sheets },
    manifest: { runId: 'current-run' },
    metadata: {
      spreadsheetId: 'synthetic-sheet',
      sheets: TITLES.map((title, index) => ({
        title,
        sheetId: 7000 + index,
        rowCount: title === 'Generation Ledger' ? 2 : 50,
        columnCount: byTitle.get(title)?.[0]?.length ?? 0,
      })),
    },
    liveState: {
      spreadsheetId: 'synthetic-sheet',
      sheets: TITLES.map((title, index) => {
        const values =
          title === 'Generation Ledger'
            ? [LEDGER, priorLedger]
            : title === 'Run History'
              ? [HISTORY, priorHistory]
              : title === 'Source & Run Notes'
                ? notes
                : [];
        return {
          title,
          sheetId: 7000 + index,
          usedRowCount:
            title === 'Review Queue'
              ? 5
              : values.length > 0
                ? values.length
                : (byTitle.get(title)?.length ?? 0),
          values,
        };
      }),
    },
    currentReviewerState: {
      rows: [
        {
          opportunityId: 'existingOpportunity',
          needsCsmReview: false,
          reviewerNotes: 'Keep',
          copiedToSalesforce: 'No',
          reviewedBy: 'Reviewer',
          reviewedAt: '2026-01-01',
        },
      ],
    },
  });
}
function stage(plan: GooglePublicationPlan, id: string): GooglePreparedStage {
  const value = plan.stages.find((entry) => entry.id === id);
  if (value === undefined) throw new Error('Missing synthetic stage');
  return value;
}
function finalRows(input: Fixture): Map<string, unknown[][]> {
  const sheets = structuredClone(input.workbook.sheets);
  const fresh = sheets['Review Queue'][2],
    ledger = sheets['Generation Ledger'][2];
  const currentHistory = sheets['Run History'][1],
    priorHistory = sheets['Run History'][2];
  if (
    fresh === undefined ||
    ledger === undefined ||
    currentHistory === undefined ||
    priorHistory === undefined
  )
    throw new Error('Missing synthetic final rows');
  fresh[3] = false;
  ledger[10] = 'Published';
  currentHistory[11] = 'Published';
  sheets['Run History'] = [HISTORY, priorHistory, currentHistory];
  return new Map(Object.entries(sheets));
}
function finalValues(assertion: PublicationAssertion, rows: unknown[][]): unknown[][] {
  const headers = rows[0] ?? [];
  return Array.from({ length: assertion.rowCount ?? 0 }, (_, offset) => {
    const row = rows.at((assertion.startRowIndex ?? 0) + offset) ?? [];
    return Array.from({ length: assertion.columnCount ?? 0 }, (_, column) => {
      const index = (assertion.startColumnIndex ?? 0) + column;
      return googleCellValue(row.at(index), headers.at(index)).userEnteredValue ?? null;
    });
  });
}
function finalColors(
  assertion: PublicationAssertion,
  rows: unknown[][]
): { rgbColor: { red: number; green: number; blue: number } }[][] {
  const colors = new Map<unknown, string>([
    ['Missing', 'FECACA'],
    ['Stale', 'FED7AA'],
    ['Semi-Stale', 'FEF3C7'],
    ['Current', 'DCFCE7'],
  ]);
  return Array.from({ length: assertion.rowCount ?? 0 }, (_, index) => {
    const hex = colors.get(rows.at(index + 1)?.[2]) ?? 'FFFFFF';
    return [
      {
        rgbColor: {
          red: Math.fround(Number.parseInt(hex.slice(0, 2), 16) / 255),
          green: Math.fround(Number.parseInt(hex.slice(2, 4), 16) / 255),
          blue: Math.fround(Number.parseInt(hex.slice(4, 6), 16) / 255),
        },
      },
    ];
  });
}
function finalAssertion(
  assertion: PublicationAssertion,
  plan: GooglePublicationPlan,
  input: Fixture,
  allRows: ReadonlyMap<string, unknown[][]>
): PublicationActualAssertion {
  const base = {
    id: assertion.id,
    sheetId: assertion.sheetId,
    startRowIndex: assertion.startRowIndex,
    endRowIndex: assertion.endRowIndex,
    startColumnIndex: assertion.startColumnIndex,
    endColumnIndex: assertion.endColumnIndex,
  };
  const rows = allRows.get(assertion.title ?? '') ?? [];
  switch (assertion.kind) {
    case 'values':
      return { ...base, values: finalValues(assertion, rows) };
    case 'text-layout':
      return { ...base, format: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } };
    case 'data-validation':
      return { ...base, rule: { condition: { type: 'BOOLEAN' }, strict: true } };
    case 'basic-filter':
      return {
        ...base,
        basicFilter: {
          range: {
            sheetId: assertion.sheetId,
            startRowIndex: 0,
            endRowIndex: rows.length,
            startColumnIndex: 0,
            endColumnIndex: rows[0]?.length,
          },
        },
      };
    case 'background-color-styles':
      return { ...base, backgroundColorStyles: finalColors(assertion, rows) };
    case 'grid-properties': {
      const metadata = input.metadata.sheets.find((sheet) => sheet.title === assertion.title);
      if (metadata === undefined) throw new Error('Missing synthetic grid');
      return {
        ...base,
        gridProperties: {
          rowCount: Math.max(metadata.rowCount, rows.length),
          columnCount: Math.max(metadata.columnCount, rows[0]?.length ?? 0),
        },
      };
    }
    case 'dimension-pixels': {
      const dimension = plan.stages
        .flatMap((item) => item.payload.requests)
        .flatMap((request) =>
          'updateDimensionProperties' in request ? [request.updateDimensionProperties] : []
        )
        .find(
          (request) =>
            request.range.sheetId === assertion.sheetId &&
            request.range.dimension === assertion.dimension &&
            request.range.startIndex ===
              (assertion.dimension === 'ROWS'
                ? assertion.startRowIndex
                : assertion.startColumnIndex)
        );
      if (dimension === undefined) throw new Error('Missing synthetic dimension');
      return {
        ...base,
        dimension: assertion.dimension,
        pixels: Array<number>(dimension.range.endIndex - dimension.range.startIndex).fill(
          dimension.properties.pixelSize
        ),
      };
    }
    case undefined:
    default:
      throw new Error('Unsupported synthetic final assertion');
  }
}
describe('complete prepared Google publication plan', () => {
  it('selects current-run append rows before narrowing ignored historical entries', () => {
    const input = fixture(),
      expected = buildGooglePublicationPlan(input);
    for (const title of ['Generation Ledger', 'Run History'] as const) {
      const original = new Map(Object.entries(input.workbook.sheets)).get(title) ?? [];
      for (const ignored of [
        42,
        false,
        'prior row',
        { ignored: 'legacy' },
        { 0: 'prior-run', length: 3 },
      ]) {
        const sheets = { ...input.workbook.sheets, [title]: [...original, ignored] };
        expect(buildGooglePublicationPlan({ ...input, workbook: { sheets } })).toEqual(expected);
      }
      for (const consumed of [null, undefined, { 0: 'current-run', length: 3 }]) {
        const sheets = { ...input.workbook.sheets, [title]: [...original, consumed] };
        expect(() => buildGooglePublicationPlan({ ...input, workbook: { sheets } })).toThrow(
          TypeError
        );
      }
    }
    for (const title of [
      'Review Queue',
      'On-Hold Review',
      'Evidence Detail',
      'Data Dictionary',
      'Source & Run Notes',
    ] as const) {
      const original = new Map(Object.entries(input.workbook.sheets)).get(title) ?? [];
      const sheets = {
        ...input.workbook.sheets,
        [title]: [...original, { ignored: 'not actually unused' }],
      };
      expect(() => buildGooglePublicationPlan({ ...input, workbook: { sheets } })).toThrow(
        TypeError
      );
    }
  });
  it('prepares file-bound hashes and reviewer proof without changing the pure plan or performing I/O', () => {
    const plan = buildGooglePublicationPlan(fixture()),
      before = structuredClone(plan);
    const prepared = prepareGooglePublicationArtifacts(plan, '2026-01-02T12:00:00Z');
    expect(prepared.manifest.preparedAt).toBe('2026-01-02T12:00:00Z');
    expect(prepared.manifest.planHash).not.toBe(plan.planHash);
    expect(prepared.reviewerProof.planHash).toBe(prepared.manifest.planHash);
    expect(prepared.manifest.runHistoryLast).toBe(true);
    expect(prepared.manifest.applyStatus).toBe(
      'Not applied - awaiting explicit publication approval'
    );
    expect(JSON.stringify(prepared.summary)).not.toMatch(/existingOpportunity|"Keep"|"Reviewer"/);
    for (const item of prepared.manifest.stages) {
      const payload = prepared.payloads.get(item.file);
      if (payload === undefined) throw new Error('Missing synthetic prepared payload');
      const calls = item.calls.map((call) => {
        const callPayload = prepared.payloads.get(call.file);
        if (callPayload === undefined) throw new Error('Missing synthetic prepared call');
        expect(sha256Json(callPayload)).toBe(call.payloadHash);
        return { file: call.file, payload: callPayload };
      });
      expect(() => assertPublicationStagePayload(item, payload, calls)).not.toThrow();
    }
    expect(plan).toEqual(before);
  });
  it('verifies the durable final workbook and rejects pending ledger or changed presentation', () => {
    const input = fixture(),
      plan = buildGooglePublicationPlan(input),
      rows = finalRows(input);
    const actual = {
      runId: plan.runId,
      spreadsheetId: plan.spreadsheetId,
      assertions: plan.finalAssertions.map((assertion) =>
        finalAssertion(assertion, plan, input, rows)
      ),
    };
    expect(verifyFinalPublicationActual(plan, actual).assertions).toHaveLength(31);
    const stale = structuredClone(actual);
    const ledger = stale.assertions.find(
      (assertion) => assertion.id === 'Generation Ledger:values:2:0:1'
    )?.values?.[0];
    if (ledger === undefined) throw new Error('Missing synthetic ledger assertion');
    ledger[10] = { stringValue: 'Publishing - Awaiting Terminal Marker' };
    expect(() => verifyFinalPublicationActual(plan, stale)).toThrow('Generation Ledger');
    const changed = {
      ...actual,
      assertions: actual.assertions.map((assertion) =>
        assertion.dimension === 'ROWS'
          ? { ...assertion, pixels: assertion.pixels?.map((pixels) => pixels + 1) }
          : assertion
      ),
    };
    expect(() => verifyFinalPublicationActual(plan, changed)).toThrow('pixels');
  });
  it('preserves all nine stages, precise clears, ledger append and final durable assertions', () => {
    const input = fixture(),
      before = structuredClone(input),
      plan = buildGooglePublicationPlan(input);
    expect(plan.stages.map((entry) => entry.id)).toEqual([
      '01-capacity',
      '02-review-queue',
      '03-on-hold-review',
      '04-evidence-detail',
      '05-data-dictionary',
      '06-source-run-notes',
      '07-generation-ledger-append',
      '08-terminal-marker',
      '09-run-history',
    ]);
    expect(plan.finalAssertions).toHaveLength(31);
    const queue = stage(plan, '02-review-queue');
    expect(queue.payload.requests.find((request) => 'repeatCell' in request)).toEqual({
      repeatCell: {
        range: {
          sheetId: 7000,
          startRowIndex: 3,
          endRowIndex: 5,
          startColumnIndex: 0,
          endColumnIndex: 8,
        },
        cell: {},
        fields: 'userEnteredValue',
      },
    });
    expect(stage(plan, '01-capacity').payload.requests).toEqual([
      {
        updateSheetProperties: {
          properties: { sheetId: 7005, gridProperties: { rowCount: 3 } },
          fields: 'gridProperties.rowCount',
        },
      },
    ]);
    const ledger = stage(plan, '07-generation-ledger-append');
    expect(ledger.payload.requests[0]).toMatchObject({
      updateCells: { range: { startRowIndex: 2, endRowIndex: 3 } },
    });
    expect(JSON.stringify(ledger.payload)).toContain('Publishing - Awaiting Terminal Marker');
    expect(queue.assertions[0]?.blankBooleanCellsAsFalse).toEqual([[2, 3]]);
    expect(
      stage(plan, '03-on-hold-review').payload.requests.some(
        (request) => 'setDataValidation' in request
      )
    ).toBe(false);
    for (const [stageId, assertionId] of [
      ['06-source-run-notes', 'Source & Run Notes:values:0:0:4'],
      ['07-generation-ledger-append', 'Generation Ledger:values:2:0:1'],
    ]) {
      if (stageId === undefined) throw new Error('Missing synthetic stage ID');
      expect(
        stage(plan, stageId).assertions.find((a) => a.id === assertionId)?.expectedHash
      ).not.toBe(plan.finalAssertions.find((a) => a.id === assertionId)?.expectedHash);
    }
    expect(input).toEqual(before);
    expect(buildGooglePublicationPlan({ ...input, workbook: input.workbook.sheets })).toEqual(plan);
  });
  it('binds exact reviewer payloads across moves, new rows and removed rows', () => {
    const input = fixture(),
      rows = input.workbook.sheets['Review Queue'];
    const existing = rows[1],
      fresh = rows[2];
    if (existing === undefined || fresh === undefined) throw new Error('Missing synthetic row');
    input.workbook.sheets['Review Queue'] = [REVIEW, fresh];
    input.workbook.sheets['On-Hold Review'] = [REVIEW, existing];
    input.currentReviewerState.rows.push({
      opportunityId: 'removed',
      reviewerNotes: 'Not in cohort',
    });
    const plan = buildGooglePublicationPlan(input);
    expect(plan.reviewerPreservation.counts).toEqual({
      rows: 2,
      cells: 10,
      blank: 5,
      unchecked: 1,
      populated: 4,
      newRows: 1,
      removedRows: 1,
    });
    expect(plan.reviewerPreservation.currentReviewerStateHash).toBe(
      sha256Json(input.currentReviewerState)
    );
    expect(JSON.stringify(plan.reviewerPreservation)).not.toMatch(
      /existingOpportunity|Not in cohort|"Keep"/
    );
    const current = input.currentReviewerState.rows[0];
    if (current === undefined) throw new Error('Missing reviewer');
    current.needsCsmReview = true;
    expect(() => buildGooglePublicationPlan(input)).toThrow('reviewer-owned');
    existing[3] = true;
    expect(buildGooglePublicationPlan(input).reviewerPreservation.counts.populated).toBe(5);
    fresh[4] = 'Invented note';
    expect(() => buildGooglePublicationPlan(input)).toThrow('brand-new');
  });
  it('retains marker labels despite row reordering and does not format historical audit rows', () => {
    const input = fixture();
    input.workbook.sheets['Source & Run Notes'] = [
      ['Field', 'Value'],
      ['Policy', 'current'],
      ['Run ID', 'current-run'],
      ['Last Refresh (ET)', 'current refresh'],
    ];
    const plan = buildGooglePublicationPlan(input);
    const notes = stage(plan, '06-source-run-notes').payload.requests.flatMap((request) =>
      'updateCells' in request ? request.updateCells.rows : []
    );
    expect(notes.map((row) => row.values.map((cell) => cell.userEnteredValue))).toEqual([
      [{ stringValue: 'Field' }, { stringValue: 'Value' }],
      [{ stringValue: 'Policy' }, { stringValue: 'current' }],
      [{ stringValue: 'Run ID' }, { stringValue: 'prior-run' }],
      [{ stringValue: 'Last Refresh (ET)' }, { stringValue: 'prior refresh' }],
    ]);
    for (const request of stage(plan, '09-run-history').payload.requests) {
      if ('updateCells' in request) expect(request.updateCells.range.startRowIndex).toBe(2);
      if ('repeatCell' in request) expect(request.repeatCell.range.startRowIndex).toBe(2);
      if ('updateDimensionProperties' in request)
        expect(request.updateDimensionProperties.range).toMatchObject({
          dimension: 'ROWS',
          startIndex: 2,
        });
    }
  });
  it('budgets expanded Unicode payloads and reconstructs exact stage calls', () => {
    const input = fixture();
    input.workbook.sheets['Evidence Detail'] = [
      ['Opportunity', 'Evidence'],
      ...Array.from({ length: 40 }, (_, index) => [`Synthetic ${String(index)}`, '😀é'.repeat(80)]),
    ];
    const plan = buildGooglePublicationPlan({ ...input, maxRequestBytes: 5000 });
    const evidence = stage(plan, '04-evidence-detail');
    const calls = splitStageCalls(evidence, 5000);
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls)
      expect(Buffer.byteLength(JSON.stringify(call.payload, null, 2))).toBeLessThanOrEqual(5000);
    const saved = calls.map((call) => ({
      file: `call-${String(call.call)}.json`,
      payloadHash: call.payloadHash,
    }));
    expect(() =>
      assertPublicationStagePayload(
        { ...evidence, calls: saved },
        evidence.payload,
        calls.map((call) => ({ file: `call-${String(call.call)}.json`, payload: call.payload }))
      )
    ).not.toThrow();
    expect(calls.flatMap((call) => call.payload.requests)).toEqual(evidence.payload.requests);
    const row = input.workbook.sheets['Evidence Detail'][1];
    if (row === undefined) throw new Error('Missing synthetic evidence');
    row[1] = '😀'.repeat(3000);
    expect(() => buildGooglePublicationPlan({ ...input, maxRequestBytes: 5000 })).toThrow('size');
    row[1] = 'x'.repeat(50_001);
    expect(() => buildGooglePublicationPlan(input)).toThrow('50,000');
    expect(() => splitStageCalls(evidence, 1)).toThrow('bounded call size');
    expect(splitStageCalls(publicationStage('empty', [], []))).toEqual([]);
  });
  it('resumes exact pending appends but rejects conflicting, duplicate and incomplete audit state', () => {
    const input = fixture(),
      ledger = input.liveState.sheets.find((sheet) => sheet.title === 'Generation Ledger');
    const desired = input.workbook.sheets['Generation Ledger'][2];
    if (ledger === undefined || desired === undefined) throw new Error('Missing synthetic ledger');
    const pending = [...desired];
    pending[10] = 'Publishing - Awaiting Terminal Marker';
    ledger.values.push(pending);
    ledger.usedRowCount = 3;
    expect(
      stage(buildGooglePublicationPlan(input), '07-generation-ledger-append').alreadySatisfied
    ).toBe(true);
    pending[10] = 'Published';
    expect(
      stage(buildGooglePublicationPlan(input), '08-terminal-marker').payload.requests.every(
        (request) => !('updateCells' in request) || request.updateCells.range.sheetId !== 7005
      )
    ).toBe(true);
    pending[10] = 'Unknown';
    expect(() => buildGooglePublicationPlan(input)).toThrow('non-idempotent');
    pending[10] = 'Published';
    ledger.values.push([...pending]);
    ledger.usedRowCount++;
    expect(() => buildGooglePublicationPlan(input)).toThrow('conflicting row');
    ledger.values.pop();
    ledger.usedRowCount++;
    expect(() => buildGooglePublicationPlan(input)).toThrow('exact used extent');
  });
  it('enforces original input identity, headers, markers and reviewer proof failures', () => {
    const mutations: ((value: Fixture) => void)[] = [
      (value): void => {
        value.liveState.spreadsheetId = 'wrong';
      },
      (value): void => {
        value.metadata.sheets.splice(0, 1);
      },
      (value): void => {
        value.workbook.sheets['Review Queue'] = [];
      },
      (value): void => {
        value.workbook.sheets['Review Queue'] = value.workbook.sheets['Review Queue'].map((row) =>
          row.filter((_, index) => index !== 2)
        );
      },
      (value): void => {
        value.workbook.sheets['Review Queue'][1]?.splice(1, 1, 'wrong');
      },
      (value): void => {
        value.workbook.sheets['Generation Ledger'][0]?.splice(0, 1, 'wrong');
      },
      (value): void => {
        value.workbook.sheets['Source & Run Notes'][0]?.splice(0, 1, 'wrong');
      },
      (value): void => {
        const notes = value.liveState.sheets.find((sheet) => sheet.title === 'Source & Run Notes');
        notes?.values.push(['Run ID', 'duplicate']);
        if (notes !== undefined) notes.usedRowCount++;
      },
    ];
    for (const mutate of mutations) {
      const value = fixture();
      mutate(value);
      expect(() => buildGooglePublicationPlan(value)).toThrow();
    }
    const input = fixture(),
      plan = buildGooglePublicationPlan(input);
    expect(() =>
      reviewerPreservationProof(
        input.workbook.sheets,
        plan.stages.map((item) => ({ ...item, payload: { ...item.payload, requests: [] } })),
        input.currentReviewerState
      )
    ).toThrow('preservation evidence');
  });
  it('preserves exact scalar types, blanks, formulas and the literal UTF-16 cell bound', () => {
    expect(googleCellValue('https://example.test/Opportunity/id/view', 'Salesforce')).toEqual({
      userEnteredValue: {
        formulaValue: '=HYPERLINK("https://example.test/Opportunity/id/view","Open")',
      },
    });
    expect(googleCellValue('=literal', 'Evidence')).toEqual({
      userEnteredValue: { stringValue: '=literal' },
    });
    expect(googleCellValue(false)).toEqual({ userEnteredValue: { boolValue: false } });
    expect(googleCellValue(0)).toEqual({ userEnteredValue: { numberValue: 0 } });
    expect(googleCellValue(Number.POSITIVE_INFINITY)).toEqual({
      userEnteredValue: { stringValue: 'Infinity' },
    });
    expect(googleCellValue(null)).toEqual({});
    expect(googleCellValue(undefined)).toEqual({});
    expect(googleCellValue('')).toEqual({});
    expect(() => googleCellValue('😀'.repeat(25_000))).not.toThrow();
    expect(() => googleCellValue('😀'.repeat(25_001))).toThrow('50,000');
    expect(
      valuesAssertion({
        title: 'test',
        sheetId: 1,
        startRowIndex: 0,
        values: [[false, 0]],
        preparedValues: [['', 0]],
      }).blankBooleanCellsAsFalse
    ).toEqual([[0, 0]]);
    expect(
      clearTail({ title: 'test', sheetId: 1, startRowIndex: 2, endRowIndex: 2, columnCount: 3 })
    ).toEqual({ requests: [], assertions: [] });
    expect(updateRequests({ title: 'test', sheetId: 1, rows: [], maxBytes: 100 })).toEqual({
      requests: [],
      assertions: [],
    });
    const append = appendOnlyPlan({
      title: 'test',
      runId: 'current',
      desiredRows: [
        ['Run ID', 'Status'],
        ['current', 'Draft'],
      ],
      liveValues: [],
      statusIndex: 1,
      pendingStatus: 'Pending',
    });
    expect(append.appendStart).toBe(1);
    expect(
      finalizeRequests({
        title: 'test',
        sheetId: 1,
        statusIndex: 1,
        rowsToFinalize: append.rowsToFinalize,
      }).requests
    ).toHaveLength(1);
  });
});
