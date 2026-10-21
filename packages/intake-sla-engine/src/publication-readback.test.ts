import { describe, expect, expectTypeOf, it } from 'vitest';

import { sha256Json } from './json-fingerprint.js';
import { assertPublicationGateFreshness } from './publication-freshness.js';
import {
  assertPublicationGateBinding,
  assertPublicationStagePayload,
} from './publication-payload.js';
import { publicationPlanHash } from './publication-plan.js';
import type {
  PublicationActual,
  PublicationActualAssertion,
  PublicationAssertion,
  PublicationManifest,
  PublicationObservations,
  PublicationStage,
  PublicationStageObservation,
} from './publication-readback-types.js';
import {
  evaluatePublicationReadback,
  nextPublicationStage,
  recordPublicationStageReadback,
  verifyFinalPublicationActual,
  verifyPublicationStageActual,
} from './publication-readback.js';

const payload = { requests: [{ synthetic: true }] };
const valueAssertion: PublicationAssertion = {
  id: 'values',
  kind: 'values',
  sheetId: 1,
  startRowIndex: 0,
  endRowIndex: 2,
  startColumnIndex: 0,
  endColumnIndex: 2,
  rowCount: 2,
  columnCount: 2,
  expectedHash: sha256Json([
    [{ stringValue: 'exact' }, null],
    [null, null],
  ]),
};
function fixture(): {
  manifest: PublicationManifest;
  observations: PublicationObservations;
  actual: PublicationActual;
} {
  const stages = [
    { id: '01-capacity', alreadySatisfied: true },
    {
      id: '02-data',
      payloadHash: sha256Json(payload),
      assertions: [valueAssertion],
    },
  ];
  const manifest = {
    runId: 'synthetic-run',
    spreadsheetId: 'synthetic-sheet',
    stages,
    finalAssertions: [valueAssertion],
    planHash: publicationPlanHash(stages, [valueAssertion]),
  };
  return {
    manifest,
    observations: {
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      stages: [],
    },
    actual: {
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      assertions: [
        {
          id: valueAssertion.id,
          sheetId: 1,
          startRowIndex: 0,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: 2,
          values: [[{ stringValue: 'exact' }]],
        },
      ],
    },
  };
}
function receipt(change: Partial<PublicationStageObservation> = {}): PublicationStageObservation {
  return {
    id: '02-data',
    payloadHash: sha256Json(payload),
    captureVersion: 1,
    evidenceHash: 'a'.repeat(64),
    assertions: [{ id: 'values', actualHash: valueAssertion.expectedHash }],
    ...change,
  };
}
function verify(expected: PublicationAssertion, actual: PublicationActualAssertion): void {
  expect(
    verifyPublicationStageActual({ assertions: [expected] }, { assertions: [actual] })
  ).toEqual([{ id: expected.id, actualHash: expected.expectedHash }]);
}
describe('exact stage and final publication readback', () => {
  it('retains the caller stage subtype and exact object for command file loading', () => {
    const stages = [
      { id: 'files', file: 'stage.json', calls: [{ file: 'call.json', payloadHash: 'hash' }] },
    ];
    const manifest = {
      runId: 'run',
      spreadsheetId: 'sheet',
      stages,
      planHash: publicationPlanHash(stages),
    };
    const next = nextPublicationStage(manifest, {
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
    });
    expectTypeOf(next.stage?.file).toEqualTypeOf<string | undefined>();
    expectTypeOf(next.stage?.calls[0]?.file).toEqualTypeOf<string | undefined>();
    expect(next.stage).toBe(stages[0]);
  });
  it('advances only the next stage and preserves exact evidence hashes', () => {
    const { manifest, observations, actual } = fixture();
    expect(nextPublicationStage(manifest, observations).stage?.id).toBe('02-data');
    const result = recordPublicationStageReadback({
      manifest,
      observations,
      stageId: '02-data',
      appliedPayload: payload,
      actual,
      verifiedAt: '2026-01-01T00:00:00Z',
    });
    expect(result.stages).toEqual([
      {
        id: '02-data',
        payloadHash: sha256Json(payload),
        verifiedAt: '2026-01-01T00:00:00Z',
        captureVersion: 1,
        evidenceHash: sha256Json(actual),
        assertions: [{ id: 'values', actualHash: valueAssertion.expectedHash }],
      },
    ]);
    expect(evaluatePublicationReadback(manifest, result)).toMatchObject({
      complete: true,
      publicationStatus: 'Published',
      nextStage: null,
    });
    expect(nextPublicationStage(manifest, result)).toEqual({ complete: true, stage: null });
    expect(verifyFinalPublicationActual(manifest, actual)).toEqual({
      captureVersion: 1,
      evidenceHash: sha256Json(actual),
      assertions: [{ id: 'values', actualHash: valueAssertion.expectedHash }],
    });
    expect(() =>
      recordPublicationStageReadback({
        manifest,
        observations: result,
        stageId: '02-data',
        appliedPayload: payload,
        actual,
      })
    ).toThrow('already complete');
    expect(() =>
      recordPublicationStageReadback({
        manifest,
        observations,
        stageId: 'wrong',
        appliedPayload: payload,
        actual,
      })
    ).toThrow('Expected readback for');
    expect(() =>
      recordPublicationStageReadback({
        manifest,
        observations,
        stageId: '02-data',
        appliedPayload: {},
        actual,
      })
    ).toThrow('Applied publication payload');
    expect(() =>
      recordPublicationStageReadback({
        manifest,
        observations,
        stageId: '02-data',
        appliedPayload: payload,
        actual: {
          assertions: [
            {
              id: 'values',
              sheetId: 1,
              startRowIndex: 0,
              endRowIndex: 2,
              startColumnIndex: 0,
              endColumnIndex: 2,
            },
          ],
        },
      })
    ).toThrow('requires actual values');
  });
  it('rejects wrong bindings, duplicate/unknown observations, drift and out-of-order resumes', () => {
    const { manifest, observations } = fixture();
    const changes: [Partial<PublicationObservations>, string][] = [
      [{ spreadsheetId: 'wrong' }, 'different spreadsheet'],
      [{ runId: 'wrong' }, 'different run'],
      [{ planHash: 'wrong' }, 'different prepared plan'],
      [{ stages: [receipt(), receipt()] }, 'duplicate stage'],
      [{ stages: [receipt({ id: 'unknown' })] }, 'unknown stages'],
      [{ stages: [receipt({ payloadHash: 'wrong' })] }, 'payload hash mismatch'],
      [{ stages: [receipt({ captureVersion: 0 })] }, 'captured live evidence'],
      [{ stages: [receipt({ evidenceHash: undefined })] }, 'captured live evidence'],
      [{ stages: [receipt({ assertions: [] })] }, 'readback mismatch'],
    ];
    for (const [change, error] of changes)
      expect(() => evaluatePublicationReadback(manifest, { ...observations, ...change })).toThrow(
        error
      );
    expect(() =>
      evaluatePublicationReadback({ ...manifest, planHash: 'bad' }, observations)
    ).toThrow('manifest plan hash');
    expect(() => evaluatePublicationReadback(manifest)).toThrow('different spreadsheet');
    expect(() => nextPublicationStage(manifest)).toThrow('different spreadsheet');
    const stages = [...manifest.stages, { id: '09-history' }];
    const planHash = publicationPlanHash(stages, manifest.finalAssertions);
    expect(() =>
      evaluatePublicationReadback(
        { ...manifest, stages, planHash },
        { ...observations, planHash, stages: [receipt({ id: '09-history' })] }
      )
    ).toThrow('out of order');
    expect(
      evaluatePublicationReadback(manifest, { ...observations, stages: [receipt()] }).stages.at(-1)
    ).toEqual({
      id: '02-data',
      verified: true,
      verifiedAt: null,
      source: 'stage-readback',
    });
  });
  it('canonicalizes only permitted blank checkboxes and provider float32 color values', () => {
    const checkbox = {
      id: 'checkbox',
      kind: 'values',
      rowCount: 1,
      columnCount: 1,
      blankBooleanCellsAsFalse: [[0, 0]] as const,
      expectedHash: sha256Json([[{ boolValue: false }]]),
    };
    for (const blank of [null, {}]) verify(checkbox, { id: checkbox.id, values: [[blank]] });
    verify(
      { ...checkbox, blankBooleanCellsAsFalse: undefined, expectedHash: sha256Json([[null]]) },
      { id: checkbox.id, values: [[null]] }
    );
    const noPadding = { ...checkbox, rowCount: undefined, columnCount: undefined };
    const captured = { id: checkbox.id, values: [[null]] };
    verify(noPadding, captured);
    expect(captured.values).toEqual([[{ boolValue: false }]]);
    const color = {
      rgbColor: { red: Math.fround(0.99607843), green: Math.fround(0.7921569) },
      extra: 'retained',
    };
    verify(
      {
        id: 'color',
        kind: 'background-color-styles',
        rowCount: 2,
        columnCount: 2,
        expectedHash: sha256Json([
          [color, { themeColor: 'ACCENT1' }],
          [null, null],
        ]),
      },
      {
        id: 'color',
        backgroundColorStyles: [
          [
            { rgbColor: { red: 0.99607843, green: 0.7921569 }, extra: 'retained' },
            { themeColor: 'ACCENT1' },
          ],
        ],
      }
    );
  });
  it('does not reinterpret negative or fractional checkbox property coordinates', () => {
    const cases: [number, number][] = [
      [-1, 0],
      [0, -1],
      [0.5, 0],
      [0, 0.5],
      [NaN, 0],
      [0, NaN],
    ];
    for (const position of cases) {
      const expected = {
        id: 'checkbox',
        kind: 'values',
        rowCount: 1,
        columnCount: 1,
        blankBooleanCellsAsFalse: [position],
        expectedHash: sha256Json([[{ boolValue: false }]]),
      };
      expect(() =>
        verifyPublicationStageActual(
          { assertions: [expected] },
          {
            assertions: [{ id: 'checkbox', values: [[null]] }],
          }
        )
      ).toThrow('does not match');
    }
  });
  it('verifies metadata, text layout, dimensions and exact bound coordinates', () => {
    const format = { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' };
    const pairs: [PublicationAssertion, PublicationActualAssertion][] = [
      [
        {
          id: 'grid',
          kind: 'grid-properties',
          expectedHash: sha256Json({ rowCount: 10, columnCount: 2 }),
        },
        { id: 'grid', gridProperties: { rowCount: '10', columnCount: 2 } },
      ],
      [
        {
          id: 'rule',
          kind: 'data-validation',
          expectedHash: sha256Json({ condition: { type: 'BOOLEAN' } }),
        },
        { id: 'rule', rule: { condition: { type: 'BOOLEAN' } } },
      ],
      [
        { id: 'filter', kind: 'basic-filter', expectedHash: sha256Json({ range: { sheetId: 1 } }) },
        { id: 'filter', basicFilter: { range: { sheetId: 1 } } },
      ],
      [
        { id: 'format', kind: 'text-layout', expectedHash: sha256Json(format) },
        { id: 'format', format },
      ],
      [
        {
          id: 'rows',
          kind: 'dimension-pixels',
          dimension: 'ROWS',
          startRowIndex: 1,
          endRowIndex: 3,
          expectedHash: sha256Json([72, 240]),
        },
        { id: 'rows', dimension: 'ROWS', startRowIndex: 1, endRowIndex: 3, pixels: [72, 240] },
      ],
      [
        {
          id: 'cols',
          kind: 'dimension-pixels',
          dimension: 'COLUMNS',
          startColumnIndex: 0,
          endColumnIndex: 1,
          expectedHash: sha256Json([650]),
        },
        { id: 'cols', dimension: 'COLUMNS', startColumnIndex: 0, endColumnIndex: 1, pixels: [650] },
      ],
    ];
    for (const [expected, actual] of pairs) {
      verify(expected, actual);
      expect(() =>
        verifyPublicationStageActual(
          { assertions: [expected] },
          { assertions: [{ id: actual.id }] }
        )
      ).toThrow();
    }
    expect(() =>
      verifyPublicationStageActual(
        { assertions: [valueAssertion] },
        { assertions: [{ id: 'values', sheetId: 2 }] }
      )
    ).toThrow('wrong sheetId');
    const ownUndefined = {
      id: 'own',
      kind: 'values',
      expectedHash: sha256Json([]),
      sheetId: undefined,
    };
    verify(ownUndefined, { id: 'own', values: [] });
    const inherited = { id: 'own', values: [] };
    Object.setPrototypeOf(inherited, { sheetId: 1 });
    verify({ ...ownUndefined, sheetId: 1 }, inherited);
  });
  it('rejects missing, extra, duplicate, oversized, unsupported or mismatching actual assertions', () => {
    expect(verifyPublicationStageActual({})).toEqual([]);
    expect(() => verifyPublicationStageActual({ assertions: [valueAssertion] })).toThrow(
      'missing values'
    );
    expect(() =>
      verifyPublicationStageActual({}, { assertions: [{ id: 'a' }, { id: 'a' }] })
    ).toThrow('duplicate assertion');
    expect(() => verifyPublicationStageActual({}, { assertions: [{ id: 'extra' }] })).toThrow(
      'unknown assertions'
    );
    const values = {
      id: 'v',
      kind: 'values',
      rowCount: 1,
      columnCount: 1,
      expectedHash: sha256Json([[null]]),
    };
    expect(() =>
      verifyPublicationStageActual(
        { assertions: [values] },
        { assertions: [{ id: 'v', values: [[null, null]] }] }
      )
    ).toThrow('outside its exact range');
    expect(() =>
      verifyPublicationStageActual(
        { assertions: [values] },
        { assertions: [{ id: 'v', values: [[1]] }] }
      )
    ).toThrow('does not match');
    for (const kind of ['unknown', undefined])
      expect(() =>
        verifyPublicationStageActual(
          { assertions: [{ ...values, kind }] },
          { assertions: [{ id: 'v' }] }
        )
      ).toThrow('Unsupported');
    const colors = { ...values, kind: 'background-color-styles' };
    expect(() =>
      verifyPublicationStageActual({ assertions: [colors] }, { assertions: [{ id: 'v' }] })
    ).toThrow('requires actual background');
    expect(() =>
      verifyPublicationStageActual(
        { assertions: [colors] },
        { assertions: [{ id: 'v', backgroundColorStyles: [[{}, {}]] }] }
      )
    ).toThrow('colors outside');
    const dimensions = {
      ...values,
      kind: 'dimension-pixels',
      dimension: 'ROWS',
      startRowIndex: 0,
      endRowIndex: 1,
    };
    for (const pixels of [[], [0], [1.5], [Infinity]])
      expect(() =>
        verifyPublicationStageActual(
          { assertions: [dimensions] },
          {
            assertions: [{ id: 'v', dimension: 'ROWS', startRowIndex: 0, endRowIndex: 1, pixels }],
          }
        )
      ).toThrow('exact dimension pixels');
  });
  it('verifies durable final assertions independently of passed transient stages', () => {
    const { manifest, actual } = fixture();
    expect(() => verifyFinalPublicationActual(manifest)).toThrow('different run or spreadsheet');
    expect(() =>
      verifyFinalPublicationActual({ ...manifest, finalAssertions: [] }, actual)
    ).toThrow('no final-state assertion');
    expect(() =>
      verifyFinalPublicationActual(
        { ...manifest, finalAssertions: [valueAssertion, valueAssertion] },
        actual
      )
    ).toThrow('duplicate final-state');
    expect(() => verifyFinalPublicationActual(manifest, { ...actual, assertions: [] })).toThrow(
      'missing values'
    );
    expect(() =>
      verifyFinalPublicationActual(manifest, {
        ...actual,
        assertions: [
          { ...actual.assertions?.[0], id: 'values', values: [[{ stringValue: 'changed' }]] },
        ],
      })
    ).toThrow('does not match');
  });
  it('requires exact prepared calls and controls to reconstruct their parent stage', () => {
    const first = { requests: [{ one: true }], include_spreadsheet_in_response: false };
    const second = { requests: [{ two: true }], include_spreadsheet_in_response: false };
    const body = { ...first, requests: [...first.requests, ...second.requests] };
    const stage: PublicationStage = {
      id: 'stage',
      payloadHash: sha256Json(body),
      calls: [
        { file: 'one', payloadHash: sha256Json(first) },
        { file: 'two', payloadHash: sha256Json(second) },
      ],
    };
    const calls = [
      { file: 'one', payload: first },
      { file: 'two', payload: second },
    ];
    expect(assertPublicationStagePayload(stage, body, calls)).toBe(true);
    expect(() => assertPublicationStagePayload(stage, {})).toThrow('stage payload hash changed');
    expect(() => assertPublicationStagePayload(stage, body)).toThrow('call count changed');
    expect(() =>
      assertPublicationStagePayload(stage, body, [
        { file: 'wrong', payload: first },
        calls[1] ?? calls[0] ?? { file: '', payload: {} },
      ])
    ).toThrow('call payload hash changed');
    const changed = { ...second, include_spreadsheet_in_response: true };
    expect(() =>
      assertPublicationStagePayload(
        {
          ...stage,
          calls: [stage.calls?.[0] ?? {}, { file: 'two', payloadHash: sha256Json(changed) }],
        },
        body,
        [
          { file: 'one', payload: first },
          { file: 'two', payload: changed },
        ]
      )
    ).toThrow('call controls changed');
    expect(() => assertPublicationStagePayload({ ...stage, calls: [] }, body, [])).toThrow(
      'do not reconstruct'
    );
    expect(
      assertPublicationStagePayload(
        { id: 'empty', payloadHash: sha256Json({ requests: [] }) },
        { requests: [] }
      )
    ).toBe(true);
  });
  it('keeps expired-gate identity checks and read-only recovery available', () => {
    const { manifest, observations } = fixture();
    const gate = {
      passed: true,
      runId: manifest.runId,
      spreadsheetId: manifest.spreadsheetId,
      planHash: manifest.planHash,
      evaluatedAt: '2020-01-01T00:00:00Z',
    };
    expect(assertPublicationGateBinding(manifest, gate)).toBe(true);
    expect(() => assertPublicationGateFreshness(gate)).toThrow('expired');
    expect(evaluatePublicationReadback(manifest, observations).complete).toBe(false);
    expect(() => assertPublicationGateBinding(manifest)).toThrow('has not passed');
    expect(() => assertPublicationGateBinding(manifest, { ...gate, runId: 'wrong' })).toThrow(
      'different run'
    );
    expect(() =>
      assertPublicationGateBinding(manifest, { ...gate, spreadsheetId: 'wrong' })
    ).toThrow('different spreadsheet');
    expect(() => assertPublicationGateBinding(manifest, { ...gate, planHash: 'wrong' })).toThrow(
      'different prepared plan'
    );
  });
});
