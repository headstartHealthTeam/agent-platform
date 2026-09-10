import { normalizeGa4Report } from '@headstart-health/google-analytics-data';
import { parseSemrushCsv } from '@headstart-health/semrush-data';
import { z } from 'zod';

import { canonicalJson } from './analysis.js';
import type { ReportingSources } from './source-config.js';
import type { ReportRows } from './workbook-contract.js';
import { numeric, orderedPeriods, period, type WorkbookEvidence } from './workbook-evidence.js';
import { required } from './workbook-metrics.js';
const organicTraffic = 'Organic Traffic';
const viewPeriod = 'View / period';
const historicalContext = 'Historical domain context';
const trafficShare = 'Traffic (%)';
const extractedAtLabel = 'Extracted at';

function semrushTables(evidence: WorkbookEvidence): Readonly<Record<string, string>>[][] {
  return evidence.views
    .filter((v) => v.name.startsWith('semrush-mcp-read-'))
    .map((v) => {
      const value = z
        .object({
          arguments: z.object({ domain: z.string().optional(), database: z.string().optional() }),
          response: z.unknown(),
        })
        .parse(v.data);
      if (
        value.arguments.domain !== evidence.bundle.config.publicHostname ||
        value.arguments.database !== evidence.bundle.sources.semrush?.metadata.database
      )
        throw new Error('Semrush supplemental target differs from bundle');
      return [...parseSemrushCsv(value.response)];
    });
}
function market(blocks: Map<string, ReportRows>, evidence: WorkbookEvidence): void {
  if (!evidence.bundle.sources.semrush) {
    blocks.set('market.overview', []);
    blocks.set('market.topKeywords', []);
    return;
  }
  const tables = semrushTables(evidence);
  const history = tables.find(
    (rows) => rows[0]?.['Date'] !== undefined && rows[0]['Organic Traffic'] !== undefined
  );
  blocks.set(
    'market.overview',
    orderedPeriods.map((id) => {
      const snapshot = evidence.bundle.sources.semrush?.domainSnapshots.find(
        (r) => r.period === id
      );
      const row = history?.find((r) => r['Date'] === snapshot?.snapshotDate.replaceAll('-', ''));
      return [
        period(evidence, id)?.label ?? 'Unavailable',
        snapshot?.rankingKeywords ?? null,
        row ? numeric(row, organicTraffic) : null,
        row ? numeric(row, 'Organic Cost') : null,
        row ? numeric(row, 'Rank') : null,
      ];
    })
  );
  const keywords = required(
    tables.find((rows) => rows[0]?.['Traffic (%)'] !== undefined),
    'Semrush keyword traffic-share extract'
  );
  // Approved source configuration, never a regex supplied by a ranking query.
  // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern comes from the approved source contract, not a ranking query.
  const brand = new RegExp(
    z.string().parse(evidence.bundle.sources.gsc.metadata['brandRegex']),
    'iu'
  );
  blocks.set(
    'market.topKeywords',
    keywords
      .filter(
        (row) =>
          new URL(required(row['Url'], 'ranking URL')).hostname ===
          evidence.bundle.config.publicHostname
      )
      .sort((a, b) => numeric(b, trafficShare) - numeric(a, trafficShare))
      .slice(0, 5)
      .map((row) => [
        z.string().parse(row['Keyword']),
        brand.test(z.string().parse(row['Keyword'])) ? 'Branded' : 'Non-branded',
        numeric(row, trafficShare) / 100,
      ])
  );
}
function rawGoogle(blocks: Map<string, ReportRows>, evidence: WorkbookEvidence): void {
  const searchRows: ReportRows = [];
  const analyticsRows: ReportRows = [];
  for (const v of evidence.views) {
    if (v.name.startsWith('gsc-')) {
      const raw = z
        .object({
          request: z.object({ dimensions: z.array(z.string()) }),
          rows: z.array(
            z.object({
              keys: z.array(z.string()).optional(),
              clicks: z.number(),
              impressions: z.number(),
              ctr: z.number(),
              position: z.number(),
            })
          ),
        })
        .parse(v.data);
      for (const row of raw.rows)
        searchRows.push([
          v.name,
          raw.request.dimensions.join(', '),
          row.keys?.[0] ?? '',
          row.keys?.[1] ?? '',
          row.clicks,
          row.impressions,
          row.ctr,
          row.position,
          v.extractedAt,
          evidence.bundle.sources.gsc.metadata.sourceId,
        ]);
    }
    if (v.name.startsWith('ga4-')) {
      const raw = z.object({ response: z.unknown() }).parse(v.data);
      for (const row of normalizeGa4Report(raw.response))
        for (const [metric, value] of Object.entries(row.metrics))
          analyticsRows.push([
            v.name,
            canonicalJson(row.dimensions),
            metric,
            Number(value),
            v.extractedAt,
            evidence.bundle.sources.ga4.metadata.sourceId,
          ]);
    }
  }
  blocks.set('raw.gsc.headers', [
    [
      viewPeriod,
      'Dimensions',
      'Dimension value 1',
      'Dimension value 2',
      'Clicks',
      'Impressions',
      'CTR (0–1)',
      'Average position',
      extractedAtLabel,
      'Source',
    ],
  ]);
  blocks.set('raw.gsc', searchRows);
  blocks.set('raw.ga4.headers', [
    [viewPeriod, 'Dimension values', 'Metric', 'Value (rates 0–1)', extractedAtLabel, 'Source'],
  ]);
  blocks.set('raw.ga4', analyticsRows);
}
function rawSemrush(blocks: Map<string, ReportRows>, evidence: WorkbookEvidence): void {
  const rows: ReportRows = [];
  const semrush = evidence.bundle.sources.semrush;
  for (const row of semrush?.domainSnapshots ?? [])
    rows.push([
      'Domain overview',
      row.period,
      row.snapshotDate,
      'rankingKeywords',
      row.rankingKeywords,
      null,
      null,
      null,
      semrush?.metadata.extractedAt ?? null,
    ]);
  for (const row of semrush?.rankings ?? [])
    rows.push([
      'Keyword ranking',
      'snapshot',
      z.string().parse(semrush?.metadata['keywordSnapshotDate'] ?? ''),
      row.keyword,
      row.searchVolume,
      row.position,
      row.url,
      null,
      semrush?.metadata.extractedAt ?? null,
    ]);
  for (const row of evidence.bundle.sources.tam?.keywords ?? [])
    rows.push([
      'Approved Core TAM',
      row.serviceability,
      evidence.bundle.sources.tam?.metadata.approvedAt ?? null,
      row.keyword,
      row.searchVolume,
      null,
      null,
      row.pillar,
      evidence.bundle.sources.tam?.metadata.extractedAt ?? null,
    ]);
  rows.push(...historicalRows(evidence));
  blocks.set('raw.semrush.headers', [
    [
      'Record type',
      'Period / scope',
      'Snapshot / approval date',
      'Keyword / metric',
      'Volume / value',
      'Position / cost',
      'URL / rank',
      'Pillar',
      extractedAtLabel,
    ],
  ]);
  blocks.set('raw.semrush', rows);
}
function historicalRows(evidence: WorkbookEvidence): ReportRows {
  const semrush = evidence.bundle.sources.semrush;
  if (!semrush) return [];
  const unique = new Map(
    semrushTables(evidence)
      .filter((table) => table[0]?.['Date'] !== undefined)
      .flatMap((table) => table.map((row) => [canonicalJson(row), row] as const))
  );
  return [...unique.values()].map((row) => [
    historicalContext,
    'snapshot',
    row['Date'] ?? null,
    'estimatedTraffic / cost / rank',
    numeric(row, organicTraffic),
    numeric(row, 'Organic Cost'),
    numeric(row, 'Rank'),
    null,
    semrush.metadata.extractedAt,
  ]);
}
function methodology(
  blocks: Map<string, ReportRows>,
  evidence: WorkbookEvidence,
  sources: ReportingSources
): void {
  const bundle = evidence.bundle;
  blocks.set('method.contract', [
    ['Public hostname', bundle.config.publicHostname, 'Exact-host scope; subdomains are separate'],
    ...bundle.report.periods.map((p) => [p.id, `${p.startDate} to ${p.endDate}`, p.label]),
    [
      'Comparison method',
      bundle.report.comparisonPolicy?.method ?? 'equal-length',
      bundle.report.comparisonPolicy?.rationale ?? 'Declared reporting periods',
    ],
    [
      'GA4 timezone',
      bundle.sources.ga4.metadata.timeZone,
      'Not the same as GSC reporting timezone',
    ],
    ['Organic channel', bundle.sources.ga4.metadata.channelFilter, 'Session-scoped acquisition'],
    [
      'Brand regex',
      z.string().parse(bundle.sources.gsc.metadata['brandRegex'] ?? ''),
      'Source-filtered non-branded totals',
    ],
    ['Registry version', bundle.config.configVersion, 'Explicit route/audience mappings'],
    [
      'Template / sources',
      `${sources.template.version}; ${sources.version}`,
      'Native layout plus independently authored narrative',
    ],
  ]);
  blocks.set('method.sources', [
    [
      'GSC',
      'Observed search clicks and impressions',
      'Visits or complete query census',
      bundle.sources.gsc.metadata.extractedAt,
      `https://search.google.com/search-console?resource_id=${encodeURIComponent(bundle.sources.gsc.metadata.sourceId)}`,
    ],
    [
      'GA4',
      'Organic sessions, engagement, canonical events',
      'Same counting system as GSC',
      bundle.sources.ga4.metadata.extractedAt,
      'https://analytics.google.com/analytics/web/',
    ],
    [
      'Semrush',
      'Modeled rankings and market estimates',
      'First-party traffic or causal impact',
      bundle.sources.semrush?.metadata.extractedAt ?? 'Not selected',
      'https://www.semrush.com/analytics/organic/overview/',
    ],
    [
      'Approved TAM',
      'Fixed keyword planning universe',
      'Traffic, lead or revenue forecast',
      bundle.sources.tam?.metadata.extractedAt ?? 'Not selected',
      sources.tam.url,
    ],
  ]);
  blocks.set('method.references', [
    ['Approved report', sources.approvedReport.url],
    ['Content-pillar strategy', sources.strategy.url],
    ['Core Search TAM', sources.tam.url],
    ['Clean native template', sources.template.url],
    ['Approval provenance', sources.approvalEvidence[0]?.url ?? null],
  ]);
  blocks.set(
    'method.audiences',
    bundle.config.audienceRegistry.map((rule) => {
      const outcome = bundle.config.outcomeRegistry.find((r) => r.audience === rule.id);
      return [
        title(rule.id),
        [...rule.exactPaths, ...rule.prefixes.map((p) => p + '/*')].join(', '),
        outcome?.eventName ?? 'Not instrumented in selected period contract',
        outcome?.measurementLifecycle?.launchedOn ?? 'See selected event contract',
        'Shared/unassigned routes remain outside audience rollups.',
      ];
    })
  );
}
function title(value: string): string {
  return value.replaceAll('_', ' ');
}
export function supplementalFacts(
  evidence: WorkbookEvidence,
  sources: ReportingSources
): Map<string, ReportRows> {
  const blocks = new Map<string, ReportRows>();
  market(blocks, evidence);
  rawGoogle(blocks, evidence);
  rawSemrush(blocks, evidence);
  methodology(blocks, evidence, sources);
  for (const source of ['gsc', 'ga4', 'semrush'])
    blocks.set(`raw.${source}.scope`, [
      [
        `${evidence.bundle.config.publicHostname}; complete retained normalized evidence supporting the selected report. Rates are decimal fractions unless explicitly labeled; no raw counts are inferred from presentation cells.`,
      ],
    ]);
  return blocks;
}
