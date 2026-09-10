import { readFile } from 'node:fs/promises';

import { organicPerformanceBundleSchema } from './schemas.js';
import { workbookEvidenceSchema, type WorkbookEvidence } from './workbook-evidence.js';

/** Sanitized aggregate regression fixture, with generated provider-shaped views. No network reads. */
export async function workbookFixture(): Promise<WorkbookEvidence> {
  const bundle = organicPerformanceBundleSchema.parse(
    JSON.parse(
      await readFile(new URL('../fixtures/august-2026-regression.json', import.meta.url), 'utf8')
    )
  );
  bundle.sources.gsc.metadata['brandRegex'] = 'head[ -]*start';
  for (const row of bundle.sources.ga4.periodTotals) {
    row['activeUsers'] = 100;
    row['sessionKeyEventRate'] = 0.1;
  }
  const views: WorkbookEvidence['views'] = [];
  const add = (name: string, data: unknown): void => {
    views.push({ name, extractedAt: '2026-09-09T14:00:00Z', data });
  };
  for (const window of bundle.report.periods) {
    for (const row of bundle.sources.gsc.nonBrandedTotals) {
      row['ctr'] = Number(row['clicks']) / Number(row['impressions']);
      row['averagePosition'] = 15;
    }
    const pages = bundle.sources.gsc.pageRows
      .filter((row) => row.period === window.id)
      .map((row) => ({
        keys: [row.url],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.impressions ? row.clicks / row.impressions : 0,
        position: 12,
      }));
    const queries = bundle.sources.gsc.queryRows
      .filter((row) => row.period === window.id)
      .map((row, index) => ({
        keys: [row.query],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.impressions ? row.clicks / row.impressions : 0,
        position: [2, 7, 15, 25].at(index % 4) ?? 1,
      }));
    for (const [name, dimensions, rows] of [
      ['pages', ['page'], pages],
      ['queries', ['query'], queries],
      ['nonbranded-queries', ['query'], queries],
      [
        'daily',
        ['date'],
        [{ keys: [window.startDate], clicks: 2, impressions: 100, ctr: 0.02, position: 10 }],
      ],
    ] as const) {
      const filters = [...bundle.sources.gsc.metadata.filters];
      if (name.startsWith('nonbranded'))
        filters.push({
          dimension: 'query',
          operator: 'excludingRegex',
          expression: 'head[ -]*start',
        });
      add(`gsc-${window.id}-${name}`, {
        request: {
          startDate: window.startDate,
          endDate: window.endDate,
          dimensions,
          dimensionFilterGroups: [{ filters }],
        },
        rows,
        rowCount: rows.length,
        pagination: { truncatedAtMaxRows: false },
      });
    }
    const ga = (
      name: string,
      dimensions: string[],
      records: readonly Record<string, string | number>[]
    ): void => {
      const metrics =
        name === 'channels'
          ? ['sessions', 'engagementRate', 'keyEvents']
          : ['sessions', 'engagedSessions', 'keyEvents', 'sessionKeyEventRate', 'activeUsers'];
      const expressions = [
        {
          filter: {
            fieldName: 'hostName',
            stringFilter: { matchType: 'EXACT', value: bundle.config.publicHostname },
          },
        },
        ...(name === 'channels'
          ? []
          : [
              {
                filter: {
                  fieldName: 'sessionDefaultChannelGroup',
                  stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
                },
              },
            ]),
      ];
      const get = (row: Record<string, string | number>, key: string): string =>
        String(Object.entries(row).find(([name_]) => name_ === key)?.[1] ?? 0);
      add(`ga4-${window.id}-${name}`, {
        request: {
          property: bundle.sources.ga4.metadata.sourceId,
          dateRanges: [{ startDate: window.startDate, endDate: window.endDate }],
          dimensionFilter: { andGroup: { expressions } },
        },
        response: {
          dimensionHeaders: dimensions.map((name_) => ({ name: name_ })),
          metricHeaders: metrics.map((name_) => ({ name: name_ })),
          rowCount: records.length,
          rows: records.map((row) => ({
            dimensionValues: dimensions.map((key) => ({ value: get(row, key) })),
            metricValues: metrics.map((key) => ({ value: get(row, key) })),
          })),
        },
      });
    };
    ga(
      'landing-pages',
      ['landingPage'],
      bundle.sources.ga4.landingPageRows
        .filter((row) => row.period === window.id)
        .map((row) => ({ ...row, sessionKeyEventRate: 0.1, activeUsers: 10 }))
    );
    ga(
      'channels',
      ['sessionDefaultChannelGroup'],
      [
        {
          sessionDefaultChannelGroup: 'Organic Search',
          sessions: 100,
          engagementRate: 0.6,
          keyEvents: 10,
        },
        { sessionDefaultChannelGroup: 'Direct', sessions: 200, engagementRate: 0.5, keyEvents: 5 },
      ]
    );
  }
  const args = {
    domain: bundle.config.publicHostname,
    database: bundle.sources.semrush?.metadata.database,
  };
  const csv =
    'Date;Organic Traffic;Organic Cost;Rank\n20260815;379;2139;2006889\n20260715;355;1871;2026637\n20250815;201;719;2688928';
  add('semrush-mcp-read-1', {
    arguments: args,
    response: { content: [{ type: 'text', text: csv }] },
  });
  add('semrush-mcp-read-2', {
    arguments: args,
    response: { content: [{ type: 'text', text: csv }] },
  });
  add('semrush-mcp-read-3', {
    arguments: args,
    response: {
      content: [
        {
          type: 'text',
          text: 'Keyword;Traffic (%);Url\nheadstart;40;https://headstart.health/\nsynthetic service;20;https://headstart.health/families\nportal;30;https://app.headstart.health/',
        },
      ],
    },
  });
  return workbookEvidenceSchema.parse({
    schemaVersion: 'organic-workbook-evidence/v1',
    bundle,
    views,
  });
}
