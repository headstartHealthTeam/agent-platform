import { describe, expect, it } from 'vitest';

import { sha256Json } from './analysis.js';
import { reportingSourcesSchema } from './source-config.js';
import {
  narrativeSchema,
  workbookSnapshotSchema,
  workbookTemplateSchema,
  type ReportRows,
} from './workbook-contract.js';
import {
  buildWorkbookPlan,
  sheetStyleFingerprint,
  templateBindings,
  validateTemplateSnapshot,
} from './workbook-plan.js';

function setup(): Parameters<typeof buildWorkbookPlan>[0] {
  const target = workbookSnapshotSchema.parse({
    spreadsheetId: 'new-report',
    sheets: [
      {
        properties: {
          sheetId: 1,
          index: 0,
          title: 'Summary',
          gridProperties: { rowCount: 6, columnCount: 2 },
        },
        data: [
          {
            rowData: [
              { values: [{ userEnteredValue: { stringValue: 'Metric' }, note: 'Definition' }] },
              {
                values: [
                  { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0' } } },
                  {},
                ],
              },
              { values: [{}] },
              { values: [{}] },
            ],
          },
        ],
        charts: [{ chartId: 7, spec: { title: 'Stable chart' } }],
      },
    ],
  });
  const sheet = target.sheets[0];
  if (!sheet) throw new Error('Synthetic sheet missing');
  const template = workbookTemplateSchema.parse({
    schemaVersion: 'organic-workbook-template/v1',
    version: 'synthetic/v1',
    sourceId: 'approved',
    cleanTemplateId: 'template',
    sheets: [
      {
        title: 'Summary',
        rows: 6,
        columns: 2,
        staticCells: [{ row: 0, column: 0, text: 'Metric', note: 'Definition' }],
        styleSha256: sheetStyleFingerprint(sheet, 6, 2),
        bindings: [
          { id: 'metric', owner: 'facts', range: { row: 1, column: 0, rows: 1, columns: 2 } },
          {
            id: 'judgment',
            owner: 'narrative',
            range: { row: 2, column: 0, rows: 1, columns: 2 },
            maxCharacters: 80,
          },
          {
            id: 'raw',
            owner: 'facts',
            range: { row: 3, column: 0, rows: 2, columns: 2 },
            expandRows: 8,
          },
        ],
      },
    ],
  });
  const file = (id: string): { id: string; title: string; url: string } => ({
    id,
    title: id,
    url: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
  });
  const sources = reportingSourcesSchema.parse({
    schemaVersion: 'organic-reporting-sources/v1',
    version: 'sources/v1',
    owner: 'Synthetic',
    verifiedAt: '2026-09-10',
    approvedReport: file('approved'),
    template: { ...file('template'), version: template.version },
    strategy: { ...file('strategy'), url: 'https://docs.google.com/document/d/strategy/edit' },
    historicalReports: [file('history')],
    approvalEvidence: [{ url: 'https://example.com/approval', meaning: 'Synthetic' }],
    tam: {
      ...file('tam'),
      range: "'TAM'!A1:E20",
      approvedAt: '2026-07-01',
      approvalScope: 'pillar-direction',
      coreValue: 'Core',
      columns: {
        keyword: 'Keyword',
        pillar: 'Pillar',
        marketScope: 'Scope',
        searchVolume: 'Volume',
        serviceability: 'Service',
      },
    },
  });
  const analysis = {
    schemaVersion: 'organic-performance-analysis/v1',
    inputSha256: 'a'.repeat(64),
    metric: 42,
    lifecycle: { current: 'partial_launch_month' },
  };
  const narrative = {
    schemaVersion: 'organic-report-narrative/v1',
    analysisSha256: sha256Json(analysis),
    blocks: { judgment: [['Early observation; no causal conclusion.']] },
    evidence: [
      {
        id: 'claim1',
        classification: 'inferred',
        text: 'Insufficient causal evidence',
        sources: ['analysis.metric'],
      },
    ],
  };
  const facts = new Map<string, ReportRows>([
    ['metric', [[42, null]]],
    ['raw', [[true, '=NOT_A_FORMULA()']]],
  ]);
  return { target, template, sources, analysis, narrative, facts };
}

describe('native approved-template population plan', () => {
  it.each([
    ['pre_launch', 'This section was not live; the legacy audience history remains useful.'],
    ['partial_launch_month', 'Keep the early observations, without a full-month growth claim.'],
    ['first_full_baseline', 'This establishes a baseline, not evidence of maturity or causality.'],
    ['comparable', 'The comparison is valid; its business significance still needs judgment.'],
  ])('preserves agent-authored interpretation for %s without generating copy', (state, text) => {
    const input = setup();
    const analysis = {
      schemaVersion: 'organic-performance-analysis/v1',
      metric: 0,
      lifecycle: { current: state },
    };
    const narrative = narrativeSchema.parse(input.narrative);
    narrative.analysisSha256 = sha256Json(analysis);
    narrative.blocks['judgment'] = [[text]];
    const facts = new Map(input.facts);
    facts.set('metric', [[0, null]]);
    const plan = buildWorkbookPlan({ ...input, analysis, narrative, facts });
    expect(plan.batches[0]?.requests[0]).toHaveProperty(
      'updateCells.rows.0.values.0.userEnteredValue.numberValue',
      0
    );
    expect(plan.batches[0]?.requests[0]).not.toHaveProperty(
      'updateCells.rows.0.values.1.userEnteredValue'
    );
    expect(plan.batches[0]?.requests[1]).toHaveProperty(
      'updateCells.rows.0.values.0.userEnteredValue.stringValue',
      text
    );
    narrative.blocks['judgment'] = [];
    const withoutCallout = buildWorkbookPlan({ ...input, analysis, narrative, facts });
    expect(withoutCallout.batches[0]?.requests[0]).toEqual(plan.batches[0]?.requests[0]);
    expect(withoutCallout.batches[0]?.requests[1]).not.toHaveProperty(
      'updateCells.rows.0.values.0.userEnteredValue'
    );
  });

  it('is deterministic, preserves the template, and keeps judgment separate from arithmetic', () => {
    const input = setup();
    const before = sha256Json(input);
    const plan = buildWorkbookPlan(input);
    expect(plan).toEqual(buildWorkbookPlan(input));
    expect(sha256Json(input)).toBe(before);
    expect(plan).toMatchObject({ spreadsheetId: 'new-report', externalWritesPerformed: false });
    expect(plan.batches[0]?.requests[0]).toMatchObject({
      updateCells: {
        fields: 'userEnteredValue,userEnteredFormat.horizontalAlignment',
        rows: [{ values: [{ userEnteredValue: { numberValue: 42 } }, {}] }],
      },
    });
    expect(plan.batches[0]?.requests[2]).toHaveProperty(
      'updateCells.rows.0.values.1.userEnteredValue.stringValue',
      '=NOT_A_FORMULA()'
    );
    expect(plan.batches[0]?.requests[2]).not.toHaveProperty(
      'updateCells.rows.1.values.0.userEnteredValue'
    );
    expect(
      templateBindings(workbookTemplateSchema.parse(input.template)).map((binding) => binding.id)
    ).toEqual(['metric', 'judgment', 'raw']);
  });

  it.each(['approved', 'template', 'history'])('never populates protected file %s', (id) => {
    const input = setup();
    const target = workbookSnapshotSchema.parse(input.target);
    target.spreadsheetId = id;
    expect(() => buildWorkbookPlan({ ...input, target })).toThrow('new report copy');
  });

  it('rejects changed names, styles, labels, notes, and stale cells outside bindings', () => {
    const input = setup();
    const mutate = (
      change: (sheet: ReturnType<typeof workbookSnapshotSchema.parse>['sheets'][number]) => void
    ): void => {
      const target = workbookSnapshotSchema.parse(input.target);
      const sheet = target.sheets[0];
      if (!sheet) throw new Error('Synthetic sheet missing');
      change(sheet);
      expect(() => validateTemplateSnapshot(target, input.template)).toThrow();
    };
    mutate((sheet) => {
      sheet.properties.title = 'Redesigned';
    });
    mutate((sheet) => {
      sheet.charts = [];
    });
    mutate((sheet) => {
      sheet.data[0]?.rowData[0]?.values.splice(0, 1);
    });
    mutate((sheet) => {
      const cell = sheet.data[0]?.rowData[0]?.values[0];
      if (cell) cell.note = 'Stale note';
    });
    mutate((sheet) => {
      const cell = sheet.data[0]?.rowData[1]?.values[1];
      if (cell) cell.userEnteredValue = { stringValue: 'July' };
    });
    mutate((sheet) => {
      const cell = sheet.data[0]?.rowData[3]?.values[0];
      if (cell) cell.userEnteredValue = { numberValue: 99 };
    });
  });

  it('rejects mismatched identities, analysis, and unknown or missing semantic bindings', () => {
    const input = setup();
    const sources = reportingSourcesSchema.parse(input.sources);
    sources.template.version = 'unapproved/v2';
    expect(() => buildWorkbookPlan({ ...input, sources })).toThrow('identity disagree');
    expect(() => buildWorkbookPlan({ ...input, analysis: { another: 'analysis' } })).toThrow(
      'another analysis'
    );
    const missing = new Map(input.facts);
    missing.delete('metric');
    expect(() => buildWorkbookPlan({ ...input, facts: missing })).toThrow('Missing report binding');
    const extra = new Map(input.facts);
    extra.set('unapproved', [[123]]);
    expect(() => buildWorkbookPlan({ ...input, facts: extra })).toThrow('Unknown report binding');
  });

  it('rejects overflow and expands only bounded raw rows without silently truncating', () => {
    const input = setup();
    const facts = new Map(input.facts);
    facts.set('metric', [[1, 2, 3]]);
    expect(() => buildWorkbookPlan({ ...input, facts })).toThrow('overflow');
    facts.set('metric', [[42]]);
    facts.set(
      'raw',
      Array.from({ length: 7 }, () => [1])
    );
    const plan = buildWorkbookPlan({ ...input, facts });
    expect(plan.batches[0]?.requests).toHaveLength(5);
    expect(plan.batches[0]?.requests[2]).toHaveProperty(
      'updateSheetProperties.properties.gridProperties.rowCount',
      10
    );
    expect(plan.batches[0]?.requests[3]).toHaveProperty('copyPaste.pasteType', 'PASTE_FORMAT');
    facts.set(
      'raw',
      Array.from({ length: 9 }, () => [1])
    );
    expect(() => buildWorkbookPlan({ ...input, facts })).toThrow('overflow');
    facts.set('raw', [['x'.repeat(701)]]);
    expect(() => buildWorkbookPlan({ ...input, facts })).toThrow('text overflow');
  });

  it('restores chart series after values and resets heterogeneous raw number formats', () => {
    const input = setup();
    const template = workbookTemplateSchema.parse(input.template);
    const sheet = template.sheets[0];
    if (!sheet) throw new Error('fixture');
    sheet.chartSpecs = [
      {
        basicChart: {
          series: [
            {
              series: {
                sourceRange: {
                  sources: [
                    {
                      sheetId: 1,
                      startRowIndex: 1,
                      endRowIndex: 2,
                      startColumnIndex: 0,
                      endColumnIndex: 1,
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    ];
    const raw = sheet.bindings.find((binding) => binding.id === 'raw');
    if (!raw) throw new Error('fixture');
    raw.resetNumberFormat = true;
    const plan = buildWorkbookPlan({ ...input, template });
    expect(plan.batches[0]?.requests.at(-1)).toHaveProperty(
      'updateChartSpec.spec.basicChart.series.0.series.sourceRange.sources.0.sheetId',
      1
    );
    expect(plan.batches[0]?.requests[2]).toHaveProperty(
      'updateCells.rows.0.values.0.userEnteredFormat.numberFormat.pattern',
      '0.########'
    );
  });

  it('rejects text in merged interiors while accepting sparse anchor cells', () => {
    const input = setup();
    const target = workbookSnapshotSchema.parse(input.target);
    const template = workbookTemplateSchema.parse(input.template);
    const sheet = target.sheets[0];
    const expected = template.sheets[0];
    if (!sheet || !expected) throw new Error('fixture');
    sheet.merges = [
      { sheetId: 1, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 2 },
    ];
    expected.styleSha256 = sheetStyleFingerprint(sheet, 6, 2);
    const narrative = narrativeSchema.parse(input.narrative);
    narrative.blocks['judgment'] = [['anchor', 'invisible interior']];
    expect(() => buildWorkbookPlan({ ...input, target, template, narrative })).toThrow(
      'sparse anchor'
    );
    narrative.blocks['judgment'] = [['anchor', '']];
    expect(buildWorkbookPlan({ ...input, target, template, narrative }).batches).toHaveLength(1);
  });

  it('fingerprints hidden/order drift and chart references to foreign sheets', () => {
    const input = setup();
    const target = workbookSnapshotSchema.parse(input.target);
    const sheet = target.sheets[0];
    if (!sheet) throw new Error('fixture');
    sheet.charts = [
      {
        chartId: 7,
        spec: { basicChart: { series: [{ sourceRange: { sources: [{ sheetId: 1 }] } }] } },
      },
    ];
    const original = sheetStyleFingerprint(sheet, 6, 2);
    sheet.charts = [
      {
        chartId: 7,
        spec: { basicChart: { series: [{ sourceRange: { sources: [{ sheetId: 99 }] } }] } },
      },
    ];
    expect(sheetStyleFingerprint(sheet, 6, 2)).not.toBe(original);
    const clean = sheetStyleFingerprint(sheet, 6, 2);
    sheet.properties['hidden'] = true;
    expect(sheetStyleFingerprint(sheet, 6, 2)).not.toBe(clean);
    sheet.properties['hidden'] = false;
    sheet.properties.index = 1;
    expect(sheetStyleFingerprint(sheet, 6, 2)).not.toBe(clean);
  });
});
