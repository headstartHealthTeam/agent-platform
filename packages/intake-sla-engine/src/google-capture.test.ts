import { GoogleSheetsGridReader } from '@headstart-health/google-sheets-data';
import { describe, expect, it } from 'vitest';

import { googleAssertionCapture } from './google-assertion-capture.js';
import type {
  GoogleAssertionCaptureInput,
  GoogleStateCaptureInput,
} from './google-capture-types.js';
import {
  GOVERNED_SHEETS,
  googleEnteredScalar,
  normalizeReviewerBlanks,
} from './google-capture-values.js';
import type { GoogleEnteredScalar } from './google-capture-values.js';
import { captureGooglePublicationState } from './google-state-capture.js';
import { sha256Json } from './json-fingerprint.js';
import type { PublicationAssertion } from './publication-readback-types.js';
import { verifyPublicationStageActual } from './publication-readback.js';

const HEADERS = [
  'Opportunity Name',
  'Salesforce',
  'Needs CSM Review',
  'Reviewer Notes',
  'Copied to Salesforce?',
  'Reviewed By',
  'Reviewed At',
];
const CAPTURED = '2026-01-02T00:00:00Z';
function stateValues(title: string): GoogleEnteredScalar[][] {
  if (title === 'Review Queue')
    return [
      HEADERS,
      [
        'Synthetic',
        'https://example.test/Opportunity/synthetic/view',
        false,
        'Keep',
        'No',
        'Reviewer',
        '2026-01-01',
      ],
    ];
  if (title === 'On-Hold Review') return [HEADERS];
  if (title === 'Source & Run Notes')
    return [
      ['Field', 'Value'],
      ['Run ID', 'prior'],
      ['Last Refresh (ET)', 'prior time'],
    ];
  if (title === 'Run History') return [['Run ID'], ['prior']];
  return [['Header']];
}
function stateFixture(): GoogleStateCaptureInput {
  return {
    version: 1,
    spreadsheetId: 'synthetic-sheet',
    capturedAt: CAPTURED,
    valueRenderOption: 'USER_ENTERED',
    extentsVerified: true,
    concurrency: {
      currentRunId: 'current',
      checkedAt: CAPTURED,
      conflict: false,
      operatorVerified: true,
    },
    sheets: GOVERNED_SHEETS.map((title, index) => ({
      title,
      sheetId: index,
      rowCount: 100,
      columnCount: 10,
      usedRowCount: stateValues(title).length,
      rangeComplete: true,
      values: stateValues(title).map((row) =>
        row.map((value) =>
          typeof value === 'boolean' ? { boolValue: value } : { stringValue: value }
        )
      ),
    })),
  };
}
function gridFixture(): { expected: PublicationAssertion; capture: GoogleAssertionCaptureInput } {
  const format = { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' };
  const expected = {
    id: 'layout',
    kind: 'text-layout',
    sheetId: 1,
    startRowIndex: 3,
    endRowIndex: 5,
    startColumnIndex: 2,
    endColumnIndex: 3,
    expectedHash: sha256Json(format),
  };
  return {
    expected,
    capture: {
      spreadsheetId: 'synthetic',
      complete: true,
      range: expected,
      response: {
        spreadsheetId: 'synthetic',
        sheets: [
          {
            properties: { sheetId: 1 },
            data: [
              {
                startRow: 3,
                startColumn: 2,
                rowData: [
                  {
                    values: [
                      {
                        userEnteredFormat: format,
                        userEnteredValue: { formulaValue: '=1' },
                        dataValidation: { condition: { type: 'BOOLEAN' }, showCustomUi: true },
                      },
                    ],
                  },
                  {
                    values: [
                      {
                        userEnteredFormat: { ...format },
                        dataValidation: { condition: { type: 'BOOLEAN' }, showCustomUi: false },
                      },
                    ],
                  },
                ],
                rowMetadata: [{ pixelSize: 240 }, { pixelSize: 240 }],
                columnMetadata: [{ pixelSize: 420 }],
              },
            ],
          },
        ],
      },
    },
  };
}
describe('Google captured publication evidence', () => {
  it('retains exact property indexing and own-undefined coordinate comparison', () => {
    const capture = {
      spreadsheetId: 'synthetic',
      complete: true,
      response: {
        spreadsheetId: 'synthetic',
        sheets: [
          {
            properties: { sheetId: 1 },
            data: [
              {
                startRow: 0,
                startColumn: 0,
                rowData: [
                  {
                    values: [
                      { userEnteredValue: { stringValue: 'first' } },
                      { userEnteredValue: { stringValue: 'second' } },
                    ],
                  },
                ],
                rowMetadata: [{ pixelSize: 72 }],
                columnMetadata: [{ pixelSize: 72 }, { pixelSize: 240 }],
              },
            ],
          },
        ],
      },
    };
    for (const coordinates of [
      { startRowIndex: 0.5, endRowIndex: 1.5, startColumnIndex: 0, endColumnIndex: 1 },
      { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0.5, endColumnIndex: 1.5 },
    ]) {
      const expected = {
        id: 'fractional',
        kind: 'values',
        sheetId: 1,
        rowCount: 1,
        columnCount: 1,
        ...coordinates,
      };
      expect(googleAssertionCapture(expected, { ...capture, range: expected }).values).toEqual([
        [null],
      ]);
      const dimension = coordinates.startRowIndex === 0 ? 'COLUMNS' : 'ROWS';
      expect(() =>
        googleAssertionCapture(
          { ...expected, kind: 'dimension-pixels', dimension },
          { ...capture, range: expected }
        )
      ).toThrow('dimension capture');
    }
    const expected = {
      id: 'undefined',
      kind: 'grid-properties',
      sheetId: undefined,
      startRowIndex: undefined,
    };
    const response = {
      spreadsheetId: 'synthetic',
      sheets: [{ properties: { sheetId: undefined, gridProperties: { rowCount: 10 } } }],
    };
    for (const range of [undefined, null])
      expect(
        googleAssertionCapture(expected, {
          spreadsheetId: 'synthetic',
          complete: true,
          range,
          response,
        })
      ).toEqual({
        id: expected.id,
        sheetId: undefined,
        startRowIndex: undefined,
        gridProperties: { rowCount: 10 },
      });
  });
  it('preserves scalar types, formulas, whitespace and raw metadata while normalizing only reviewer blanks', () => {
    const cases: [unknown, GoogleEnteredScalar][] = [
      [undefined, null],
      [null, null],
      [{}, null],
      [{ stringValue: '' }, null],
      [{ boolValue: false }, false],
      [{ numberValue: 0 }, 0],
      [{ formulaValue: '=IF(TRUE,"",1)' }, '=IF(TRUE,"",1)'],
      [{ stringValue: ' ' }, ' '],
    ];
    for (const [input, value] of cases) expect(googleEnteredScalar(input)).toBe(value);
    for (const value of [
      false,
      [],
      { boolValue: 'false' },
      { stringValue: 'x', formulaValue: '=1' },
      { numberValue: NaN },
      { unknown: 'x' },
    ])
      expect(() => googleEnteredScalar(value)).toThrow();
    const input = {
      capturedAt: CAPTURED,
      extra: 'artifact-metadata',
      rows: [
        {
          opportunityId: 'synthetic',
          needsCsmReview: false,
          reviewerNotes: '',
          reviewedBy: ' ',
          extra: { metadata: 'retained' },
        },
      ],
    };
    const output = normalizeReviewerBlanks(input);
    expect(output.capturedAt).toBe(CAPTURED);
    expect(output.extra).toBe(input.extra);
    expect(output.rows[0]?.extra).toBe(input.rows[0]?.extra);
    expect(output.rows[0]).toMatchObject({
      needsCsmReview: false,
      reviewerNotes: null,
      reviewedBy: ' ',
      reviewedAt: null,
    });
    expect(input.rows[0]?.reviewerNotes).toBe('');
  });
  it('composes shared provider grid reads with exact Intake capture and readback', async () => {
    const { expected, capture } = gridFixture();
    const response = {
      ...capture.response,
      sheets: capture.response?.sheets?.map((sheet) => ({
        ...sheet,
        properties: { ...sheet.properties, title: 'Synthetic' },
      })),
    };
    const reader = new GoogleSheetsGridReader({ request: async (): Promise<unknown> => response });
    const snapshot = await reader.readGrid({
      spreadsheetId: 'synthetic',
      sheet: { sheetId: 1, title: 'Synthetic' },
      fields: 'cells',
      range: { startRowIndex: 3, endRowIndex: 5, startColumnIndex: 2, endColumnIndex: 3 },
    });
    const actual = googleAssertionCapture(expected, { ...capture, response: snapshot });
    expect(
      verifyPublicationStageActual({ assertions: [expected] }, { assertions: [actual] })
    ).toEqual([{ id: expected.id, actualHash: expected.expectedHash }]);
    const values = googleAssertionCapture({ ...expected, kind: 'values' }, capture);
    expect(values.values).toEqual([[{ formulaValue: '=1' }], [null]]);
    expect(googleAssertionCapture({ ...expected, kind: 'data-validation' }, capture).rule).toEqual({
      condition: { type: 'BOOLEAN' },
    });
    for (const [dimension, pixels] of [
      ['ROWS', [240, 240]],
      ['COLUMNS', [420]],
    ] as const) {
      const assertion = {
        ...expected,
        kind: 'dimension-pixels',
        dimension,
        expectedHash: sha256Json(pixels),
      };
      expect(
        verifyPublicationStageActual(
          { assertions: [assertion] },
          { assertions: [googleAssertionCapture(assertion, capture)] }
        )
      ).toHaveLength(1);
    }
  });
  it('rejects incomplete, overlapping, mismatched or absent grid data without accepting authored hashes', () => {
    const { expected, capture } = gridFixture();
    expect(() => googleAssertionCapture(expected, { ...capture, complete: false })).toThrow(
      'incomplete'
    );
    expect(() => googleAssertionCapture({ ...expected, sheetId: 2 }, capture)).toThrow(
      'wrong sheet identity'
    );
    expect(() => googleAssertionCapture(expected, { ...capture, range: {} })).toThrow(
      'range mismatch'
    );
    const sheet = capture.response?.sheets?.[0] ?? {};
    const first = sheet.data?.[0] ?? {};
    const changed = (data: typeof sheet.data): GoogleAssertionCaptureInput => ({
      ...capture,
      response: { ...capture.response, sheets: [{ ...sheet, data }] },
    });
    expect(() => googleAssertionCapture(expected, changed(undefined))).toThrow(
      'grid data was not captured'
    );
    expect(() => googleAssertionCapture(expected, changed([first, first]))).toThrow('Overlapping');
    expect(() =>
      googleAssertionCapture(
        { ...expected, kind: 'dimension-pixels', dimension: 'ROWS' },
        changed([{ ...first, rowMetadata: [] }])
      )
    ).toThrow('dimension capture');
    expect(() =>
      googleAssertionCapture({ ...expected, kind: 'dimension-pixels', dimension: 'OTHER' }, capture)
    ).toThrow('Invalid dimension');
    expect(() =>
      googleAssertionCapture(
        { ...expected, kind: 'text-layout' },
        changed([{ ...first, rowData: [] }])
      )
    ).not.toThrow();
    expect(() =>
      googleAssertionCapture(
        { ...expected, kind: 'data-validation' },
        changed([{ ...first, rowData: [] }])
      )
    ).toThrow('validation is missing');
    expect(() => googleAssertionCapture({ ...expected, kind: 'basic-filter' }, capture)).toThrow(
      'basic-filter metadata'
    );
    expect(() => googleAssertionCapture({ ...expected, kind: 'unknown' }, capture)).toThrow(
      'Unsupported'
    );
    const metadata = {
      ...capture,
      response: {
        ...capture.response,
        sheets: [
          {
            properties: { sheetId: 1, gridProperties: { rowCount: 100, columnCount: 10 } },
            basicFilter: { range: { sheetId: 1 } },
          },
        ],
      },
    };
    expect(
      googleAssertionCapture({ ...expected, kind: 'grid-properties' }, metadata).gridProperties
    ).toEqual({ rowCount: 100, columnCount: 10 });
    expect(
      googleAssertionCapture({ ...expected, kind: 'basic-filter' }, metadata).basicFilter
    ).toEqual({ range: { sheetId: 1 } });
  });
  it('preserves full governed state and independent concurrency under unchanged-file revalidation', () => {
    const capture = stateFixture();
    const result = captureGooglePublicationState(capture, 'synthetic-sheet', 'current');
    expect(result.reviewer.rows[0]).toMatchObject({
      opportunityId: 'synthetic',
      needsCsmReview: false,
      reviewerNotes: 'Keep',
    });
    expect(result.competing.conflict).toBe(false);
    expect(result.metadata.captureHash).toBe(sha256Json(capture));
    const revalidation = {
      checkedAt: '2026-01-02T03:00:00Z',
      response: {
        isError: false,
        structuredContent: {
          id: 'synthetic-sheet',
          mime_type: 'application/vnd.google-apps.spreadsheet',
          modified_time: '2026-01-01T23:00:00Z',
        },
      },
      concurrency: {
        currentRunId: 'current',
        checkedAt: '2026-01-02T03:00:00Z',
        conflict: false,
        operatorVerified: true,
      },
    };
    const refreshed = captureGooglePublicationState(
      { ...capture, revalidation },
      'synthetic-sheet',
      'current'
    );
    expect(refreshed.state.capturedAt).toBe(CAPTURED);
    expect(refreshed.state.revalidatedAt).toBe(revalidation.checkedAt);
    expect(refreshed.state.revalidationHash).toBe(sha256Json(revalidation));
    expect(refreshed.reviewer.rows).toEqual(result.reviewer.rows);
    for (const change of [
      { id: 'wrong' },
      { modified_time: '2026-01-02T00:00:01Z' },
      { modified_time: undefined },
    ])
      expect(() =>
        captureGooglePublicationState(
          {
            ...capture,
            revalidation: {
              ...revalidation,
              response: {
                ...revalidation.response,
                structuredContent: { ...revalidation.response.structuredContent, ...change },
              },
            },
          },
          'synthetic-sheet',
          'current'
        )
      ).toThrow('unchanged-file proof');
    expect(() =>
      captureGooglePublicationState(
        {
          ...capture,
          revalidation: {
            ...revalidation,
            concurrency: { ...revalidation.concurrency, operatorVerified: false },
          },
        },
        'synthetic-sheet',
        'current'
      )
    ).toThrow('competing-run');
    const resumed = { ...capture, concurrency: { ...capture.concurrency, currentRunId: 'prior' } };
    expect(
      captureGooglePublicationState(resumed, 'synthetic-sheet', 'prior').competing.conflict
    ).toBe(true);
    expect(
      captureGooglePublicationState(
        { ...resumed, concurrency: { ...resumed.concurrency, exactResumeVerified: true } },
        'synthetic-sheet',
        'prior'
      ).competing.conflict
    ).toBe(false);
  });
  it('rejects missing extents, reviewer formulas, history ambiguity and missing independent checks', () => {
    const capture = stateFixture();
    const sheets = capture.sheets ?? [];
    for (const invalid of [
      undefined,
      {},
      { ...capture, spreadsheetId: 'wrong' },
      { ...capture, valueRenderOption: 'FORMATTED_VALUE' },
      { ...capture, sheets: sheets.slice(1) },
      { ...capture, sheets: [...sheets, ...sheets] },
      { ...capture, concurrency: undefined },
      {
        ...capture,
        sheets: sheets.map((sheet, index) => (index === 0 ? { ...sheet, usedRowCount: 3 } : sheet)),
      },
    ])
      expect(() => captureGooglePublicationState(invalid, 'synthetic-sheet', 'current')).toThrow();
    const withValues = (title: string, values: unknown[][]): GoogleStateCaptureInput => ({
      ...capture,
      sheets: sheets.map((sheet) =>
        sheet.title === title ? { ...sheet, values, usedRowCount: values.length } : sheet
      ),
    });
    expect(() =>
      captureGooglePublicationState(
        withValues('Run History', [
          [{ stringValue: 'Run ID' }],
          [{ stringValue: 'same' }],
          [{ stringValue: 'same' }],
        ]),
        'synthetic-sheet',
        'current'
      )
    ).toThrow('Run History IDs');
    expect(() =>
      captureGooglePublicationState(
        withValues('Source & Run Notes', [[{ stringValue: 'Field' }]]),
        'synthetic-sheet',
        'current'
      )
    ).toThrow('live marker');
    expect(() =>
      captureGooglePublicationState(
        withValues('Review Queue', [[{ stringValue: 'bad header' }]]),
        'synthetic-sheet',
        'current'
      )
    ).toThrow('headers are incomplete');
    const rows = sheets[0]?.values?.map((row) => [...row]) ?? [];
    const data = rows[1];
    if (data === undefined) throw new Error('Missing synthetic data');
    data.splice(3, 1, { formulaValue: '=1' });
    expect(() =>
      captureGooglePublicationState(withValues('Review Queue', rows), 'synthetic-sheet', 'current')
    ).toThrow('Formula-valued reviewer fields');
    data.splice(3, 1, { stringValue: '' });
    data.splice(1, 1, { stringValue: 'wrong identity' });
    expect(() =>
      captureGooglePublicationState(withValues('Review Queue', rows), 'synthetic-sheet', 'current')
    ).toThrow('Reviewer identity');
  });
});
