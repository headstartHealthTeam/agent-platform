import type { OrganicPerformanceBundle } from './schemas.js';

type Report = OrganicPerformanceBundle['report'];
const EQUAL_LENGTH = 'equal-length';

export function periodDays(period: Report['periods'][number]): number {
  return (Date.parse(period.endDate) - Date.parse(period.startDate)) / 86_400_000 + 1;
}

function calendarMonth(period: Report['periods'][number]): boolean {
  const start = new Date(`${period.startDate}T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return start.getUTCDate() === 1 && period.endDate === end.toISOString().slice(0, 10);
}

function validateComparisonDates(report: Report): void {
  const current = report.periods.find((period) => period.id === 'current');
  if (!current) throw new Error('report.periods is missing current');
  const start = new Date(`${current.startDate}T00:00:00Z`);
  for (const period of report.periods.filter((candidate) => candidate.id !== 'current')) {
    if (period.endDate >= current.startDate)
      throw new Error('Comparison must precede the current reporting period');
    if (report.comparisonPolicy?.method !== 'calendar-months') continue;
    const expected =
      period.id === 'previous'
        ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1))
        : new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), 1));
    if (period.startDate !== expected.toISOString().slice(0, 10))
      throw new Error(
        'Calendar comparison label does not match its prior-month or prior-year dates'
      );
  }
}

export function validateReportPeriods(report: Report): void {
  const ids = new Set(report.periods.map((period) => period.id));
  if (ids.size !== report.periods.length) throw new Error('Duplicate reporting period');
  if (!ids.has('current')) throw new Error('report.periods is missing current');
  const unavailable = new Map(Object.entries(report.unavailableComparisons ?? {}));
  for (const id of ['previous', 'year_ago'] as const) {
    const omitted = unavailable.get(id);
    if (!ids.has(id) && !omitted)
      throw new Error(`Missing ${id} needs an unavailable-comparison reason`);
    if (ids.has(id) && omitted) throw new Error(`Period ${id} is both present and unavailable`);
  }
  if (report.periods.some((period) => periodDays(period) < 1))
    throw new Error('Reversed reporting period');
  const method = report.comparisonPolicy?.method ?? EQUAL_LENGTH;
  if (method === EQUAL_LENGTH && new Set(report.periods.map(periodDays)).size !== 1)
    throw new Error('Compared periods must have equal lengths under the equal-length policy');
  if (method === 'calendar-months' && !report.periods.every(calendarMonth))
    throw new Error('Calendar-month comparisons require complete calendar months');
  validateComparisonDates(report);
}

export function validateOptionalSources(
  report: Report,
  sources: { readonly semrush?: unknown; readonly tam?: unknown }
): void {
  const entries = new Map(Object.entries(sources));
  const omissions = new Map(Object.entries(report.omittedSources ?? {}));
  for (const id of ['semrush', 'tam'] as const) {
    const present = entries.get(id) !== undefined;
    const omitted = omissions.get(id);
    if (!present && !omitted) throw new Error(`Missing ${id} needs an explicit omission reason`);
    if (present && omitted) throw new Error(`Source ${id} is both present and omitted`);
  }
}

export function validateRowPeriods(bundle: OrganicPerformanceBundle): void {
  const ids = new Set(bundle.report.periods.map((period) => period.id));
  const rows = [
    ...bundle.sources.gsc.pageRows,
    ...bundle.sources.gsc.queryRows,
    ...bundle.sources.ga4.landingPageRows,
    ...bundle.sources.ga4.eventRows,
    ...(bundle.sources.ga4.outcomeRows ?? []),
  ];
  if (rows.some((row) => !ids.has(row.period)))
    throw new Error('Source row references an undeclared period');
}

export function evidenceCoverage(
  bundle: OrganicPerformanceBundle
): Readonly<Record<string, unknown>> {
  const quality = bundle.sources.ga4.metadata.qualityIssues;
  const hasQualityIssues = Array.isArray(quality) && quality.length > 0;
  if (hasQualityIssues && bundle.report.qualityPolicy?.mode !== 'allow-with-caveats')
    throw new Error('GA4 quality issues require an explicit allow-with-caveats policy');
  const omitted = bundle.report.omittedSources ?? {};
  const unavailable = bundle.report.unavailableComparisons ?? {};
  const periods = new Map<string, Record<string, number | string>>(
    bundle.report.periods.map((period) => [
      period.id,
      { status: 'available', days: periodDays(period) },
    ])
  );
  for (const [id, reason] of Object.entries(unavailable))
    periods.set(id, { status: 'unavailable', reason });
  return {
    status:
      Object.keys(omitted).length + Object.keys(unavailable).length > 0 || hasQualityIssues
        ? 'complete_with_limitations'
        : 'complete',
    completionScope: 'declared evidence plan only; not interpretation or publication',
    comparisonPolicy: bundle.report.comparisonPolicy ?? {
      method: EQUAL_LENGTH,
      rationale: 'Legacy bundle comparison policy',
    },
    periods: Object.fromEntries(periods),
    omittedSources: omitted,
    qualityPolicy: bundle.report.qualityPolicy ?? {
      mode: 'require-unflagged',
      rationale: 'Default source-quality policy',
    },
    ga4QualityIssues: quality ?? [],
  };
}
