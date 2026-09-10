import { z } from 'zod';

import { compare } from './analysis.js';
import { buildLifecycle, type CohortLifecycle } from './lifecycle.js';
import type { OrganicPerformanceBundle, PeriodId, RouteRule } from './schemas.js';
import type { ReportRows, ReportValue } from './workbook-contract.js';
import { ratio, type WorkbookEvidence } from './workbook-evidence.js';

const comparisons = z.object({
  status: z.string(),
  relativeChange: z.number().nullable(),
  percentagePointChange: z.number().optional(),
});
const series = z.object({
  current: z.number().nullable(),
  previous: z.number().nullable(),
  yearAgo: z.number().nullable(),
  mom: comparisons,
  yoy: comparisons,
});
export const workbookAnalysisSchema = z.object({
  kpis: z.record(z.string(), series),
  canonicalOutcomes: z.record(
    z.string(),
    series.extend({ eventName: z.string().nullable(), status: z.string() })
  ),
  audiences: z.object({
    gsc: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
    ga4: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
  }),
  segments: z.object({
    gsc: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
    ga4: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.number()))),
  }),
  contentPillars: z
    .object({
      pillars: z.record(z.string(), z.record(z.string(), z.number().nullable())),
      summary: z.record(z.string(), z.number().nullable()),
    })
    .nullable(),
});
export type WorkbookAnalysis = z.infer<typeof workbookAnalysisSchema>;
export function item<T>(rows: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.entries(rows).find(([name]) => name === key)?.[1];
}
export function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error('Required report evidence is missing: ' + key);
  return value;
}
export function delta(
  current: number | null,
  baseline: number | null,
  mode: 'count' | 'rate' | 'absolute' = 'count'
): ReportValue {
  const change = compare(current, baseline, mode);
  if (change['status'] !== 'comparable') return null;
  if (mode === 'rate') {
    const points = z.number().parse(change['percentagePointChange']);
    return `${points >= 0 ? '+' : ''}${points.toFixed(1)} pp`;
  }
  return z
    .number()
    .nullable()
    .parse(mode === 'absolute' ? change['absoluteChange'] : change['relativeChange']);
}
export function seriesRow(row: z.infer<typeof series>): ReportValue[] {
  const change = (value: z.infer<typeof comparisons>): ReportValue =>
    value.status !== 'comparable'
      ? null
      : value.percentagePointChange === undefined
        ? value.relativeChange
        : `${value.percentagePointChange >= 0 ? '+' : ''}${value.percentagePointChange.toFixed(1)} pp`;
  return [row.current, row.previous, change(row.mom), row.yearAgo, change(row.yoy)];
}
export function cohortValue(
  evidence: WorkbookEvidence,
  values: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>>,
  id: string,
  metric: string,
  period: PeriodId,
  lifecycle?: CohortLifecycle
): number | null {
  const window =
    period === 'current'
      ? lifecycle?.current
      : period === 'previous'
        ? lifecycle?.previous
        : lifecycle?.year_ago;
  if (
    !evidence.bundle.report.periods.some((p) => p.id === period) ||
    window?.status === 'pre_launch'
  )
    return null;
  const row = item(item(values, period) ?? {}, id) ?? {};
  if (metric === 'engagementRate')
    return ratio(item(row, 'engagedSessions') ?? 0, item(row, 'sessions') ?? 0);
  return item(row, metric) ?? 0;
}
export function cohortSeries(
  evidence: WorkbookEvidence,
  values: WorkbookAnalysis['segments']['gsc'],
  id: string,
  metric: string,
  rule?: RouteRule
): ReportValue[] {
  const lifecycle = rule ? buildLifecycle(evidence.bundle.report.periods, [rule])[0] : undefined;
  const current = cohortValue(evidence, values, id, metric, 'current', lifecycle);
  const previous = cohortValue(evidence, values, id, metric, 'previous', lifecycle);
  const yearAgo = cohortValue(evidence, values, id, metric, 'year_ago', lifecycle);
  const mode = metric === 'engagementRate' ? 'rate' : 'count';
  return [
    current,
    previous,
    delta(current, lifecycle?.momEligible === false ? null : previous, mode),
    yearAgo,
    delta(current, lifecycle?.yoyEligible === false ? null : yearAgo, mode),
  ];
}
export function audienceRows(
  evidence: WorkbookEvidence,
  analysis: WorkbookAnalysis,
  id: string
): ReportRows {
  const rule = evidence.bundle.config.audienceRegistry.find((row) => row.id === id);
  return [
    cohortSeries(evidence, analysis.audiences.gsc, id, 'clicks', rule),
    cohortSeries(evidence, analysis.audiences.gsc, id, 'impressions', rule),
    cohortSeries(evidence, analysis.audiences.ga4, id, 'sessions', rule),
    cohortSeries(evidence, analysis.audiences.ga4, id, 'engagementRate', rule),
    seriesRow(required(item(analysis.canonicalOutcomes, id), id)),
  ];
}
export function total(
  bundle: OrganicPerformanceBundle,
  source: 'gsc' | 'ga4',
  id: PeriodId,
  metric: string,
  nonbrand = false
): number | null {
  const rows =
    source === 'gsc' && nonbrand
      ? bundle.sources.gsc.nonBrandedTotals
      : source === 'gsc'
        ? bundle.sources.gsc.periodTotals
        : bundle.sources.ga4.periodTotals;
  const row = rows.find((value) => value.period === id);
  if (!row) return null;
  return z.number().parse(item(row, metric));
}
