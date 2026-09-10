import { z } from 'zod';

import { analyzeBundle, classifyPath, normalizeKeyword, sha256Json } from './analysis.js';
import { buildLifecycle } from './lifecycle.js';
import { reportingSourcesSchema } from './source-config.js';
import { workbookTemplateSchema, type ReportRows, type ReportValue } from './workbook-contract.js';
import {
  evidenceReferences,
  gaView,
  gscView,
  landingPages,
  numeric,
  orderedPeriods,
  period,
  publicPages,
  ratio,
  workbookEvidenceSchema,
  validateWorkbookEvidence,
  type WorkbookEvidence,
  type LandingRow,
} from './workbook-evidence.js';
import {
  audienceRows,
  cohortSeries,
  delta,
  item,
  required,
  seriesRow,
  total,
  workbookAnalysisSchema,
  type WorkbookAnalysis,
} from './workbook-metrics.js';
import { supplementalFacts } from './workbook-supplement.js';

const SEARCH_PAGES = 'search.pages';
const SEARCH_QUERIES = 'search.queries';
const ACQUISITION_EVENTS = 'acquisition.events';
const ACQUISITION_CHANNELS = 'acquisition.channels';
const ACQUISITION_PAGES = 'acquisition.pages';
const CONTENT_PAGES = 'content.pages';
export const workbookSelectionSchema = z
  .partialRecord(
    z.enum([
      SEARCH_PAGES,
      SEARCH_QUERIES,
      ACQUISITION_EVENTS,
      ACQUISITION_CHANNELS,
      ACQUISITION_PAGES,
      CONTENT_PAGES,
    ]),
    z.array(z.string().min(1))
  )
  .default({});
type Selection = z.infer<typeof workbookSelectionSchema>;
type Blocks = Map<string, ReportRows>;
const sitewideKeys = [
  'gsc.clicks',
  'gsc.impressions',
  'gsc.ctr',
  'ga4.organic_sessions',
  'ga4.engagement_rate',
  'semrush.ranking_keywords',
  'gsc.nonbranded_impressions',
];
function select<T>(
  rows: readonly T[],
  key: (row: T) => string,
  size: number,
  chosen?: readonly string[]
): T[] {
  if (!chosen) return rows.slice(0, size);
  if (chosen.length > size || new Set(chosen).size !== chosen.length)
    throw new Error('Invalid or overflowing diagnostic selection');
  return chosen.map((value) =>
    required(
      rows.find((row) => key(row) === value),
      value
    )
  );
}
function label(evidence: WorkbookEvidence, id: (typeof orderedPeriods)[number]): string {
  return period(evidence, id)?.label ?? 'Unavailable';
}
function title(id: string): string {
  return id.replaceAll('_', ' ');
}
function scope(evidence: WorkbookEvidence): string {
  return `${evidence.bundle.config.publicHostname}; ${evidence.bundle.report.periods.map((p) => `${p.label}: ${p.startDate} to ${p.endDate}`).join('; ')}. Source timestamps are retained in raw tabs.`;
}
function cards(blocks: Blocks, analysis: WorkbookAnalysis): void {
  const key = (name: string): z.infer<typeof workbookAnalysisSchema>['kpis'][string] =>
    required(item(analysis.kpis, name), name);
  const groups = [
    [key('gsc.clicks'), key('gsc.impressions'), key('ga4.organic_sessions')],
    [
      key('ga4.engagement_rate'),
      required(item(analysis.canonicalOutcomes, 'bcbas'), 'bcbas'),
      key('semrush.ranking_keywords'),
    ],
  ];
  const signed = (value: ReportValue): string =>
    value === null
      ? 'N/A'
      : typeof value === 'number'
        ? `${value >= 0 ? '+' : ''}${(100 * value).toFixed(1)}%`
        : String(value);
  groups.forEach((group, index) => {
    const values: ReportValue[] = [];
    const changes: ReportValue[] = [];
    group.forEach((row, column) => {
      values[column * 4] =
        index === 1 && column === 0 && row.current !== null
          ? `${(100 * row.current).toFixed(1)}%`
          : row.current;
      const projected = seriesRow(row);
      changes[column * 4] =
        `MoM ${signed(projected[2] ?? null)} | YoY ${signed(projected[4] ?? null)}`;
    });
    blocks.set(`cards.values${String(index + 1)}`, [
      Array.from({ length: 12 }, (_, index_) => values.at(index_) ?? null),
    ]);
    blocks.set(`cards.changes${String(index + 1)}`, [
      Array.from({ length: 12 }, (_, index_) => changes.at(index_) ?? null),
    ]);
  });
}
function scorecard(blocks: Blocks, evidence: WorkbookEvidence, analysis: WorkbookAnalysis): void {
  blocks.set(
    'kpi.sitewide',
    sitewideKeys.map((key) => seriesRow(required(item(analysis.kpis, key), key)))
  );
  for (const id of ['families', 'bcbas', 'rbts']) {
    blocks.set(`kpi.${id}`, audienceRows(evidence, analysis, id));
    blocks.set(`kpi.${id}.source`, [
      [
        item(analysis.canonicalOutcomes, id)?.eventName === null
          ? 'Not instrumented'
          : 'GA4 exact event',
      ],
    ]);
  }
  const pillars = analysis.contentPillars;
  const coverage = pillars ? (item(pillars.summary, 'confirmedTop10Coverage') ?? null) : null;
  const top20 =
    evidence.bundle.sources.tam && evidence.bundle.sources.semrush
      ? new Set(
          evidence.bundle.sources.tam.keywords
            .filter((row) =>
              evidence.bundle.sources.semrush?.rankings.some(
                (rank) =>
                  normalizeKeyword(rank.keyword) === normalizeKeyword(row.keyword) &&
                  new URL(rank.url).hostname === evidence.bundle.config.publicHostname &&
                  rank.position <= 20
              )
            )
            .map((row) => row.pillar)
        ).size
      : null;
  blocks.set('kpi.tam', [
    [pillars ? (item(pillars.summary, 'searchVolume') ?? null) : null, null, null, 'Core keywords'],
    [
      coverage,
      null,
      null,
      pillars ? (item(pillars.summary, 'confirmedSearchVolume') ?? null) : null,
    ],
    [top20, null, null, pillars ? Object.keys(pillars.pillars).length : null],
  ]);
  blocks.set('scorecard.usage', [
    [
      'Read the sitewide context, then each audience. Missing or ineligible comparisons remain blank; supporting tabs retain observations and evidence.',
    ],
  ]);
}
function segments(blocks: Blocks, evidence: WorkbookEvidence, analysis: WorkbookAnalysis): void {
  const rules = evidence.bundle.config.routeRegistry;
  const ids = [...rules.map((r) => r.id), evidence.bundle.config.unmatchedSegment];
  const lifecycle = buildLifecycle(evidence.bundle.report.periods, rules);
  const landing = landingPages(evidence, 'current');
  blocks.set(
    'segments.gsc',
    ids.map((id) => {
      const rule = rules.find((r) => r.id === id);
      const clicks = cohortSeries(evidence, analysis.segments.gsc, id, 'clicks', rule);
      const impressions = cohortSeries(evidence, analysis.segments.gsc, id, 'impressions', rule);
      return [
        title(id),
        rule
          ? [...rule.exactPaths, ...rule.prefixes.map((p) => p + '/*')].join(', ')
          : 'Unmatched paths',
        ...clicks,
        ...impressions,
        lifecycle.find((r) => r.id === id)?.state ?? 'available',
      ];
    })
  );
  blocks.set(
    'segments.ga4',
    ids.map((id) => {
      const rule = rules.find((r) => r.id === id);
      return [
        title(id),
        ...cohortSeries(evidence, analysis.segments.ga4, id, 'sessions', rule),
        cohortSeries(evidence, analysis.segments.ga4, id, 'engagementRate', rule)[0] ?? null,
        cohortSeries(evidence, analysis.segments.ga4, id, 'keyEvents', rule)[0] ?? null,
        lifecycle.find((row) => row.id === id)?.current.status === 'pre_launch'
          ? null
          : segmentEventRate(evidence, landing, id),
      ];
    })
  );
  blocks.set(
    'segments.nonbrand',
    ['clicks', 'impressions', 'ctr', 'averagePosition'].map((metric) => {
      const values = orderedPeriods.map((id) => total(evidence.bundle, 'gsc', id, metric, true));
      const current = values[0] ?? null;
      const previous = values[1] ?? null;
      const yearAgo = values[2] ?? null;
      const mode = metric === 'ctr' ? 'rate' : metric === 'averagePosition' ? 'absolute' : 'count';
      return [
        metric,
        current,
        previous,
        delta(current, previous, mode),
        yearAgo,
        delta(current, yearAgo, mode),
      ];
    })
  );
  blocks.set(
    'segments.rankingBands',
    orderedPeriods.map((id) => {
      if (!period(evidence, id)) return [label(evidence, id), null, null, null, null, null];
      const rows = gscView(evidence, id, 'nonbranded-queries');
      return [
        label(evidence, id),
        rows.length,
        ...[
          [1, 3],
          [3, 10],
          [10, 20],
          [20, Infinity],
        ].map(
          ([min, max], index) =>
            rows.filter(
              (r) =>
                r.position !== null &&
                r.position >= (min ?? 0) &&
                (index === 0 || r.position > (min ?? 0)) &&
                r.position <= (max ?? Infinity)
            ).length
        ),
      ];
    })
  );
  blocks.set(
    'segments.marketplace',
    orderedPeriods.map((id) => [label(evidence, id), null, null, null, null, 'Not collected'])
  );
  blocks.set('segments.policy', [
    [
      'New section',
      'Verified production date',
      'Two full post-launch months',
      'Thirteen full post-launch months',
      'Initiative Impact',
    ],
    [
      'Established audiences',
      'Retain their existing history',
      'Comparable recorded periods',
      'Comparable recorded periods',
      'KPI Scorecard',
    ],
    [
      'Outcome instrumentation',
      'Verified event-specific effective date',
      'Separate from audience acquisition',
      'Never substitute mixed key events',
      'Methodology',
    ],
  ]);
  blocks.set(
    'initiatives.lifecycle',
    lifecycle
      .filter((r) => r.launchedOn)
      .map((r) => {
        const start = required(r.firstFullMonth ?? undefined, 'first full month');
        const shifted = (months: number): string => {
          const date = new Date(start + 'T00:00:00Z');
          date.setUTCMonth(date.getUTCMonth() + months);
          return date.toISOString().slice(0, 7);
        };
        return [title(r.id), r.launchedOn, start.slice(0, 7), shifted(1), shifted(12)];
      })
  );
  blocks.set('initiatives.boundary', [
    [
      'Verified availability and comparison eligibility are factual constraints, not automatic conclusions about impact. Partial-month observations remain available; narrative is agent-authored.',
    ],
  ]);
}
function segmentEventRate(
  evidence: WorkbookEvidence,
  rows: readonly LandingRow[],
  id: string
): number | null {
  const selected = rows.filter(
    (row) =>
      classifyPath(
        row.path,
        evidence.bundle.config.routeRegistry,
        evidence.bundle.config.unmatchedSegment
      ) === id
  );
  return ratio(
    selected.reduce((sum, row) => sum + row.sessions * (row.sessionKeyEventRate ?? 0), 0),
    selected.reduce((sum, row) => sum + row.sessions, 0)
  );
}
function search(blocks: Blocks, evidence: WorkbookEvidence, selection: Selection): void {
  for (const [binding, nonbrand] of [
    ['search.totals', false],
    ['search.nonbrand', true],
  ] as const)
    blocks.set(
      binding,
      orderedPeriods.map((id) => [
        label(evidence, id),
        ...['clicks', 'impressions', 'ctr', 'averagePosition'].map((metric) =>
          total(evidence.bundle, 'gsc', id, metric, nonbrand)
        ),
      ])
    );
  blocks.set(
    'search.daily',
    gscView(evidence, 'current', 'daily')
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => [
        (Date.parse(row.key + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86_400_000,
        row.clicks,
      ])
  );
  const current = publicPages(evidence, 'current');
  const previous = new Map(publicPages(evidence, 'previous').map((r) => [r.key, r]));
  const yearAgo = new Map(publicPages(evidence, 'year_ago').map((r) => [r.key, r]));
  blocks.set(
    SEARCH_PAGES,
    select(current, (r) => r.key, 15, item(selection, SEARCH_PAGES)).map((r) => [
      r.key,
      r.clicks,
      r.impressions,
      r.ctr,
      r.position,
      delta(
        r.clicks,
        period(evidence, 'previous') ? (previous.get(r.key)?.clicks ?? 0) : null,
        'absolute'
      ),
      delta(
        r.clicks,
        period(evidence, 'year_ago') ? (yearAgo.get(r.key)?.clicks ?? 0) : null,
        'absolute'
      ),
    ])
  );
  // Approved, bounded source configuration; this is not page- or query-supplied executable syntax.
  // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern comes from the approved source contract, not a ranking query.
  const brand = new RegExp(
    z.string().parse(evidence.bundle.sources.gsc.metadata['brandRegex']),
    'iu'
  );
  blocks.set(
    SEARCH_QUERIES,
    select(
      gscView(evidence, 'current', 'queries').sort(
        (a, b) => b.clicks - a.clicks || b.impressions - a.impressions || a.key.localeCompare(b.key)
      ),
      (r) => r.key,
      20,
      item(selection, SEARCH_QUERIES)
    ).map((r) => [
      r.key,
      brand.test(r.key) ? 'Branded' : 'Non-branded',
      r.clicks,
      r.impressions,
      r.ctr,
      r.position,
    ])
  );
}
function acquisition(blocks: Blocks, evidence: WorkbookEvidence, selection: Selection): void {
  blocks.set(
    'acquisition.totals',
    orderedPeriods.map((id) => [
      label(evidence, id),
      ...['sessions', 'activeUsers', 'engagementRate', 'keyEvents', 'sessionKeyEventRate'].map(
        (metric) => total(evidence.bundle, 'ga4', id, metric)
      ),
    ])
  );
  const events = [
    ...new Set(
      evidence.bundle.sources.ga4.eventRows
        .filter((r) => r.period === 'current')
        .map((r) => r.eventName)
    ),
  ].sort((a, b) => {
    const count = (event: string): number =>
      evidence.bundle.sources.ga4.eventRows.find(
        (row) => row.period === 'current' && row.eventName === event
      )?.keyEvents ?? 0;
    return count(b) - count(a) || a.localeCompare(b);
  });
  const eventCount = (event: string, id: (typeof orderedPeriods)[number]): number | null =>
    period(evidence, id)
      ? (evidence.bundle.sources.ga4.eventRows.find((r) => r.period === id && r.eventName === event)
          ?.keyEvents ?? null)
      : null;
  blocks.set(
    ACQUISITION_EVENTS,
    select(events, (r) => r, 4, item(selection, ACQUISITION_EVENTS)).map((event) => [
      event,
      eventCount(event, 'current'),
      eventCount(event, 'previous'),
      delta(eventCount(event, 'current'), eventCount(event, 'previous')),
      eventCount(event, 'year_ago'),
    ])
  );
  const channels = gaView(evidence, 'current', 'channels').sort(
    (a, b) => numeric(b, 'sessions') - numeric(a, 'sessions')
  );
  const sessions = channels.reduce((sum, r) => sum + numeric(r, 'sessions'), 0);
  blocks.set(
    ACQUISITION_CHANNELS,
    select(
      channels,
      (r) => required(r['sessionDefaultChannelGroup'], 'channel'),
      10,
      item(selection, ACQUISITION_CHANNELS)
    ).map((r) => [
      required(r['sessionDefaultChannelGroup'], 'channel'),
      numeric(r, 'sessions'),
      ratio(numeric(r, 'sessions'), sessions),
      numeric(r, 'engagementRate'),
      numeric(r, 'keyEvents'),
    ])
  );
  blocks.set(
    ACQUISITION_PAGES,
    select(
      landingPages(evidence, 'current'),
      (r) => r.path,
      20,
      item(selection, ACQUISITION_PAGES)
    ).map((r) => [
      r.path,
      r.sessions,
      r.activeUsers,
      r.engagementRate,
      r.keyEvents,
      r.sessionKeyEventRate,
    ])
  );
  blocks.set('acquisition.boundary', [
    [
      'All key events are diagnostic totals, not a substitute for audience-specific canonical outcomes. Event-name changes and unavailable historical measurement require agent review.',
    ],
  ]);
}
function content(blocks: Blocks, evidence: WorkbookEvidence, selection: Selection): void {
  const pages = publicPages(evidence, 'current');
  const landing = landingPages(evidence, 'current');
  const ga = new Map(landing.map((r) => [r.path, r]));
  const previous = new Map(publicPages(evidence, 'previous').map((r) => [r.key, r]));
  const yearAgo = new Map(publicPages(evidence, 'year_ago').map((r) => [r.key, r]));
  const classify = (path: string): string =>
    classifyPath(
      path,
      evidence.bundle.config.routeRegistry,
      evidence.bundle.config.unmatchedSegment
    );
  blocks.set(
    CONTENT_PAGES,
    select(pages, (r) => r.key, 40, item(selection, CONTENT_PAGES)).map((r) => {
      const g = ga.get(r.key);
      return [
        r.key,
        title(classify(r.key)),
        r.clicks,
        r.impressions,
        r.ctr,
        r.position,
        delta(
          r.clicks,
          period(evidence, 'previous') ? (previous.get(r.key)?.clicks ?? 0) : null,
          'absolute'
        ),
        delta(
          r.clicks,
          period(evidence, 'year_ago') ? (yearAgo.get(r.key)?.clicks ?? 0) : null,
          'absolute'
        ),
        g?.sessions ?? null,
        g?.engagementRate ?? null,
        g?.keyEvents ?? null,
        g?.sessionKeyEventRate ?? null,
      ];
    })
  );
  const ids = [
    ...evidence.bundle.config.routeRegistry.map((r) => r.id),
    evidence.bundle.config.unmatchedSegment,
  ];
  const lifecycle = buildLifecycle(
    evidence.bundle.report.periods,
    evidence.bundle.config.routeRegistry
  );
  blocks.set(
    'content.rollup',
    ids.map((id) => {
      if (lifecycle.find((r) => r.id === id)?.current.status === 'pre_launch')
        return [title(id), null, null, null, null, null, null, null, null];
      const gsc = pages.filter((r) => classify(r.key) === id);
      const rows = landing.filter((r) => classify(r.path) === id);
      const clicks = gsc.reduce((sum, r) => sum + r.clicks, 0);
      const impressions = gsc.reduce((sum, r) => sum + r.impressions, 0);
      const sessions = rows.reduce((sum, r) => sum + r.sessions, 0);
      return [
        title(id),
        new Set([...gsc.map((r) => r.key), ...rows.map((r) => r.path)]).size,
        clicks,
        impressions,
        ratio(clicks, impressions),
        sessions,
        ratio(
          rows.reduce((sum, r) => sum + r.engagedSessions, 0),
          sessions
        ),
        rows.reduce((sum, r) => sum + r.keyEvents, 0),
        ratio(
          rows.reduce((sum, r) => sum + r.sessions * (r.sessionKeyEventRate ?? 0), 0),
          sessions
        ),
      ];
    })
  );
}
function pillars(blocks: Blocks, evidence: WorkbookEvidence, analysis: WorkbookAnalysis): void {
  const tam = evidence.bundle.sources.tam;
  const ranks = evidence.bundle.sources.semrush?.rankings.filter(
    (r) => new URL(r.url).hostname === evidence.bundle.config.publicHostname
  );
  const best = (keyword: string): number | null => {
    const positions = ranks
      ?.filter((r) => normalizeKeyword(r.keyword) === normalizeKeyword(keyword))
      .map((r) => r.position);
    return positions?.length ? Math.min(...positions) : null;
  };
  const rows = Object.entries(analysis.contentPillars?.pillars ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  blocks.set(
    'pillars.metrics',
    rows.map(([name, row]) => {
      const positions =
        tam?.keywords
          .filter((r) => r.pillar === name)
          .map((r) => best(r.keyword))
          .filter((p): p is number => p !== null) ?? [];
      const current = item(row, 'currentExactGscImpressions') ?? null;
      const previous = item(row, 'previousExactGscImpressions') ?? null;
      return [
        name,
        ...[
          'keywordRows',
          'searchVolume',
          'confirmedSearchVolume',
          'conditionalSearchVolume',
          'rankingKeywords',
          'top10Keywords',
        ].map((key) => item(row, key) ?? null),
        ranks ? positions.filter((p) => p <= 20).length : null,
        item(row, 'confirmedTop10Coverage') ?? null,
        positions.length ? Math.min(...positions) : null,
        current,
        previous,
        delta(current, previous, 'absolute'),
      ];
    })
  );
  blocks.set(
    'pillars.opportunities',
    ranks
      ? rows.map(([name]) => {
          const opportunities =
            tam?.keywords
              .filter(
                (r) =>
                  r.pillar === name && r.serviceability === 'confirmed' && best(r.keyword) === null
              )
              .sort((a, b) => b.searchVolume - a.searchVolume || a.keyword.localeCompare(b.keyword))
              .slice(0, 3) ?? [];
          return [
            name,
            null,
            null,
            opportunities
              .map((r) => `${r.keyword} (${r.searchVolume.toLocaleString('en-US')})`)
              .join('; '),
            null,
            null,
            null,
            null,
            'Estimated monthly search demand; validate intent and serviceability before planning content.',
          ];
        })
      : []
  );
  blocks.set('pillars.boundary', [
    [
      `TAM ${tam?.metadata.sourceId ?? 'not selected'}; ${tam?.metadata.sourceRevision ?? ''}. Ranking extract: ${z.string().parse(evidence.bundle.sources.semrush?.metadata['keywordSnapshotDate'] ?? evidence.bundle.sources.semrush?.metadata.extractedAt ?? 'not selected')}. Historical keyword comparisons require separate comparable snapshots; domain totals do not reconstruct them. Exact-query GSC rows omit protected queries. Coverage is not competitive share of voice or a traffic forecast.`,
    ],
  ]);
}

export function buildWorkbookFacts(input: {
  readonly evidence: unknown;
  readonly sources: unknown;
  readonly template: unknown;
  readonly selection?: unknown;
}): {
  analysis: Readonly<Record<string, unknown>>;
  facts: {
    schemaVersion: 'organic-workbook-facts/v1';
    analysisSha256: string;
    blocks: Record<string, ReportRows>;
    evidence: { binding: string; source: string; sourceSha256: string }[];
  };
} {
  const evidence = workbookEvidenceSchema.parse(input.evidence);
  validateWorkbookEvidence(evidence);
  const sources = reportingSourcesSchema.parse(input.sources);
  const template = workbookTemplateSchema.parse(input.template);
  const selection = workbookSelectionSchema.parse(input.selection);
  const analysis = analyzeBundle(evidence.bundle);
  const typed = workbookAnalysisSchema.parse(analysis);
  const blocks: Blocks = new Map();
  blocks.set('report.title', [[evidence.bundle.report.title]]);
  blocks.set('scorecard.title', [[evidence.bundle.report.title + ' — KPI Scorecard']]);
  blocks.set('report.boundary', [[scope(evidence)]]);
  cards(blocks, typed);
  scorecard(blocks, evidence, typed);
  segments(blocks, evidence, typed);
  search(blocks, evidence, selection);
  acquisition(blocks, evidence, selection);
  content(blocks, evidence, selection);
  pillars(blocks, evidence, typed);
  const remaining = supplementalFacts(evidence, sources);
  for (const [key, rows] of remaining) blocks.set(key, rows);
  const expected = template.sheets.flatMap((s) => s.bindings.filter((b) => b.owner === 'facts'));
  if (
    expected.some((binding) => !blocks.has(binding.id)) ||
    [...blocks.keys()].some((key) => !expected.some((binding) => binding.id === key))
  )
    throw new Error('Template fact bindings and deterministic projector disagree');
  const references = evidenceReferences(evidence);
  return {
    analysis,
    facts: {
      schemaVersion: 'organic-workbook-facts/v1',
      analysisSha256: sha256Json(analysis),
      blocks: Object.fromEntries(blocks),
      evidence: expected.flatMap((binding) =>
        references.map((reference) => ({ binding: binding.id, ...reference }))
      ),
    },
  };
}
