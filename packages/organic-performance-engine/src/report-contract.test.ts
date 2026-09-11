import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { analyzeBundle } from './analysis.js';
import { organicPerformanceBundleSchema, type OrganicPerformanceBundle } from './schemas.js';

async function fixture(): Promise<OrganicPerformanceBundle> {
  return organicPerformanceBundleSchema.parse(
    JSON.parse(
      await readFile(new URL('../fixtures/august-2026-regression.json', import.meta.url), 'utf8')
    )
  );
}

describe('agent-selected reporting contracts', () => {
  it('rejects overlapping, reversed, and mislabeled calendar comparisons', async () => {
    const bundle = await fixture();
    const previous = bundle.report.periods.find((period) => period.id === 'previous');
    if (!previous) throw new Error('Fixture absent');
    previous.startDate = '2026-09-01';
    previous.endDate = '2026-09-30';
    bundle.report.comparisonPolicy = { method: 'custom', rationale: 'Diagnostic' };
    expect(() => analyzeBundle(bundle)).toThrow(/must precede/);
    previous.startDate = '2026-09-30';
    previous.endDate = '2026-09-01';
    expect(() => analyzeBundle(bundle)).toThrow(/Reversed/);
    previous.startDate = '2026-06-01';
    previous.endDate = '2026-06-30';
    bundle.report.comparisonPolicy = { method: 'calendar-months', rationale: 'Monthly report' };
    expect(() => analyzeBundle(bundle)).toThrow(/label does not match/);
    bundle.report.periods = bundle.report.periods.filter((period) => period.id !== 'current');
    expect(() => analyzeBundle(bundle)).toThrow(/missing current/);
  });
  it('compares complete calendar months with different day counts without scaling totals', async () => {
    const bundle = await fixture();
    bundle.report.comparisonPolicy = {
      method: 'calendar-months',
      rationale: 'Monthly leadership cadence',
    };
    bundle.report.periods = [
      { id: 'current', label: 'September', startDate: '2026-09-01', endDate: '2026-09-30' },
      { id: 'previous', label: 'August', startDate: '2026-08-01', endDate: '2026-08-31' },
      { id: 'year_ago', label: 'Last September', startDate: '2025-09-01', endDate: '2025-09-30' },
    ];
    const result = analyzeBundle(bundle);
    expect(result['evidenceCoverage']).toMatchObject({
      periods: { current: { days: 30 }, previous: { days: 31 } },
    });
    expect(result['kpis']).toMatchObject({ 'ga4.organic_sessions': { current: 510 } });
    const first = bundle.report.periods[0];
    if (!first) throw new Error('Fixture absent');
    first.startDate = '2026-09-02';
    expect(() => analyzeBundle(bundle)).toThrow(/complete calendar months/);
    bundle.report.comparisonPolicy = {
      method: 'custom',
      rationale: 'Explicit event-aligned diagnostic; unequal exposure disclosed',
    };
    expect(analyzeBundle(bundle)['evidenceCoverage']).toMatchObject({
      comparisonPolicy: { method: 'custom' },
    });
  });

  it('retains unavailable YoY as null and requires the declared current and prior evidence', async () => {
    const bundle = await fixture();
    bundle.report.periods = bundle.report.periods.filter((period) => period.id !== 'year_ago');
    expect(() => analyzeBundle(bundle)).toThrow(/unavailable-comparison reason/);
    bundle.report.unavailableComparisons = { year_ago: 'Property instrumentation began this year' };
    for (const source of [bundle.sources.gsc, bundle.sources.ga4])
      source.periodTotals = source.periodTotals.filter((row) => row.period !== 'year_ago');
    bundle.sources.gsc.nonBrandedTotals = bundle.sources.gsc.nonBrandedTotals.filter(
      (row) => row.period !== 'year_ago'
    );
    bundle.sources.gsc.pageRows = bundle.sources.gsc.pageRows.filter(
      (row) => row.period !== 'year_ago'
    );
    bundle.sources.gsc.queryRows = bundle.sources.gsc.queryRows.filter(
      (row) => row.period !== 'year_ago'
    );
    bundle.sources.ga4.landingPageRows = bundle.sources.ga4.landingPageRows.filter(
      (row) => row.period !== 'year_ago'
    );
    bundle.sources.ga4.eventRows = bundle.sources.ga4.eventRows.filter(
      (row) => row.period !== 'year_ago'
    );
    if (bundle.sources.semrush)
      bundle.sources.semrush.domainSnapshots = bundle.sources.semrush.domainSnapshots.filter(
        (row) => row.period !== 'year_ago'
      );
    const result = analyzeBundle(bundle);
    expect(result['kpis']).toMatchObject({
      'ga4.organic_sessions': { current: 510, yearAgo: null, yoy: { status: 'missing' } },
    });
    expect(result['segments']).toMatchObject({ ga4Reconciliation: { year_ago: null } });
    expect(result['evidenceCoverage']).toMatchObject({ status: 'complete_with_limitations' });
    bundle.sources.ga4.periodTotals = bundle.sources.ga4.periodTotals.filter(
      (row) => row.period !== 'previous'
    );
    expect(() => analyzeBundle(bundle)).toThrow(/missing period previous/);
  });

  it('omits optional context explicitly without turning unavailable ranking coverage into zero', async () => {
    const bundle = await fixture();
    delete bundle.sources.semrush;
    expect(() => analyzeBundle(bundle)).toThrow(/omission reason/);
    bundle.report.omittedSources = {
      semrush: 'Provider unavailable; first-party-only interpretation',
    };
    const result = analyzeBundle(bundle);
    expect(result['semrush']).toBeNull();
    expect(result['kpis']).toMatchObject({
      'semrush.ranking_keywords': { current: null },
      'gsc.clicks': { current: 497 },
    });
    expect(result['contentPillars']).toMatchObject({
      summary: { searchVolume: 358150, semrushExactMatches: null, confirmedTop10Coverage: null },
    });
    delete bundle.sources.tam;
    bundle.report.omittedSources.tam = 'No approved planning workbook for this diagnostic';
    expect(analyzeBundle(bundle)['contentPillars']).toBeNull();
  });

  it('rejects contradictory declarations, duplicate periods, undeclared rows, and partial sources', async () => {
    const bundle = await fixture();
    bundle.report.omittedSources = { tam: 'omitted' };
    expect(() => analyzeBundle(bundle)).toThrow(/both present and omitted/);
    delete bundle.report.omittedSources;
    bundle.report.unavailableComparisons = { previous: 'missing' };
    expect(() => analyzeBundle(bundle)).toThrow(/both present and unavailable/);
    delete bundle.report.unavailableComparisons;
    const first = bundle.report.periods[0];
    if (!first) throw new Error('Fixture absent');
    bundle.report.periods.push(first);
    expect(() => analyzeBundle(bundle)).toThrow(/Duplicate reporting period/);
    bundle.report.periods.pop();
    const partial = {
      ...bundle,
      sources: {
        ...bundle.sources,
        ga4: {
          ...bundle.sources.ga4,
          metadata: { ...bundle.sources.ga4.metadata, complete: false },
        },
      },
    };
    expect(() => analyzeBundle(partial)).toThrow();
    bundle.report.periods = bundle.report.periods.filter((period) => period.id !== 'year_ago');
    bundle.report.unavailableComparisons = { year_ago: 'unavailable' };
    expect(() => analyzeBundle(bundle)).toThrow(/undeclared period/);
  });

  it('requires an explicit policy and carries quality caveats into replayed analysis', async () => {
    const bundle = await fixture();
    bundle.sources.ga4.metadata.qualityIssues = [
      { period: 'current', view: 'totals', flags: ['subject_to_thresholding'] },
    ];
    expect(() => analyzeBundle(bundle)).toThrow(/allow-with-caveats/);
    bundle.report.qualityPolicy = {
      mode: 'allow-with-caveats',
      rationale: 'Directional diagnostic; no exact-count claims',
    };
    expect(analyzeBundle(bundle)['evidenceCoverage']).toMatchObject({
      status: 'complete_with_limitations',
      ga4QualityIssues: bundle.sources.ga4.metadata.qualityIssues,
    });
  });

  it('uses separately scoped outcome evidence and never falls back to public-host event totals', async () => {
    const bundle = await fixture();
    bundle.config.outcomeRegistry = [
      {
        audience: 'families',
        eventName: 'family_complete',
        measurement: {
          hostname: 'app.headstart.health',
          metric: 'eventCount',
          rationale: 'Approved family partial-form completion',
        },
      },
    ];
    expect(() => analyzeBundle(bundle)).toThrow(/Scoped outcome evidence is missing/);
    bundle.sources.ga4.outcomeRows = bundle.report.periods.map((period) => ({
      audience: 'families',
      eventName: 'family_complete',
      hostname: 'app.headstart.health',
      metric: 'eventCount',
      period: period.id,
      value: period.id === 'current' ? 7 : null,
    }));
    expect(analyzeBundle(bundle)['canonicalOutcomes']).toMatchObject({
      families: {
        current: 7,
        previous: null,
        status: 'measured',
        measurement: { hostname: 'app.headstart.health' },
      },
    });
    const row = bundle.sources.ga4.outcomeRows[0];
    if (!row) throw new Error('Fixture absent');
    bundle.sources.ga4.outcomeRows.push(row);
    expect(() => analyzeBundle(bundle)).toThrow(/Duplicate scoped outcome/);
    bundle.sources.ga4.outcomeRows.pop();
    row.hostname = 'headstart.health';
    expect(() => analyzeBundle(bundle)).toThrow(/does not match/);
  });
});
