import { executionProfileSchema } from '@headstart-health/capability-contracts';
import { verifyExecutionReadiness } from '@headstart-health/capability-runtime';
import {
  collectGa4Report,
  ga4QualityFlags,
  ga4ReportRequirement,
  normalizeGa4Report,
  preflightGa4,
  type GoogleAnalyticsReadProvider,
  type NormalizedGa4Row,
} from '@headstart-health/google-analytics-data';
import {
  buildSearchAnalyticsRequest,
  preflightSearchConsole,
  runPaginatedSearch,
  searchConsoleRequirement,
  type SearchConsoleClient,
  type SearchAnalyticsRequest,
} from '@headstart-health/google-search-console';
import {
  googleSheetsRangeRequirement,
  preflightGoogleSheets,
  rowsFromHeaderRange,
  sheetRangeSchema,
  type GoogleSheetsReadProvider,
} from '@headstart-health/google-sheets-data';
import {
  preflightSemrush,
  semrushDomainOverviewSchema,
  semrushDomainRequestSchema,
  semrushDomainRequirement,
  normalizeSemrushRankings,
  type SemrushReadProvider,
} from '@headstart-health/semrush-data';
import { z } from 'zod';

import { analyzeBundle } from './analysis.js';
import { validateOptionalSources, validateReportPeriods } from './report-contract.js';
import {
  organicPerformanceBundleSchema,
  periodIdSchema,
  type OrganicPerformanceBundle,
  type PeriodId,
} from './schemas.js';
import { exactPublicHostFilter } from './source-scope.js';

export const collectionPlanSchema = z
  .object({
    schemaVersion: z.literal('organic-performance-collection/v1'),
    report: organicPerformanceBundleSchema.shape.report,
    config: organicPerformanceBundleSchema.shape.config,
    executionProfile: executionProfileSchema,
    gsc: z
      .object({
        siteUrl: z.string().min(1),
        brandRegex: z.string().min(1),
        maxRows: z.number().int().positive().default(100_000),
      })
      .strict(),
    ga4: z
      .object({
        property: z.string().regex(/^properties\/\d+$/),
        expectedTimeZone: z.string().min(1),
        maxRows: z.number().int().positive().default(100_000),
      })
      .strict(),
    semrush: z
      .object({
        domain: z.string().min(1),
        database: z.string().min(1),
        device: z.literal('desktop'),
        limit: z.number().int().positive().default(10_000),
        snapshotDates: z.partialRecord(periodIdSchema, z.iso.date()),
      })
      .strict()
      .optional(),
    tam: z
      .object({
        spreadsheetId: z.string().min(1),
        range: z.string().min(1),
        approvedAt: z.iso.date(),
        approvalScope: z.enum(['pillar-direction', 'keyword-rows']),
        columns: z
          .object({
            keyword: z.string(),
            pillar: z.string(),
            searchVolume: z.string(),
            serviceability: z.string(),
            marketScope: z.string(),
          })
          .strict(),
        coreValue: z.string().default('Core'),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CollectionPlan = z.infer<typeof collectionPlanSchema>;
export interface CollectionProviders {
  readonly gsc: SearchConsoleClient;
  readonly ga4: GoogleAnalyticsReadProvider;
  readonly sheets?: GoogleSheetsReadProvider;
  readonly semrush?: SemrushReadProvider;
}
export interface EvidenceSink {
  save(name: string, value: unknown): Promise<void>;
}
const gscRowsSchema = z.object({
  rows: z.array(
    z.object({
      keys: z.array(z.string()).optional(),
      clicks: z.number(),
      impressions: z.number(),
      ctr: z.number(),
      position: z.number(),
    })
  ),
  pagination: z.object({ truncatedAtMaxRows: z.boolean() }).optional(),
});
type GscRows = z.infer<typeof gscRowsSchema>['rows'];
type Period = OrganicPerformanceBundle['report']['periods'][number];
type QualityIssue = NonNullable<
  OrganicPerformanceBundle['sources']['ga4']['metadata']['qualityIssues']
>[number];

function member(row: Readonly<Record<string, string>>, name: string): string {
  const value = Object.entries(row).find(([key]) => key === name)?.[1];
  if (value === undefined || value.trim() === '')
    throw new Error(`Required source field ${name} is missing`);
  return value;
}
function numberMember(row: Readonly<Record<string, string>>, name: string): number {
  const value = Number(member(row, name));
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`Required source field ${name} is not a nonnegative number`);
  return value;
}
export function mapTamRows(
  input: unknown,
  plan: NonNullable<CollectionPlan['tam']>
): NonNullable<OrganicPerformanceBundle['sources']['tam']>['keywords'] {
  const rows = rowsFromHeaderRange(input);
  return rows
    .filter((row) => Object.values(row).some((value) => value !== ''))
    .filter((row) => member(row, plan.columns.marketScope) === plan.coreValue)
    .map((row) => ({
      keyword: member(row, plan.columns.keyword),
      pillar: member(row, plan.columns.pillar),
      searchVolume: numberMember(row, plan.columns.searchVolume),
      serviceability: z
        .enum(['confirmed', 'conditional'])
        .parse(member(row, plan.columns.serviceability).toLowerCase()),
    }));
}
async function collectGsc(
  plan: CollectionPlan,
  provider: SearchConsoleClient,
  sink: EvidenceSink,
  period: Period,
  view: string,
  dimensions: SearchAnalyticsRequest['dimensions'],
  nonBranded = false
): Promise<GscRows> {
  const filters: SearchAnalyticsRequest['dimensionFilterGroups'][number]['filters'] = [
    exactPublicHostFilter(plan.config.publicHostname),
  ];
  if (nonBranded)
    filters.push({
      dimension: 'query',
      operator: 'excludingRegex',
      expression: plan.gsc.brandRegex,
    });
  const request = buildSearchAnalyticsRequest({
    startDate: period.startDate,
    endDate: period.endDate,
    dimensions,
    dimensionFilterGroups: [{ groupType: 'and', filters }],
  });
  const result = await runPaginatedSearch(provider, plan.gsc.siteUrl, request, {
    allPages: true,
    maxRows: plan.gsc.maxRows,
  });
  await sink.save(`gsc-${period.id}-${view}`, result);
  const parsed = gscRowsSchema.parse(result);
  if (parsed.pagination?.truncatedAtMaxRows !== false)
    throw new Error(`GSC ${view} extraction is incomplete`);
  return parsed.rows;
}
function gscTotals(
  rows: GscRows,
  period: PeriodId
): OrganicPerformanceBundle['sources']['gsc']['periodTotals'][number] {
  if (rows.length > 1) throw new Error('GSC totals returned multiple rows');
  const row = rows[0];
  return {
    period,
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    averagePosition: row?.position ?? 0,
  };
}
function dimension(row: GscRows[number]): string {
  return z.string().min(1).parse(row.keys?.[0]);
}
async function collectGa(
  plan: CollectionPlan,
  provider: GoogleAnalyticsReadProvider,
  sink: EvidenceSink,
  qualityIssues: QualityIssue[],
  period: Period,
  view: string,
  dimensions: readonly string[],
  metrics: readonly string[],
  options: { organic?: boolean; hostname?: string; eventName?: string } = {}
): Promise<readonly NormalizedGa4Row[]> {
  const expressions = [
    {
      filter: {
        fieldName: 'hostName',
        stringFilter: {
          matchType: 'EXACT',
          value: options.hostname ?? plan.config.publicHostname,
          caseSensitive: true,
        },
      },
    },
  ];
  if (options.organic !== false)
    expressions.push({
      filter: {
        fieldName: 'sessionDefaultChannelGroup',
        stringFilter: { matchType: 'EXACT', value: 'Organic Search', caseSensitive: true },
      },
    });
  if (options.eventName)
    expressions.push({
      filter: {
        fieldName: 'eventName',
        stringFilter: { matchType: 'EXACT', value: options.eventName, caseSensitive: true },
      },
    });
  const request = {
    property: plan.ga4.property,
    dateRanges: [{ startDate: period.startDate, endDate: period.endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    dimensionFilter: { andGroup: { expressions } },
  };
  const response = await collectGa4Report(
    provider,
    request,
    plan.ga4.maxRows,
    plan.report.qualityPolicy?.mode
  );
  await sink.save(`ga4-${period.id}-${view}`, { request, response });
  const flags = ga4QualityFlags(response);
  if (flags.length > 0) qualityIssues.push({ period: period.id, view, flags: [...flags] });
  if (view === 'totals' && flags.length > 0 && response.rows.length === 0)
    throw new Error('Flagged empty GA4 totals cannot be interpreted as observed zero');
  if (response.metadata?.timeZone !== plan.ga4.expectedTimeZone)
    throw new Error('GA4 returned an unexpected property timezone');
  return normalizeGa4Report(response);
}
async function preflight(
  plan: CollectionPlan,
  providers: CollectionProviders,
  sink: EvidenceSink
): Promise<void> {
  const requirements = [
    searchConsoleRequirement(plan.gsc.siteUrl),
    ga4ReportRequirement(plan.ga4.property),
    ...(plan.tam ? [googleSheetsRangeRequirement(plan.tam)] : []),
    ...(plan.semrush ? [semrushDomainRequirement(plan.semrush)] : []),
  ];
  const binding = (id: string): { providerId: string; adapterVersion: string } => {
    const result = plan.executionProfile.bindings.find((x) => x.capabilityId === id);
    if (result === undefined) throw new Error(`Missing provider binding for ${id}`);
    const expected = id.startsWith('google-search-console')
      ? 'google-search-console-rest'
      : id.startsWith('google-analytics')
        ? 'google-analytics-rest'
        : id.startsWith('google-sheets')
          ? 'google-sheets-rest'
          : 'semrush-mcp';
    if (result.providerId !== expected || result.adapterVersion !== '0.1.0')
      throw new Error(`Unsupported provider binding for ${id}`);
    return result;
  };
  const results = await Promise.all([
    preflightSearchConsole(providers.gsc, {
      siteUrl: plan.gsc.siteUrl,
      ...binding('google-search-console.performance.read'),
    }),
    preflightGa4(providers.ga4, {
      property: plan.ga4.property,
      ...binding('google-analytics.ga4-report.read'),
    }),
    ...(plan.tam
      ? [
          preflightGoogleSheets(requiredProvider(providers.sheets, 'Google Sheets'), {
            ...plan.tam,
            ...binding('google-sheets.range.read'),
          }),
        ]
      : []),
    ...(plan.semrush
      ? [
          preflightSemrush(requiredProvider(providers.semrush, 'Semrush'), {
            request: {
              domain: plan.semrush.domain,
              database: plan.semrush.database,
              device: plan.semrush.device,
            },
            ...binding('semrush.domain-organic.read'),
          }),
        ]
      : []),
  ]);
  await sink.save('preflight', results);
  verifyExecutionReadiness(plan.executionProfile, requirements, results);
}
function requiredProvider<T>(provider: T | undefined, name: string): T {
  if (provider === undefined) throw new Error(`Missing configured ${name} provider`);
  return provider;
}
export async function collectOrganicEvidence(
  input: unknown,
  providers: CollectionProviders,
  sink: EvidenceSink,
  extractedAt: string
): Promise<{ bundle: OrganicPerformanceBundle; analysis: Readonly<Record<string, unknown>> }> {
  const plan = collectionPlanSchema.parse(input);
  z.iso.datetime().parse(extractedAt);
  validateReportPeriods(plan.report);
  validateOptionalSources(plan.report, { semrush: plan.semrush, tam: plan.tam });
  if (plan.semrush && plan.config.publicHostname !== plan.semrush.domain)
    throw new Error('Semrush and public host scope must agree');
  await preflight(plan, providers, sink);
  const gsc: OrganicPerformanceBundle['sources']['gsc'] = {
    metadata: {
      sourceId: plan.gsc.siteUrl,
      extractedAt,
      complete: true,
      dataState: 'final',
      filters: [exactPublicHostFilter(plan.config.publicHostname)],
      brandRegex: plan.gsc.brandRegex,
    },
    periodTotals: [],
    nonBrandedTotals: [],
    pageRows: [],
    queryRows: [],
  };
  const ga4: OrganicPerformanceBundle['sources']['ga4'] = {
    metadata: {
      sourceId: plan.ga4.property,
      extractedAt,
      complete: true,
      timeZone: plan.ga4.expectedTimeZone,
      channelFilter: 'sessionDefaultChannelGroup=Organic Search',
      hostname: plan.config.publicHostname,
    },
    periodTotals: [],
    landingPageRows: [],
    eventRows: [],
  };
  const qualityIssues: QualityIssue[] = [];
  for (const period of plan.report.periods) {
    const [totals, nonBranded, pages, queries] = await Promise.all([
      collectGsc(plan, providers.gsc, sink, period, 'totals', []),
      collectGsc(plan, providers.gsc, sink, period, 'nonbranded-totals', [], true),
      collectGsc(plan, providers.gsc, sink, period, 'pages', ['page']),
      collectGsc(plan, providers.gsc, sink, period, 'queries', ['query']),
    ]);
    gsc.periodTotals.push(gscTotals(totals, period.id));
    gsc.nonBrandedTotals.push(gscTotals(nonBranded, period.id));
    gsc.pageRows.push(
      ...pages.map((row) => ({
        period: period.id,
        url: dimension(row),
        clicks: row.clicks,
        impressions: row.impressions,
      }))
    );
    gsc.queryRows.push(
      ...queries.map((row) => ({
        period: period.id,
        query: dimension(row),
        clicks: row.clicks,
        impressions: row.impressions,
      }))
    );
    await Promise.all([
      collectGsc(plan, providers.gsc, sink, period, 'daily', ['date']),
      collectGsc(plan, providers.gsc, sink, period, 'query-pages', ['query', 'page']),
      collectGsc(plan, providers.gsc, sink, period, 'nonbranded-queries', ['query'], true),
    ]);
    const totalMetrics = [
      'sessions',
      'activeUsers',
      'newUsers',
      'engagedSessions',
      'engagementRate',
      'keyEvents',
      'sessionKeyEventRate',
    ];
    const gaTotals = await collectGa(
      plan,
      providers.ga4,
      sink,
      qualityIssues,
      period,
      'totals',
      [],
      totalMetrics
    );
    if (gaTotals.length > 1) throw new Error('GA4 totals returned multiple rows');
    const gaTotal = gaTotals[0];
    ga4.periodTotals.push({
      period: period.id,
      ...Object.fromEntries(
        totalMetrics.map((metric) => [
          metric,
          gaTotal === undefined ? 0 : numberMember(gaTotal.metrics, metric),
        ])
      ),
    });
    const landing = await collectGa(
      plan,
      providers.ga4,
      sink,
      qualityIssues,
      period,
      'landing-pages',
      ['landingPage'],
      [
        'sessions',
        'activeUsers',
        'newUsers',
        'engagedSessions',
        'keyEvents',
        'engagementRate',
        'sessionKeyEventRate',
      ]
    );
    ga4.landingPageRows.push(
      ...landing.map((row) => ({
        period: period.id,
        landingPage: member(row.dimensions, 'landingPage'),
        sessions: numberMember(row.metrics, 'sessions'),
        engagedSessions: numberMember(row.metrics, 'engagedSessions'),
        keyEvents: numberMember(row.metrics, 'keyEvents'),
      }))
    );
    const events = await collectGa(
      plan,
      providers.ga4,
      sink,
      qualityIssues,
      period,
      'events',
      ['eventName'],
      ['eventCount', 'keyEvents']
    );
    ga4.eventRows.push(
      ...events.map((row) => ({
        period: period.id,
        eventName: member(row.dimensions, 'eventName'),
        keyEvents: numberMember(row.metrics, 'keyEvents'),
      }))
    );
    await collectGa(
      plan,
      providers.ga4,
      sink,
      qualityIssues,
      period,
      'daily',
      ['date'],
      totalMetrics
    );
    await collectGa(
      plan,
      providers.ga4,
      sink,
      qualityIssues,
      period,
      'channels',
      ['sessionDefaultChannelGroup'],
      ['sessions', 'activeUsers', 'engagementRate', 'keyEvents'],
      { organic: false }
    );
    const scoped = await collectOutcomes(plan, providers.ga4, sink, qualityIssues, period);
    if (scoped.length > 0) ga4.outcomeRows = [...(ga4.outcomeRows ?? []), ...scoped];
  }
  if (qualityIssues.length > 0) ga4.metadata.qualityIssues = qualityIssues;
  const semrush = plan.semrush
    ? await collectSemrush(
        plan.semrush,
        requiredProvider(providers.semrush, 'Semrush'),
        sink,
        plan.report.periods,
        extractedAt
      )
    : undefined;
  const tam = plan.tam
    ? await collectTam(
        plan.tam,
        requiredProvider(providers.sheets, 'Google Sheets'),
        sink,
        extractedAt
      )
    : undefined;
  const bundle = organicPerformanceBundleSchema.parse({
    schemaVersion: 'organic-performance-bundle/v1',
    report: plan.report,
    config: plan.config,
    sources: { gsc, ga4, ...(semrush ? { semrush } : {}), ...(tam ? { tam } : {}) },
  });
  const analysis = analyzeBundle(bundle);
  await sink.save('report-bundle', bundle);
  await sink.save('report-analysis', analysis);
  return { bundle, analysis };
}

async function collectSemrush(
  plan: NonNullable<CollectionPlan['semrush']>,
  provider: SemrushReadProvider,
  sink: EvidenceSink,
  periods: readonly Period[],
  extractedAt: string
): Promise<NonNullable<OrganicPerformanceBundle['sources']['semrush']>> {
  const domainSnapshots: NonNullable<
    OrganicPerformanceBundle['sources']['semrush']
  >['domainSnapshots'] = [];
  for (const period of periods) {
    const snapshotDate = plan.snapshotDates[period.id];
    if (!snapshotDate) throw new Error('Semrush snapshot date is missing for a declared period');
    if (snapshotDate < period.startDate || snapshotDate > period.endDate)
      throw new Error('Semrush snapshot date is outside its reporting period');
    const overview = semrushDomainOverviewSchema.parse(
      await provider.domainOverview(
        semrushDomainRequestSchema.parse({
          domain: plan.domain,
          database: plan.database,
          device: plan.device,
          snapshotDate: snapshotDate.replaceAll('-', ''),
        })
      )
    );
    await sink.save(`semrush-${period.id}-overview`, overview);
    if (overview.snapshotDate !== snapshotDate)
      throw new Error('Semrush historical snapshot date mismatch');
    domainSnapshots.push({
      period: period.id,
      snapshotDate,
      rankingKeywords: overview.rankingKeywords,
    });
  }
  const rankings = normalizeSemrushRankings(
    await provider.domainOrganicKeywords(
      semrushDomainRequestSchema.parse({
        domain: plan.domain,
        database: plan.database,
        device: plan.device,
        limit: plan.limit,
      })
    )
  );
  await sink.save('semrush-current-keyword-rankings', rankings);
  return {
    metadata: {
      sourceId: `semrush:${plan.domain}`,
      extractedAt,
      complete: true,
      database: plan.database,
      device: plan.device,
      keywordSnapshotDate: extractedAt.slice(0, 10),
      historicalKeywordRankings: false,
    },
    domainSnapshots,
    rankings: [...rankings],
  };
}

async function collectTam(
  plan: NonNullable<CollectionPlan['tam']>,
  provider: GoogleSheetsReadProvider,
  sink: EvidenceSink,
  extractedAt: string
): Promise<NonNullable<OrganicPerformanceBundle['sources']['tam']>> {
  const tamRange = sheetRangeSchema.parse(await provider.readRange(plan.spreadsheetId, plan.range));
  await sink.save('tam-range', tamRange);
  const keywords = mapTamRows(tamRange, plan);
  if (keywords.length === 0) throw new Error('Approved TAM source has no Core rows');
  return {
    metadata: {
      sourceId: plan.spreadsheetId,
      range: plan.range,
      sourceRevision: tamRange.revision,
      approvedAt: plan.approvedAt,
      approvalScope: plan.approvalScope,
      extractedAt,
      complete: true,
    },
    keywords,
  };
}

async function collectOutcomes(
  plan: CollectionPlan,
  provider: GoogleAnalyticsReadProvider,
  sink: EvidenceSink,
  qualityIssues: QualityIssue[],
  period: Period
): Promise<NonNullable<OrganicPerformanceBundle['sources']['ga4']['outcomeRows']>> {
  const results: NonNullable<OrganicPerformanceBundle['sources']['ga4']['outcomeRows']> = [];
  for (const [index, outcome] of plan.config.outcomeRegistry.entries()) {
    if (!outcome.measurement || outcome.eventName === null) continue;
    const { hostname, metric } = outcome.measurement;
    const rows = await collectGa(
      plan,
      provider,
      sink,
      qualityIssues,
      period,
      `outcome-${String(index)}`,
      [],
      [metric],
      { hostname, eventName: outcome.eventName }
    );
    if (rows.length > 1) throw new Error('Scoped outcome totals returned multiple rows');
    results.push({
      audience: outcome.audience,
      period: period.id,
      eventName: outcome.eventName,
      hostname,
      metric,
      value: rows[0] ? numberMember(rows[0].metrics, metric) : null,
    });
  }
  return results;
}
