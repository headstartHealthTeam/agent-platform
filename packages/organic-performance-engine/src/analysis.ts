import { createHash } from 'node:crypto';

import { compareCanonicalText } from './canonical-order.js';
import { buildHistoricalContext } from './historical-context.js';
import { buildLifecycle } from './lifecycle.js';
import {
  evidenceCoverage,
  validateOptionalSources,
  validateReportPeriods,
  validateRowPeriods,
} from './report-contract.js';
import {
  organicPerformanceBundleSchema,
  type OrganicPerformanceBundle,
  type PeriodId,
  type RouteRule,
} from './schemas.js';
import { exactPublicHostFilter } from './source-scope.js';

/* eslint-disable security/detect-object-injection -- Dynamic report dimensions are schema-validated, reserved prototype keys are rejected, and this module never executes their values. */

const REQUIRED_PERIODS: readonly PeriodId[] = ['current', 'previous', 'year_ago'];
const PERFORMANCE_LAYERS = [
  ['technical_health', []],
  ['visibility', ['gsc.impressions', 'gsc.nonbranded_impressions']],
  ['acquisition', ['gsc.clicks', 'ga4.organic_sessions']],
  ['engagement', ['ga4.engagement_rate']],
  ['business_outcomes', ['ga4.canonical_outcomes']],
  ['market_context', ['semrush.ranking_keywords']],
] as const;

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type NumericRecord = Record<string, number>;
type SegmentMetrics = Record<string, Record<string, Record<string, number>>>;

export class OrganicPerformanceAnalysisError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OrganicPerformanceAnalysisError';
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafeDynamicKey(value: string, context: string): void {
  if (['__proto__', 'constructor', 'prototype'].includes(value)) {
    throw new OrganicPerformanceAnalysisError(`${context} uses reserved key ${value}`);
  }
}

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new OrganicPerformanceAnalysisError('canonical JSON cannot contain non-finite numbers');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry) => entry[1] !== undefined)
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  throw new OrganicPerformanceAnalysisError(`unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalJsonPretty(value: unknown): string {
  return JSON.stringify(canonicalize(value), undefined, 2);
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function normalizeKeyword(value: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
  if (normalized.length === 0) {
    throw new OrganicPerformanceAnalysisError('keyword must be a non-empty string');
  }
  return normalized.split(/\s+/u).join(' ');
}

export function exactHostname(value: string, hostname: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname === hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function normalizePath(value: string, hostname?: string): string {
  const raw = value.trim();
  if (raw.length === 0) {
    throw new OrganicPerformanceAnalysisError('URL or landing page must be a non-empty string');
  }
  if (raw === '(not set)') {
    return raw;
  }
  let pathname: string;
  if (raw.startsWith('/')) {
    pathname = new URL(raw, 'https://path.invalid').pathname;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new OrganicPerformanceAnalysisError(`invalid absolute URL: ${raw}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new OrganicPerformanceAnalysisError(`invalid absolute URL: ${raw}`);
    }
    if (hostname !== undefined && parsed.hostname.toLowerCase() !== hostname.toLowerCase()) {
      throw new OrganicPerformanceAnalysisError(
        `URL hostname ${parsed.hostname} does not match ${hostname}`
      );
    }
    pathname = parsed.pathname;
  }
  let decoded = pathname || '/';
  try {
    decoded = decodeURIComponent(decoded);
  } catch (error: unknown) {
    // Source systems can retain literal percent signs or malformed UTF-8 escapes. Keep
    // the complete raw path (and its metrics), rather than partially decoding or dropping it.
    if (!(error instanceof URIError)) throw error;
  }
  const normalized = decoded.replace(/\/{2,}/gu, '/');
  return normalized === '/' ? normalized : normalized.replace(/\/+$/u, '');
}

type ComparisonMode = 'absolute' | 'count' | 'rate';

export function compare(
  current: number | null,
  baseline: number | null,
  mode: ComparisonMode
): Readonly<Record<string, number | string | null>> {
  if (current === null || baseline === null) {
    return { status: 'missing', absoluteChange: null, relativeChange: null };
  }
  const absolute = current - baseline;
  if (mode === 'rate') {
    return {
      status: 'comparable',
      percentagePointChange: absolute * 100,
      relativeChange: null,
    };
  }
  if (mode === 'absolute') {
    return { status: 'comparable', absoluteChange: absolute, relativeChange: null };
  }
  if (baseline === 0) {
    return {
      status: 'not_meaningful_zero_baseline',
      absoluteChange: absolute,
      relativeChange: null,
    };
  }
  return {
    status: 'comparable',
    absoluteChange: absolute,
    relativeChange: absolute / baseline,
  };
}

function validateRegistry(registry: readonly RouteRule[], name: string): void {
  const identifiers = new Set<string>();
  for (const rule of registry) {
    assertSafeDynamicKey(rule.id, name);
    if (identifiers.has(rule.id)) {
      throw new OrganicPerformanceAnalysisError(`duplicate ${name} id: ${rule.id}`);
    }
    identifiers.add(rule.id);
    for (const prefix of rule.prefixes) {
      if (!prefix.startsWith('/')) {
        throw new OrganicPerformanceAnalysisError(`${name} prefixes must be absolute paths`);
      }
    }
  }
}

function validateBundleScope(bundle: OrganicPerformanceBundle): void {
  const expectedFilter = exactPublicHostFilter(bundle.config.publicHostname).expression;
  const found = bundle.sources.gsc.metadata.filters.some(
    (filter) =>
      filter.dimension === 'page' &&
      filter.operator === 'includingRegex' &&
      filter.expression === expectedFilter
  );
  if (!found) {
    throw new OrganicPerformanceAnalysisError(
      `GSC snapshot must record the exact public-host filter ${expectedFilter}`
    );
  }
  validateRegistry(bundle.config.routeRegistry, 'routeRegistry');
  validateRegistry(bundle.config.audienceRegistry, 'audienceRegistry');
}

function periodMap<Row extends { readonly period: PeriodId }>(
  rows: readonly Row[],
  context: string,
  periods: readonly { readonly id: PeriodId }[]
): Readonly<Partial<Record<PeriodId, Row>>> {
  const mapped = new Map<PeriodId, Row>();
  for (const row of rows) {
    if (!periods.some((period) => period.id === row.period))
      throw new OrganicPerformanceAnalysisError(`${context} references an undeclared period`);
    if (mapped.has(row.period)) {
      throw new OrganicPerformanceAnalysisError(`duplicate ${context} period: ${row.period}`);
    }
    mapped.set(row.period, row);
  }
  for (const period of periods) {
    if (!mapped.has(period.id)) {
      throw new OrganicPerformanceAnalysisError(`${context} is missing period ${period.id}`);
    }
  }
  return Object.fromEntries(mapped);
}

export function classifyPath(
  path: string,
  registry: readonly RouteRule[],
  unmatched: string
): string {
  if (path === '(not set)') {
    return unmatched;
  }
  for (const rule of registry) {
    if (rule.exactPaths.includes(path)) {
      return rule.id;
    }
    for (const rawPrefix of rule.prefixes) {
      const prefix = rawPrefix.replace(/\/+$/u, '');
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        return rule.id;
      }
    }
  }
  return unmatched;
}

interface AggregateRow {
  readonly period: PeriodId;
  readonly [key: string]: number | string;
}

function incrementSegment(
  aggregate: SegmentMetrics,
  period: PeriodId,
  segment: string,
  metric: string,
  value: number
): void {
  assertSafeDynamicKey(period, 'period');
  assertSafeDynamicKey(segment, 'segment');
  assertSafeDynamicKey(metric, 'metric');
  const periods = aggregate[period] ?? {};
  aggregate[period] = periods;
  const segments = periods[segment] ?? {};
  periods[segment] = segments;
  segments[metric] = (segments[metric] ?? 0) + value;
}

function aggregateRows(input: {
  readonly rows: readonly AggregateRow[];
  readonly registry: readonly RouteRule[];
  readonly unmatched: string;
  readonly hostname?: string;
  readonly locationKey: string;
  readonly metrics: readonly string[];
}): { readonly segments: SegmentMetrics; readonly excludedHosts: number } {
  const segments: SegmentMetrics = {};
  let excludedHosts = 0;
  for (const row of input.rows) {
    const location = row[input.locationKey];
    if (typeof location !== 'string') {
      throw new OrganicPerformanceAnalysisError(`${input.locationKey} must be a string`);
    }
    if (
      input.hostname !== undefined &&
      !location.startsWith('/') &&
      !exactHostname(location, input.hostname)
    ) {
      excludedHosts += 1;
      continue;
    }
    const path = normalizePath(location, location.startsWith('/') ? undefined : input.hostname);
    const segment = classifyPath(path, input.registry, input.unmatched);
    for (const metric of input.metrics) {
      const value = row[metric];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new OrganicPerformanceAnalysisError(`${metric} must be a finite number`);
      }
      incrementSegment(segments, row.period, segment, metric, value);
    }
  }
  return { segments: sortNestedSegments(segments), excludedHosts };
}

function sortNestedSegments(input: SegmentMetrics): SegmentMetrics {
  const output: SegmentMetrics = {};
  for (const period of Object.keys(input).sort()) {
    const periodInput = input[period] ?? {};
    const periodOutput: Record<string, NumericRecord> = {};
    for (const segment of Object.keys(periodInput).sort()) {
      const metrics = periodInput[segment] ?? {};
      periodOutput[segment] = Object.fromEntries(
        Object.entries(metrics).sort(([left], [right]) => compareCanonicalText(left, right))
      );
    }
    output[period] = periodOutput;
  }
  return output;
}

function metricValue(row: object | undefined, metric: string, context: string): number | null {
  if (row === undefined) return null;
  const value: unknown = Object.entries(row).find(([key]) => key === metric)?.[1];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new OrganicPerformanceAnalysisError(`${context}.${metric} must be a finite number`);
  }
  return value;
}

function kpi(
  rows: Readonly<Partial<Record<PeriodId, object>>>,
  metric: string,
  mode: ComparisonMode
): Readonly<Record<string, unknown>> {
  const current = metricValue(rows.current, metric, 'periodTotals.current');
  const previous = metricValue(rows.previous, metric, 'periodTotals.previous');
  const yearAgo = metricValue(rows.year_ago, metric, 'periodTotals.year_ago');
  return {
    current,
    previous,
    yearAgo,
    mom: compare(current, previous, mode),
    yoy: compare(current, yearAgo, mode),
  };
}

function reconcile(
  totals: Readonly<Partial<Record<PeriodId, object>>>,
  segments: SegmentMetrics,
  metric: string
): Readonly<Record<PeriodId, Readonly<Record<string, number>> | null>> {
  const result: Record<PeriodId, Readonly<Record<string, number>> | null> = {
    current: null,
    previous: null,
    year_ago: null,
  };
  for (const period of REQUIRED_PERIODS) {
    const sourceTotal = metricValue(totals[period], metric, `periodTotals.${period}`);
    if (sourceTotal === null) continue;
    let classifiedTotal = 0;
    for (const segment of Object.values(segments[period] ?? {})) {
      classifiedTotal += segment[metric] ?? 0;
    }
    result[period] = { sourceTotal, classifiedTotal, delta: sourceTotal - classifiedTotal };
  }
  return result;
}

interface BestRanking {
  readonly keyword: string;
  readonly position: number;
  readonly searchVolume: number;
  readonly url: string;
}

function bestSemrushRankings(bundle: OrganicPerformanceBundle): {
  readonly rankings: Readonly<Record<string, BestRanking>>;
  readonly excluded: number;
} {
  const best = new Map<string, BestRanking>();
  let excluded = 0;
  for (const row of bundle.sources.semrush?.rankings ?? []) {
    if (!exactHostname(row.url, bundle.config.publicHostname)) {
      excluded += 1;
      continue;
    }
    const normalized = normalizeKeyword(row.keyword);
    const candidate: BestRanking = row;
    const prior = best.get(normalized);
    if (
      prior === undefined ||
      candidate.position < prior.position ||
      (candidate.position === prior.position && candidate.url < prior.url)
    ) {
      best.set(normalized, candidate);
    }
  }
  return {
    rankings: Object.fromEntries(
      [...best.entries()].sort(([left], [right]) => compareCanonicalText(left, right))
    ),
    excluded,
  };
}

type QueryMetricsByPeriod = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>
>;

function gscQueryMap(bundle: OrganicPerformanceBundle): QueryMetricsByPeriod {
  const totals: Record<string, Record<string, NumericRecord>> = {};
  for (const row of bundle.sources.gsc.queryRows) {
    const period = totals[row.period] ?? {};
    totals[row.period] = period;
    const keyword = normalizeKeyword(row.query);
    assertSafeDynamicKey(keyword, 'normalized GSC query');
    const metrics = period[keyword] ?? {};
    period[keyword] = metrics;
    metrics['clicks'] = (metrics['clicks'] ?? 0) + row.clicks;
    metrics['impressions'] = (metrics['impressions'] ?? 0) + row.impressions;
  }
  const output: Record<string, Record<string, NumericRecord>> = {};
  for (const period of Object.keys(totals).sort()) {
    const keywordRows = totals[period] ?? {};
    output[period] = Object.fromEntries(
      Object.entries(keywordRows).sort(([left], [right]) => compareCanonicalText(left, right))
    );
  }
  return output;
}

interface PillarAccumulator {
  keywordRows: number;
  searchVolume: number;
  confirmedSearchVolume: number;
  conditionalSearchVolume: number;
  rankingKeywords: number;
  top10Keywords: number;
  confirmedTop10Volume: number;
  currentExactGscImpressions: number;
  previousExactGscImpressions: number;
}

function emptyPillar(): PillarAccumulator {
  return {
    keywordRows: 0,
    searchVolume: 0,
    confirmedSearchVolume: 0,
    conditionalSearchVolume: 0,
    rankingKeywords: 0,
    top10Keywords: 0,
    confirmedTop10Volume: 0,
    currentExactGscImpressions: 0,
    previousExactGscImpressions: 0,
  };
}

function recordPillarKeyword(
  summary: PillarAccumulator,
  row: NonNullable<OrganicPerformanceBundle['sources']['tam']>['keywords'][number],
  ranking: BestRanking | undefined,
  queries: QueryMetricsByPeriod,
  normalized: string
): void {
  summary.keywordRows += 1;
  summary.searchVolume += row.searchVolume;
  if (row.serviceability === 'confirmed') {
    summary.confirmedSearchVolume += row.searchVolume;
  } else {
    summary.conditionalSearchVolume += row.searchVolume;
  }
  if (ranking !== undefined) {
    summary.rankingKeywords += 1;
    if (ranking.position <= 10) {
      summary.top10Keywords += 1;
      if (row.serviceability === 'confirmed') {
        summary.confirmedTop10Volume += row.searchVolume;
      }
    }
  }
  summary.currentExactGscImpressions += queries['current']?.[normalized]?.['impressions'] ?? 0;
  summary.previousExactGscImpressions += queries['previous']?.[normalized]?.['impressions'] ?? 0;
}

function rankingCoverage(
  available: boolean,
  numerator: number,
  denominator: number
): number | null {
  return !available || denominator === 0 ? null : numerator / denominator;
}

function pillarOutput(
  summary: PillarAccumulator,
  hasRankings: boolean,
  hasPrevious: boolean
): Readonly<Record<string, number | null>> {
  return {
    keywordRows: summary.keywordRows,
    searchVolume: summary.searchVolume,
    confirmedSearchVolume: summary.confirmedSearchVolume,
    conditionalSearchVolume: summary.conditionalSearchVolume,
    rankingKeywords: hasRankings ? summary.rankingKeywords : null,
    top10Keywords: hasRankings ? summary.top10Keywords : null,
    confirmedTop10Coverage: rankingCoverage(
      hasRankings,
      summary.confirmedTop10Volume,
      summary.confirmedSearchVolume
    ),
    currentExactGscImpressions: summary.currentExactGscImpressions,
    previousExactGscImpressions: hasPrevious ? summary.previousExactGscImpressions : null,
  };
}

function contentPillars(
  bundle: OrganicPerformanceBundle,
  rankings: Readonly<Record<string, BestRanking>>,
  queries: QueryMetricsByPeriod
): Readonly<Record<string, unknown>> {
  const pillars = new Map<string, PillarAccumulator>();
  const seen = new Map<string, string>();
  let matches = 0;
  const tam = bundle.sources.tam;
  if (!tam) throw new OrganicPerformanceAnalysisError('Content pillars require TAM evidence');
  const hasRankings = bundle.sources.semrush !== undefined;
  for (const row of tam.keywords) {
    const normalized = normalizeKeyword(row.keyword);
    assertSafeDynamicKey(normalized, 'normalized TAM keyword');
    assertSafeDynamicKey(row.pillar, 'content pillar');
    const priorPillar = seen.get(normalized);
    if (priorPillar !== undefined) {
      throw new OrganicPerformanceAnalysisError(
        `duplicate normalized TAM keyword ${normalized} in ${priorPillar} and ${row.pillar}`
      );
    }
    seen.set(normalized, row.pillar);
    const summary = pillars.get(row.pillar) ?? emptyPillar();
    pillars.set(row.pillar, summary);
    const ranking = rankings[normalized];
    if (ranking !== undefined) {
      matches += 1;
    }
    recordPillarKeyword(summary, row, ranking, queries, normalized);
  }

  const output: Record<string, Readonly<Record<string, number | null>>> = {};
  let totalVolume = 0;
  let confirmedVolume = 0;
  let confirmedTop10Volume = 0;
  for (const [pillar, summary] of [...pillars.entries()].sort(([left], [right]) =>
    compareCanonicalText(left, right)
  )) {
    output[pillar] = pillarOutput(
      summary,
      hasRankings,
      bundle.report.periods.some((period) => period.id === 'previous')
    );
    totalVolume += summary.searchVolume;
    confirmedVolume += summary.confirmedSearchVolume;
    confirmedTop10Volume += summary.confirmedTop10Volume;
  }
  return {
    summary: {
      keywordRows: tam.keywords.length,
      searchVolume: totalVolume,
      confirmedSearchVolume: confirmedVolume,
      semrushExactMatches: hasRankings ? matches : null,
      confirmedTop10Coverage: rankingCoverage(hasRankings, confirmedTop10Volume, confirmedVolume),
    },
    pillars: output,
  };
}

function scopedOutcomeValues(bundle: OrganicPerformanceBundle): ReadonlyMap<string, number | null> {
  const values = new Map<string, number | null>();
  for (const row of bundle.sources.ga4.outcomeRows ?? []) {
    const definition = bundle.config.outcomeRegistry.find(
      (outcome) => outcome.audience === row.audience
    );
    const scope = definition?.measurement;
    if (
      !scope ||
      definition.eventName !== row.eventName ||
      scope.hostname !== row.hostname ||
      scope.metric !== row.metric
    )
      throw new OrganicPerformanceAnalysisError(
        'Scoped outcome evidence does not match its measurement contract'
      );
    const key = `${row.audience}\u0000${row.period}`;
    if (values.has(key))
      throw new OrganicPerformanceAnalysisError('Duplicate scoped outcome evidence');
    values.set(key, row.value);
  }
  for (const outcome of bundle.config.outcomeRegistry) {
    if (!outcome.measurement || outcome.eventName === null) continue;
    for (const period of bundle.report.periods) {
      if (!values.has(`${outcome.audience}\u0000${period.id}`))
        throw new OrganicPerformanceAnalysisError(
          'Scoped outcome evidence is missing a declared period'
        );
    }
  }
  return values;
}

function measuredOutcome(
  row: OrganicPerformanceBundle['config']['outcomeRegistry'][number],
  value: (period: PeriodId) => number | null,
  periods: OrganicPerformanceBundle['report']['periods']
): Readonly<Record<string, unknown>> {
  const lifecycle = row.measurementLifecycle
    ? buildLifecycle(periods, [
        {
          id: row.audience,
          exactPaths: [],
          prefixes: [],
          lifecycle: row.measurementLifecycle,
        },
      ])[0]
    : undefined;
  const current = lifecycle?.current.status === 'pre_launch' ? null : value('current');
  const previous = lifecycle?.previous.status === 'pre_launch' ? null : value('previous');
  const yearAgo = lifecycle?.year_ago.status === 'pre_launch' ? null : value('year_ago');
  return {
    status:
      lifecycle && !lifecycle.current.eligible
        ? lifecycle.current.status
        : current === null
          ? 'source_event_missing'
          : 'measured',
    ...(row.measurement ? { measurement: row.measurement } : {}),
    ...(lifecycle
      ? {
          lifecycle,
          observed: {
            current: value('current'),
            previous: value('previous'),
            yearAgo: value('year_ago'),
          },
        }
      : {}),
    eventName: row.eventName,
    current,
    previous,
    yearAgo,
    mom: compare(current, lifecycle?.momEligible === false ? null : previous, 'count'),
    yoy: compare(current, lifecycle?.yoyEligible === false ? null : yearAgo, 'count'),
  };
}

function canonicalOutcomes(bundle: OrganicPerformanceBundle): Readonly<Record<string, unknown>> {
  const scoped = scopedOutcomeValues(bundle);
  const totals = new Map<string, Map<string, number>>();
  const presence = new Set<string>();
  for (const row of bundle.sources.ga4.eventRows) {
    const period = totals.get(row.period) ?? new Map<string, number>();
    totals.set(row.period, period);
    period.set(row.eventName, (period.get(row.eventName) ?? 0) + row.keyEvents);
    presence.add(`${row.period}\u0000${row.eventName}`);
  }

  const outcomes: Record<string, unknown> = {};
  for (const row of bundle.config.outcomeRegistry) {
    assertSafeDynamicKey(row.audience, 'outcome audience');
    if (Object.hasOwn(outcomes, row.audience)) {
      throw new OrganicPerformanceAnalysisError(
        `duplicate canonical outcome audience: ${row.audience}`
      );
    }
    if (row.eventName === null) {
      outcomes[row.audience] = {
        status: 'measurement_pending',
        eventName: null,
        current: null,
        previous: null,
        yearAgo: null,
        mom: compare(null, null, 'count'),
        yoy: compare(null, null, 'count'),
      };
      continue;
    }
    const eventName = row.eventName;
    const value = (period: PeriodId): number | null =>
      row.measurement
        ? (scoped.get(`${row.audience}\u0000${period}`) ?? null)
        : presence.has(`${period}\u0000${eventName}`)
          ? (totals.get(period)?.get(eventName) ?? 0)
          : null;
    outcomes[row.audience] = measuredOutcome(row, value, bundle.report.periods);
  }
  return Object.fromEntries(
    Object.entries(outcomes).sort(([left], [right]) => compareCanonicalText(left, right))
  );
}

function sourceManifest(bundle: OrganicPerformanceBundle): Readonly<Record<string, unknown>> {
  return {
    gsc: bundle.sources.gsc.metadata,
    ga4: bundle.sources.ga4.metadata,
    semrush: bundle.sources.semrush?.metadata ?? {
      status: 'omitted',
      reason: bundle.report.omittedSources?.semrush,
    },
    tam: bundle.sources.tam?.metadata ?? {
      status: 'omitted',
      reason: bundle.report.omittedSources?.tam,
    },
  };
}

function buildKpis(
  gscTotals: Readonly<Partial<Record<PeriodId, object>>>,
  ga4Totals: Readonly<Partial<Record<PeriodId, object>>>,
  semrushTotals: Readonly<Partial<Record<PeriodId, object>>>,
  nonbrandedTotals: Readonly<Partial<Record<PeriodId, object>>>
): Readonly<Record<string, unknown>> {
  return {
    'gsc.clicks': kpi(gscTotals, 'clicks', 'count'),
    'gsc.impressions': kpi(gscTotals, 'impressions', 'count'),
    'gsc.ctr': kpi(gscTotals, 'ctr', 'rate'),
    'gsc.average_position': kpi(gscTotals, 'averagePosition', 'absolute'),
    'gsc.nonbranded_clicks': kpi(nonbrandedTotals, 'clicks', 'count'),
    'gsc.nonbranded_impressions': kpi(nonbrandedTotals, 'impressions', 'count'),
    'ga4.organic_sessions': kpi(ga4Totals, 'sessions', 'count'),
    'ga4.engagement_rate': kpi(ga4Totals, 'engagementRate', 'rate'),
    'ga4.key_events': kpi(ga4Totals, 'keyEvents', 'count'),
    'semrush.ranking_keywords': kpi(semrushTotals, 'rankingKeywords', 'count'),
  };
}

export function analyzeBundle(input: unknown): Readonly<Record<string, unknown>> {
  const bundle = organicPerformanceBundleSchema.parse(input);
  validateReportPeriods(bundle.report);
  validateOptionalSources(bundle.report, bundle.sources);
  validateRowPeriods(bundle);
  validateBundleScope(bundle);
  const coverage = evidenceCoverage(bundle);

  const periods = bundle.report.periods;
  const gscTotals = periodMap(bundle.sources.gsc.periodTotals, 'sources.gsc.periodTotals', periods);
  const ga4Totals = periodMap(bundle.sources.ga4.periodTotals, 'sources.ga4.periodTotals', periods);
  const semrushTotals = bundle.sources.semrush
    ? periodMap(bundle.sources.semrush.domainSnapshots, 'sources.semrush.domainSnapshots', periods)
    : {};
  const nonbrandedTotals = periodMap(
    bundle.sources.gsc.nonBrandedTotals,
    'sources.gsc.nonBrandedTotals',
    periods
  );
  const gsc = aggregateRows({
    rows: bundle.sources.gsc.pageRows,
    registry: bundle.config.routeRegistry,
    unmatched: bundle.config.unmatchedSegment,
    hostname: bundle.config.publicHostname,
    locationKey: 'url',
    metrics: ['clicks', 'impressions'],
  });
  const ga4 = aggregateRows({
    rows: bundle.sources.ga4.landingPageRows,
    registry: bundle.config.routeRegistry,
    unmatched: bundle.config.unmatchedSegment,
    locationKey: 'landingPage',
    metrics: ['sessions', 'engagedSessions', 'keyEvents'],
  });
  const semrush = bestSemrushRankings(bundle);
  const queries = gscQueryMap(bundle);
  const audienceGsc = aggregateRows({
    rows: bundle.sources.gsc.pageRows,
    registry: bundle.config.audienceRegistry,
    unmatched: bundle.config.unmatchedAudience,
    hostname: bundle.config.publicHostname,
    locationKey: 'url',
    metrics: ['clicks', 'impressions'],
  });
  const audienceGa4 = aggregateRows({
    rows: bundle.sources.ga4.landingPageRows,
    registry: bundle.config.audienceRegistry,
    unmatched: bundle.config.unmatchedAudience,
    locationKey: 'landingPage',
    metrics: ['sessions', 'engagedSessions', 'keyEvents'],
  });

  return {
    schemaVersion: 'organic-performance-analysis/v1',
    inputSha256: sha256Json(bundle),
    report: bundle.report,
    evidenceCoverage: coverage,
    registries: {
      configVersion: bundle.config.configVersion,
      routeIds: bundle.config.routeRegistry.map((item) => item.id),
      audienceIds: bundle.config.audienceRegistry.map((item) => item.id),
      unmatchedSegment: bundle.config.unmatchedSegment,
      unmatchedAudience: bundle.config.unmatchedAudience,
    },
    sourceManifest: sourceManifest(bundle),
    lifecycle: {
      segments: buildLifecycle(periods, bundle.config.routeRegistry),
      audiences: buildLifecycle(periods, bundle.config.audienceRegistry),
    },
    audiences: {
      gsc: audienceGsc.segments,
      ga4: audienceGa4.segments,
      gscReconciliation: reconcile(gscTotals, audienceGsc.segments, 'clicks'),
      ga4Reconciliation: reconcile(ga4Totals, audienceGa4.segments, 'sessions'),
    },
    kpis: buildKpis(gscTotals, ga4Totals, semrushTotals, nonbrandedTotals),
    segments: {
      gsc: gsc.segments,
      ga4: ga4.segments,
      gscExcludedHostRows: gsc.excludedHosts,
      gscReconciliation: reconcile(gscTotals, gsc.segments, 'clicks'),
      ga4Reconciliation: reconcile(ga4Totals, ga4.segments, 'sessions'),
    },
    semrush: bundle.sources.semrush
      ? {
          bestPublicHostRankings: semrush.rankings,
          excludedHostRows: semrush.excluded,
        }
      : null,
    contentPillars: bundle.sources.tam ? contentPillars(bundle, semrush.rankings, queries) : null,
    canonicalOutcomes: canonicalOutcomes(bundle),
    performanceLayers: PERFORMANCE_LAYERS.map(([id, metricReferences]) => ({
      id,
      metricRefs: [...metricReferences],
      interpretationOwner: id === 'technical_health' ? 'agent' : 'agent_from_evidence',
    })),
    interpretationContract: {
      deterministicOutputEndsHere: true,
      agentMustClassifyClaimsAs: ['observed', 'inferred', 'recommended'],
      causalClaimsRequireIndependentEvidence: true,
      historicalContext: buildHistoricalContext(
        bundle.report.periods.find((period) => period.id === 'current')?.endDate
      ),
    },
  };
}
