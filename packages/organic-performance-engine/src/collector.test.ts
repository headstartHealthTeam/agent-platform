import { readFile } from 'node:fs/promises';

import { ga4ReportResponseSchema } from '@headstart-health/google-analytics-data';
import {
  SearchConsoleClient,
  type SearchConsoleTransport,
} from '@headstart-health/google-search-console';
import { describe, expect, it } from 'vitest';

import {
  collectionPlanSchema,
  collectOrganicEvidence,
  mapTamRows,
  type CollectionPlan,
  type CollectionProviders,
  type EvidenceSink,
} from './collector.js';
import { organicPerformanceBundleSchema, type OrganicPerformanceBundle } from './schemas.js';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Required synthetic fixture absent');
  return value;
}

async function setup(): Promise<{
  plan: CollectionPlan;
  providers: CollectionProviders;
  saved: Map<string, unknown>;
  sink: EvidenceSink;
  bundle: OrganicPerformanceBundle;
}> {
  const bundle = organicPerformanceBundleSchema.parse(
    JSON.parse(
      await readFile(new URL('../fixtures/august-2026-regression.json', import.meta.url), 'utf8')
    )
  );
  const plan = collectionPlanSchema.parse({
    schemaVersion: 'organic-performance-collection/v1',
    report: bundle.report,
    config: bundle.config,
    executionProfile: {
      schemaVersion: 'headstart-capability-profile/v1',
      id: 'synthetic',
      revision: 'v1',
      bindings: [
        ['google-search-console.performance.read', 'google-search-console-rest'],
        ['google-analytics.ga4-report.read', 'google-analytics-rest'],
        ['google-sheets.range.read', 'google-sheets-rest'],
        ['semrush.domain-organic.read', 'semrush-mcp'],
      ].map(([capabilityId, providerId]) => ({
        capabilityId,
        providerId,
        adapterVersion: '0.1.0',
      })),
    },
    gsc: { siteUrl: 'sc-domain:headstart.health', brandRegex: 'head[ -]*(start|stat)' },
    ga4: { property: 'properties/123', expectedTimeZone: 'America/Chicago' },
    semrush: {
      domain: 'headstart.health',
      database: 'us',
      device: 'desktop',
      snapshotDates: { current: '2026-08-15', previous: '2026-07-15', year_ago: '2025-08-15' },
    },
    tam: {
      spreadsheetId: 'synthetic',
      range: "'TAM'!A1:E20",
      approvedAt: '2026-07-24',
      approvalScope: 'pillar-direction',
      columns: {
        keyword: 'Keyword',
        pillar: 'Pillar',
        searchVolume: 'Volume',
        serviceability: 'Serviceability',
        marketScope: 'Scope',
      },
    },
  });
  const periodFor = (date: unknown): OrganicPerformanceBundle['report']['periods'][number] => {
    const period = bundle.report.periods.find((x) => x.startDate === date);
    if (!period) throw new Error('Unexpected synthetic period');
    return period;
  };
  const transport: SearchConsoleTransport = {
    request: async (method, path, body): Promise<unknown> => {
      if (method === 'GET' && path === '/sites')
        return { siteEntry: [{ siteUrl: plan.gsc.siteUrl, permissionLevel: 'siteFullUser' }] };
      const period = periodFor(body?.['startDate']);
      const dims = body?.['dimensions'];
      if (Array.isArray(dims) && dims.length > 0) {
        if (dims[0] === 'page')
          return {
            rows: bundle.sources.gsc.pageRows
              .filter((x) => x.period === period.id)
              .map((x) => ({
                keys: [x.url],
                clicks: x.clicks,
                impressions: x.impressions,
                ctr: 0,
                position: 0,
              })),
          };
        if (dims[0] === 'query')
          return {
            rows: bundle.sources.gsc.queryRows
              .filter((x) => x.period === period.id)
              .map((x) => ({
                keys: [x.query],
                clicks: x.clicks,
                impressions: x.impressions,
                ctr: 0,
                position: 0,
              })),
          };
        return { rows: [] };
      }
      const branded = JSON.stringify(body).includes('excludingRegex');
      const row = (
        branded ? bundle.sources.gsc.nonBrandedTotals : bundle.sources.gsc.periodTotals
      ).find((x) => x.period === period.id);
      return {
        rows: [
          {
            clicks: row?.['clicks'],
            impressions: row?.['impressions'],
            ctr: row?.['ctr'] ?? 0,
            position: row?.['averagePosition'] ?? 0,
          },
        ],
      };
    },
  };
  const providers: CollectionProviders = {
    gsc: new SearchConsoleClient(transport),
    ga4: {
      getProperty: async (): Promise<unknown> => ({ name: plan.ga4.property }),
      runReport: async (request) => {
        const period = periodFor(request.dateRanges[0]?.startDate);
        const dimension = request.dimensions[0]?.name;
        let records: readonly object[];
        if (dimension === 'landingPage')
          records = bundle.sources.ga4.landingPageRows.filter((x) => x.period === period.id);
        else if (dimension === 'eventName')
          records = bundle.sources.ga4.eventRows.filter((x) => x.period === period.id);
        else if (dimension === undefined)
          records = bundle.sources.ga4.periodTotals.filter((x) => x.period === period.id);
        else records = [];
        const get = (record: object, key: string): string =>
          String(Object.entries(record).find(([name]) => name === key)?.[1] ?? 0);
        return {
          dimensionHeaders: request.dimensions,
          metricHeaders: request.metrics,
          rows: records.map((record) => ({
            dimensionValues: request.dimensions.map((x) => ({ value: get(record, x.name) })),
            metricValues: request.metrics.map((x) => ({ value: get(record, x.name) })),
          })),
          rowCount: records.length,
          metadata: { timeZone: 'America/Chicago' },
        };
      },
    },
    sheets: {
      getSpreadsheet: async (): Promise<unknown> => ({ spreadsheetId: 'synthetic' }),
      readRange: async (): Promise<unknown> => ({
        spreadsheetId: 'synthetic',
        range: required(plan.tam).range,
        revision: 'synthetic-v1',
        values: [
          ['Keyword', 'Pillar', 'Volume', 'Serviceability', 'Scope'],
          ...required(bundle.sources.tam).keywords.map((x) => [
            x.keyword,
            x.pillar,
            x.searchVolume,
            x.serviceability,
            'Core',
          ]),
          ['excluded', 'Adjacent', 100, 'confirmed', 'Adjacent'],
          [],
        ],
      }),
    },
    semrush: {
      domainOverview: async (request) => ({
        domain: request.domain,
        database: request.database,
        device: request.device,
        rankingKeywords:
          request.snapshotDate === undefined
            ? 1
            : required(bundle.sources.semrush).domainSnapshots.find(
                (x) => x.snapshotDate.replaceAll('-', '') === request.snapshotDate
              )?.rankingKeywords,
        snapshotDate:
          request.snapshotDate === undefined
            ? undefined
            : `${request.snapshotDate.slice(0, 4)}-${request.snapshotDate.slice(4, 6)}-${request.snapshotDate.slice(6, 8)}`,
      }),
      domainOrganicKeywords: async (): Promise<unknown> =>
        required(bundle.sources.semrush).rankings,
      keywordOverview: async (): Promise<unknown> => [],
    },
  };
  const saved = new Map<string, unknown>();
  const sink: EvidenceSink = {
    save: async (name, value): Promise<void> => {
      if (saved.has(name)) throw new Error('Attempted evidence overwrite');
      saved.set(name, value);
    },
  };
  return { plan, providers, saved, sink, bundle };
}
describe('complete organic collector', () => {
  it('uses one exact hyphenated-host filter through collection and analysis', async () => {
    const x = await setup();
    const hostname = 'head-start.health';
    x.plan.config.publicHostname = hostname;
    x.plan.gsc.siteUrl = `sc-domain:${hostname}`;
    required(x.plan.semrush).domain = hostname;
    for (const row of x.bundle.sources.gsc.pageRows) {
      row.url = row.url.replace('headstart.health', hostname);
    }
    for (const row of required(x.bundle.sources.semrush).rankings) {
      row.url = row.url.replace('headstart.health', hostname);
    }
    const result = await collectOrganicEvidence(
      x.plan,
      x.providers,
      x.sink,
      '2026-09-10T12:00:00Z'
    );
    const expression = '^https://head-start\\.health/';
    expect(result.bundle.sources.gsc.metadata.filters).toContainEqual({
      dimension: 'page',
      operator: 'includingRegex',
      expression,
    });
    expect(x.saved.get('gsc-current-pages')).toHaveProperty(
      'request.dimensionFilterGroups.0.filters.0.expression',
      expression
    );
    expect(result.analysis).toHaveProperty('segments.gscReconciliation.current', {
      sourceTotal: 497,
      classifiedTotal: 497,
      delta: 0,
    });
    const exact = new RegExp(expression, 'u');
    expect(exact.exec(`https://${hostname}/resources`)).not.toBeNull();
    for (const url of [
      'https://head-startXhealth/resources',
      'https://head-start.health.evil.test/resources',
      'https://app.head-start.health/resources',
    ])
      expect(exact.exec(url)).toBeNull();
  });

  it('runs a declared first-party-only plan without requiring or reading optional providers', async () => {
    const x = await setup();
    delete x.plan.semrush;
    delete x.plan.tam;
    x.plan.report.omittedSources = {
      semrush: 'No market-context access',
      tam: 'No planning-source access',
    };
    const result = await collectOrganicEvidence(
      x.plan,
      { gsc: x.providers.gsc, ga4: x.providers.ga4 },
      x.sink,
      '2026-09-10T12:00:00Z'
    );
    expect(result.analysis['kpis']).toMatchObject({ 'ga4.organic_sessions': { current: 510 } });
    expect(result.analysis['evidenceCoverage']).toMatchObject({
      status: 'complete_with_limitations',
    });
    expect(result.bundle.sources.semrush).toBeUndefined();
    expect(
      [...x.saved.keys()].some((key) => key.startsWith('semrush-') || key === 'tam-range')
    ).toBe(false);
    const missing = await setup();
    await expect(
      collectOrganicEvidence(
        missing.plan,
        { gsc: missing.providers.gsc, ga4: missing.providers.ga4 },
        missing.sink,
        '2026-09-10T12:00:00Z'
      )
    ).rejects.toThrow(/Missing configured/);
    expect(missing.saved.has('report-analysis')).toBe(false);
  });

  it('collects missing-history plans without querying absent periods', async () => {
    const x = await setup();
    x.plan.report.periods = x.plan.report.periods.filter((period) => period.id !== 'year_ago');
    x.plan.report.unavailableComparisons = { year_ago: 'Tracking began this year' };
    const result = await collectOrganicEvidence(
      x.plan,
      x.providers,
      x.sink,
      '2026-09-10T12:00:00Z'
    );
    expect(result.analysis['kpis']).toMatchObject({ 'ga4.organic_sessions': { yearAgo: null } });
    expect([...x.saved.keys()].some((key) => key.includes('year_ago'))).toBe(false);
  });

  it('preserves quality flags only under an explicitly selected caveated-report policy', async () => {
    const x = await setup();
    x.plan.report.qualityPolicy = {
      mode: 'allow-with-caveats',
      rationale: 'Directional diagnostic; labels and source-quality notes required',
    };
    const upstream = x.providers.ga4;
    const ga4 = {
      getProperty: (property: string): Promise<unknown> => upstream.getProperty(property),
      runReport: async (request: Parameters<typeof upstream.runReport>[0]): Promise<unknown> => {
        const response = ga4ReportResponseSchema.parse(await upstream.runReport(request));
        return { ...response, metadata: { ...response.metadata, subjectToThresholding: true } };
      },
    };
    const result = await collectOrganicEvidence(
      x.plan,
      { ...x.providers, ga4 },
      x.sink,
      '2026-09-10T12:00:00Z'
    );
    expect(result.analysis['evidenceCoverage']).toMatchObject({
      status: 'complete_with_limitations',
    });
    expect(result.bundle.sources.ga4.metadata.qualityIssues).toContainEqual({
      period: 'current',
      view: 'totals',
      flags: ['subject_to_thresholding'],
    });
  });

  it('queries approved outcome hosts separately without widening public-site KPI scope', async () => {
    const x = await setup();
    x.plan.config.outcomeRegistry = [
      {
        audience: 'families',
        eventName: 'family_complete',
        measurement: {
          hostname: 'app.headstart.health',
          metric: 'eventCount',
          rationale: 'Approved outcome lives on the app hostname',
        },
      },
    ];
    const upstream = x.providers.ga4;
    const ga4 = {
      getProperty: (property: string): Promise<unknown> => upstream.getProperty(property),
      runReport: async (request: Parameters<typeof upstream.runReport>[0]): Promise<unknown> => {
        if (JSON.stringify(request.dimensionFilter).includes('family_complete'))
          return {
            dimensionHeaders: [],
            metricHeaders: [{ name: 'eventCount' }],
            rows: [{ dimensionValues: [], metricValues: [{ value: '7' }] }],
            rowCount: 1,
            metadata: { timeZone: 'America/Chicago' },
          };
        return upstream.runReport(request);
      },
    };
    const result = await collectOrganicEvidence(
      x.plan,
      { ...x.providers, ga4 },
      x.sink,
      '2026-09-10T12:00:00Z'
    );
    expect(result.analysis['canonicalOutcomes']).toMatchObject({ families: { current: 7 } });
    expect(JSON.stringify(x.saved.get('ga4-current-outcome-0'))).toContain('app.headstart.health');
    expect(JSON.stringify(x.saved.get('ga4-current-outcome-0'))).toContain('family_complete');
    expect(JSON.stringify(x.saved.get('ga4-current-totals'))).not.toContain('app.headstart.health');
    expect(result.analysis['kpis']).toMatchObject({ 'ga4.organic_sessions': { current: 510 } });
  });
  it('does not turn quality-flagged empty totals into an observed zero', async () => {
    const x = await setup();
    x.plan.report.qualityPolicy = {
      mode: 'allow-with-caveats',
      rationale: 'Directional diagnostic',
    };
    const ga4 = {
      getProperty: (property: string): Promise<unknown> => x.providers.ga4.getProperty(property),
      runReport: async (
        request: Parameters<typeof x.providers.ga4.runReport>[0]
      ): Promise<unknown> => ({
        dimensionHeaders: request.dimensions,
        metricHeaders: request.metrics,
        rows: [],
        rowCount: 0,
        metadata: { timeZone: 'America/Chicago', subjectToThresholding: true },
      }),
    };
    await expect(
      collectOrganicEvidence(x.plan, { ...x.providers, ga4 }, x.sink, '2026-09-10T12:00:00Z')
    ).rejects.toThrow(/cannot be interpreted as observed zero/);
    expect(x.saved.has('report-analysis')).toBe(false);
    expect(x.saved.has('ga4-current-totals')).toBe(true);
  });

  it('keeps the documented collection plan schema-valid', async () => {
    const example: unknown = JSON.parse(
      await readFile(new URL('../examples/collection-plan.example.json', import.meta.url), 'utf8')
    );
    expect(collectionPlanSchema.parse(example).config.publicHostname).toBe('example.test');
  });
  it('collects all four providers and derives the August calculations from raw responses', async () => {
    const x = await setup();
    const result = await collectOrganicEvidence(
      x.plan,
      x.providers,
      x.sink,
      '2026-09-09T12:00:00Z'
    );
    expect(result.bundle.sources.gsc.periodTotals[0]).toMatchObject({
      clicks: 497,
      impressions: 14570,
    });
    expect(result.bundle.sources.ga4.periodTotals[0]).toMatchObject({ sessions: 510 });
    expect(required(result.bundle.sources.tam).keywords).toEqual(
      required(x.bundle.sources.tam).keywords
    );
    expect(result.analysis['contentPillars']).toMatchObject({ summary: { searchVolume: 358150 } });
    expect(x.saved.has('ga4-year_ago-totals')).toBe(true);
    expect(x.saved.has('gsc-current-query-pages')).toBe(true);
    expect(x.saved.has('report-analysis')).toBe(true);
    expect(required(result.bundle.sources.semrush).metadata['historicalKeywordRankings']).toBe(
      false
    );
  });
  it('fails before reporting when provider readiness or scope is wrong', async () => {
    const x = await setup();
    required(x.plan.semrush).domain = 'wrong.test';
    await expect(
      collectOrganicEvidence(x.plan, x.providers, x.sink, '2026-09-09T12:00:00Z')
    ).rejects.toThrow(/scope must agree/);
    required(x.plan.semrush).domain = 'headstart.health';
    x.plan.executionProfile.bindings = [];
    await expect(
      collectOrganicEvidence(x.plan, x.providers, x.sink, '2026-09-09T12:00:00Z')
    ).rejects.toThrow(/Missing provider/);
    const y = await setup();
    const binding = y.plan.executionProfile.bindings[0];
    if (binding === undefined) throw new Error('Synthetic binding absent');
    binding.adapterVersion = '2.0.0';
    await expect(
      collectOrganicEvidence(y.plan, y.providers, y.sink, '2026-09-09T12:00:00Z')
    ).rejects.toThrow(/Unsupported provider/);
  });
  it('validates retained TAM cells while preserving scope exclusions', () => {
    const tam = collectionPlanSchema.shape.tam.unwrap().parse({
      spreadsheetId: 'x',
      range: "'TAM'!A1:E4",
      approvedAt: '2026-07-24',
      approvalScope: 'pillar-direction',
      columns: {
        keyword: 'K',
        pillar: 'P',
        searchVolume: 'V',
        serviceability: 'S',
        marketScope: 'M',
      },
    });
    const range = {
      spreadsheetId: 'x',
      range: tam.range,
      revision: 'v1',
      values: [
        ['K', 'P', 'V', 'S', 'M'],
        ['word', 'pillar', 0, 'Confirmed', 'Core'],
      ],
    };
    expect(mapTamRows(range, tam)[0]).toMatchObject({
      searchVolume: 0,
      serviceability: 'confirmed',
    });
    expect(() =>
      mapTamRows(
        { ...range, values: [range.values[0], ['word', 'pillar', 'bad', 'Confirmed', 'Core']] },
        tam
      )
    ).toThrow(/number/);
    expect(() =>
      mapTamRows(
        { ...range, values: [range.values[0], ['', 'pillar', 1, 'Confirmed', 'Core']] },
        tam
      )
    ).toThrow(/missing/);
  });
});
