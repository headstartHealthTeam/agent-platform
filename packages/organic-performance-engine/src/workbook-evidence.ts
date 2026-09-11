import { normalizeGa4Report } from '@headstart-health/google-analytics-data';
import { z } from 'zod';

import { canonicalJson, normalizeKeyword, normalizePath, sha256Json } from './analysis.js';
import { compareCanonicalText } from './canonical-order.js';
import {
  organicPerformanceBundleSchema,
  periodIdSchema,
  type OrganicPerformanceBundle,
  type PeriodId,
} from './schemas.js';

export const workbookEvidenceSchema = z
  .object({
    schemaVersion: z.literal('organic-workbook-evidence/v1'),
    bundle: organicPerformanceBundleSchema,
    views: z.array(
      z
        .object({
          name: z.string().regex(/^[a-z0-9_-]+$/),
          extractedAt: z.iso.datetime({ offset: true }),
          data: z.unknown(),
        })
        .strict()
    ),
  })
  .strict();
export type WorkbookEvidence = z.infer<typeof workbookEvidenceSchema>;
export type EvidenceView = WorkbookEvidence['views'][number];
export interface SearchRow {
  readonly key: string;
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number | null;
  readonly position: number | null;
}
export interface LandingRow {
  readonly path: string;
  readonly sessions: number;
  readonly engagedSessions: number;
  readonly keyEvents: number;
  readonly engagementRate: number | null;
  readonly sessionKeyEventRate: number | null;
  readonly activeUsers: number | null;
}
const searchSchema = z.object({
  request: z.object({
    startDate: z.string(),
    endDate: z.string(),
    dimensions: z.array(z.string()),
    dimensionFilterGroups: z.array(
      z.object({
        filters: z.array(
          z.object({ dimension: z.string(), operator: z.string(), expression: z.string() })
        ),
      })
    ),
  }),
  pagination: z.object({ truncatedAtMaxRows: z.literal(false) }),
  rowCount: z.number().int().nonnegative(),
  rows: z.array(
    z.object({
      keys: z.array(z.string()).optional(),
      clicks: z.number(),
      impressions: z.number(),
      ctr: z.number(),
      position: z.number(),
    })
  ),
});
const gaSchema = z.object({
  request: z.object({
    property: z.string(),
    dateRanges: z.array(z.object({ startDate: z.string(), endDate: z.string() })),
    dimensionFilter: z.unknown(),
  }),
  response: z.unknown(),
});

export function view(evidence: WorkbookEvidence, name: string): EvidenceView {
  const rows = evidence.views.filter((row) => row.name === name);
  if (rows.length !== 1 || !rows[0])
    throw new Error('Exactly one retained view is required: ' + name);
  return rows[0];
}
export function period(
  evidence: WorkbookEvidence,
  id: PeriodId
): OrganicPerformanceBundle['report']['periods'][number] | undefined {
  return evidence.bundle.report.periods.find((row) => row.id === id);
}
export function numeric(row: Readonly<Record<string, string>>, key: string): number {
  const raw = Object.entries(row).find(([name]) => name === key)?.[1];
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(Number(raw)))
    throw new Error('Missing numeric source field: ' + key);
  return Number(raw);
}
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
export function gscView(evidence: WorkbookEvidence, id: PeriodId, name: string): SearchRow[] {
  const window = period(evidence, id);
  if (!window) return [];
  const data = searchSchema.parse(view(evidence, `gsc-${id}-${name}`).data);
  const expected = evidence.bundle.sources.gsc.metadata.filters;
  const expectedDimensions = name.endsWith('totals')
    ? []
    : name === 'daily'
      ? ['date']
      : name === 'pages'
        ? ['page']
        : ['query'];
  const expectedFilters = name.startsWith('nonbranded-')
    ? [
        ...expected,
        {
          dimension: 'query',
          operator: 'excludingRegex',
          expression: z.string().parse(evidence.bundle.sources.gsc.metadata['brandRegex']),
        },
      ]
    : expected;
  if (
    data.request.startDate !== window.startDate ||
    data.request.endDate !== window.endDate ||
    data.rowCount !== data.rows.length ||
    canonicalJson(data.request.dimensions) !== canonicalJson(expectedDimensions) ||
    data.request.dimensionFilterGroups.length !== 1 ||
    canonicalJson(data.request.dimensionFilterGroups[0]?.filters) !== canonicalJson(expectedFilters)
  )
    throw new Error('GSC view scope/completeness does not match the bundle');
  return data.rows.map((row) => ({
    key: row.keys?.[0] ?? '',
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: ratio(row.clicks, row.impressions),
    position: row.impressions === 0 ? null : row.position,
  }));
}
export function gaView(
  evidence: WorkbookEvidence,
  id: PeriodId,
  name: string
): Readonly<Record<string, string>>[] {
  const window = period(evidence, id);
  if (!window) return [];
  const data = gaSchema.parse(view(evidence, `ga4-${id}-${name}`).data);
  const dates = data.request.dateRanges;
  const filters = z
    .object({
      andGroup: z.object({
        expressions: z.array(
          z.object({
            filter: z.object({
              fieldName: z.string(),
              stringFilter: z.object({ matchType: z.literal('EXACT'), value: z.string() }),
            }),
          })
        ),
      }),
    })
    .parse(data.request.dimensionFilter);
  const exact = (field: string, value: string): boolean =>
    filters.andGroup.expressions.some(
      (row) => row.filter.fieldName === field && row.filter.stringFilter.value === value
    );
  if (
    data.request.property !== evidence.bundle.sources.ga4.metadata.sourceId ||
    dates.length !== 1 ||
    dates[0]?.startDate !== window.startDate ||
    dates[0].endDate !== window.endDate ||
    !exact('hostName', evidence.bundle.config.publicHostname) ||
    (name !== 'channels' && !exact('sessionDefaultChannelGroup', 'Organic Search'))
  )
    throw new Error('GA4 view scope does not match the bundle');
  const normalized = normalizeGa4Report(data.response);
  const count = z
    .object({ rowCount: z.number().int().nonnegative() })
    .parse(data.response).rowCount;
  if (
    count !== normalized.length ||
    filters.andGroup.expressions.length !== (name === 'channels' ? 1 : 2)
  )
    throw new Error('GA4 view is incomplete or has unexpected filters');
  return normalized.map((row) => ({
    ...row.dimensions,
    ...row.metrics,
  }));
}
export function publicPages(evidence: WorkbookEvidence, id: PeriodId): SearchRow[] {
  const rows = new Map<string, SearchRow>();
  for (const row of gscView(evidence, id, 'pages')) {
    const key = normalizePath(row.key, evidence.bundle.config.publicHostname);
    const old = rows.get(key);
    const clicks = row.clicks + (old?.clicks ?? 0);
    const impressions = row.impressions + (old?.impressions ?? 0);
    rows.set(key, {
      key,
      clicks,
      impressions,
      ctr: ratio(clicks, impressions),
      position: ratio(
        (row.position ?? 0) * row.impressions + (old?.position ?? 0) * (old?.impressions ?? 0),
        impressions
      ),
    });
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.clicks - a.clicks || b.impressions - a.impressions || compareCanonicalText(a.key, b.key)
  );
}
export function landingPages(evidence: WorkbookEvidence, id: PeriodId): LandingRow[] {
  const rows = new Map<string, LandingRow>();
  for (const row of gaView(evidence, id, 'landing-pages')) {
    const path = normalizePath(z.string().parse(row['landingPage']));
    const old = rows.get(path);
    const count = numeric(row, 'sessions');
    const sessions = count + (old?.sessions ?? 0);
    const engagedSessions = numeric(row, 'engagedSessions') + (old?.engagedSessions ?? 0);
    rows.set(path, {
      path,
      sessions,
      engagedSessions,
      keyEvents: numeric(row, 'keyEvents') + (old?.keyEvents ?? 0),
      engagementRate: ratio(engagedSessions, sessions),
      sessionKeyEventRate: ratio(
        numeric(row, 'sessionKeyEventRate') * count +
          (old?.sessionKeyEventRate ?? 0) * (old?.sessions ?? 0),
        sessions
      ),
      activeUsers: old
        ? null
        : row['activeUsers'] === undefined
          ? null
          : numeric(row, 'activeUsers'),
    });
  }
  return [...rows.values()].sort(
    (a, b) => b.sessions - a.sessions || compareCanonicalText(a.path, b.path)
  );
}
export function evidenceReferences(
  evidence: WorkbookEvidence
): { source: string; sourceSha256: string }[] {
  return [
    { source: 'report-bundle', sourceSha256: sha256Json(evidence.bundle) },
    ...evidence.views.map((row) => ({ source: row.name, sourceSha256: sha256Json(row.data) })),
  ];
}
/** Prevent headline/segment calculations and detailed workbook tables from using different reads. */
export function validateWorkbookEvidence(evidence: WorkbookEvidence): void {
  if (new Set(evidence.views.map((row) => row.name)).size !== evidence.views.length)
    throw new Error('Duplicate retained evidence view');
  for (const window of evidence.bundle.report.periods) {
    const pages = publicPages(evidence, window.id);
    const sourcePages = new Map<string, { clicks: number; impressions: number }>();
    for (const row of evidence.bundle.sources.gsc.pageRows.filter((r) => r.period === window.id)) {
      const key = normalizePath(row.url, evidence.bundle.config.publicHostname);
      const old = sourcePages.get(key);
      sourcePages.set(key, {
        clicks: row.clicks + (old?.clicks ?? 0),
        impressions: row.impressions + (old?.impressions ?? 0),
      });
    }
    if (
      pages.length !== sourcePages.size ||
      pages.some(
        (row) =>
          row.clicks !== sourcePages.get(row.key)?.clicks ||
          row.impressions !== sourcePages.get(row.key)?.impressions
      )
    )
      throw new Error('Retained GSC pages differ from analysis bundle');
    reconcileRows(
      gscView(evidence, window.id, 'queries').map((row) => ({
        key: normalizeKeyword(row.key),
        values: [row.clicks, row.impressions],
      })),
      evidence.bundle.sources.gsc.queryRows
        .filter((row) => row.period === window.id)
        .map((row) => ({
          key: normalizeKeyword(row.query),
          values: [row.clicks, row.impressions],
        })),
      'GSC query'
    );
    reconcileRows(
      landingPages(evidence, window.id).map((row) => ({
        key: row.path,
        values: [row.sessions, row.engagedSessions, row.keyEvents],
      })),
      evidence.bundle.sources.ga4.landingPageRows
        .filter((row) => row.period === window.id)
        .map((row) => ({
          key: normalizePath(row.landingPage),
          values: [row.sessions, row.engagedSessions, row.keyEvents],
        })),
      'GA4 landing'
    );
  }
}
interface KeyedMetrics {
  readonly key: string;
  readonly values: readonly number[];
}
function reconcileRows(
  retained: readonly KeyedMetrics[],
  bundled: readonly KeyedMetrics[],
  label: string
): void {
  const aggregate = (rows: readonly KeyedMetrics[]): string => {
    const grouped = new Map<string, readonly number[]>();
    for (const row of rows) {
      const previous = grouped.get(row.key);
      grouped.set(
        row.key,
        row.values.map((value, index) => value + (previous?.at(index) ?? 0))
      );
    }
    return canonicalJson([...grouped].sort(([a], [b]) => compareCanonicalText(a, b)));
  };
  if (aggregate(retained) !== aggregate(bundled))
    throw new Error(`Retained ${label} rows differ from analysis bundle`);
}
export const orderedPeriods: readonly PeriodId[] = periodIdSchema.options;
