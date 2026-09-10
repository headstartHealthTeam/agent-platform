import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { analyzeBundle, classifyPath } from './analysis.js';
import { cohortConfigSchema, resolveCohortConfig } from './cohort-config.js';
import { collectionPlanSchema } from './collector.js';
import { organicPerformanceBundleSchema } from './schemas.js';

describe('explicit Headstart cohort configuration', () => {
  it('separates organic, campaign, legacy, and Resource routes without guessing article audiences', async () => {
    const cohorts = cohortConfigSchema.parse(
      JSON.parse(
        await readFile(
          new URL(
            '../../../skills/organic-performance-reporting/references/headstart-cohorts.json',
            import.meta.url
          ),
          'utf8'
        )
      )
    );
    const plan = collectionPlanSchema.parse(
      JSON.parse(
        await readFile(new URL('../examples/collection-plan.example.json', import.meta.url), 'utf8')
      )
    );
    const input = { ...plan, config: { ...plan.config, publicHostname: cohorts.publicHostname } };
    const result = resolveCohortConfig(input, cohorts);
    expect(result.report['cohortConfiguration']).toMatchObject({ version: cohorts.version });
    expect(result.config.outcomeRegistry).toEqual(plan.config.outcomeRegistry);
    expect(result.report.periods).toEqual(plan.report.periods);
    for (const [path, id] of [
      ['/locations/georgia/atlanta', 'organic_locations'],
      ['/location/atlanta', 'campaign_locations'],
      ['/aba-therapy/atlanta-ga', 'legacy_locations'],
      ['/resources/aba-basics', 'resources'],
    ] as const)
      expect(classifyPath(path, result.config.routeRegistry, 'unmapped')).toBe(id);
    expect(
      classifyPath('/resources/aba-basics', result.config.audienceRegistry, 'unassigned')
    ).toBe('unassigned');
    expect(classifyPath('/resources/families', result.config.audienceRegistry, 'unassigned')).toBe(
      'families'
    );
    expect(() => resolveCohortConfig(plan, cohorts)).toThrow('hostname');
  });

  it('carries new-section lifecycle through analysis while retaining established audience history', async () => {
    const bundle = organicPerformanceBundleSchema.parse(
      JSON.parse(
        await readFile(new URL('../fixtures/august-2026-regression.json', import.meta.url), 'utf8')
      )
    );
    bundle.config.routeRegistry.unshift({
      id: 'resources',
      exactPaths: [],
      prefixes: ['/resources'],
      lifecycle: {
        launchedOn: '2026-09-08',
        evidenceUrl: 'https://example.com/release',
        comparisonPolicy: 'complete-post-launch-months',
      },
    });
    const analysis = analyzeBundle(bundle);
    const lifecycle = analysis['lifecycle'];
    expect(lifecycle).toHaveProperty(
      'segments.0',
      expect.objectContaining({
        id: 'resources',
        state: 'pre_launch',
        momEligible: false,
        yoyEligible: false,
      })
    );
    expect(lifecycle).toHaveProperty(
      'audiences.0',
      expect.objectContaining({ id: 'families', state: 'comparable', momEligible: true })
    );
    expect(analysis['audiences']).toMatchObject({
      gsc: { current: { families: { clicks: 25 } } },
    });
  });

  it('uses an outcome-specific effective date without resetting audience acquisition history', async () => {
    const bundle = organicPerformanceBundleSchema.parse(
      JSON.parse(
        await readFile(new URL('../fixtures/august-2026-regression.json', import.meta.url), 'utf8')
      )
    );
    const outcome = bundle.config.outcomeRegistry.find((row) => row.audience === 'bcbas');
    if (!outcome) throw new Error('Synthetic outcome missing');
    const originalAudiences = analyzeBundle(bundle)['audiences'];
    outcome.measurementLifecycle = {
      launchedOn: '2026-07-15',
      evidenceUrl: 'https://example.com/instrumentation',
      comparisonPolicy: 'complete-post-launch-months',
    };
    const analysis = analyzeBundle(bundle);
    expect(analysis['canonicalOutcomes']).toMatchObject({
      bcbas: {
        current: 10,
        previous: 6,
        yearAgo: null,
        mom: { status: 'missing' },
        yoy: { status: 'missing' },
        lifecycle: { state: 'first_full_baseline', previous: { status: 'partial_launch_month' } },
      },
    });
    expect(analysis['audiences']).toEqual(originalAudiences);
    outcome.measurementLifecycle.launchedOn = '2026-08-15';
    expect(analyzeBundle(bundle)['canonicalOutcomes']).toMatchObject({
      bcbas: {
        status: 'partial_launch_month',
        current: 10,
        previous: null,
        mom: { status: 'missing' },
        observed: { current: 10, previous: 6 },
      },
    });
    outcome.measurementLifecycle.launchedOn = '2026-09-08';
    expect(analyzeBundle(bundle)['canonicalOutcomes']).toMatchObject({
      bcbas: {
        status: 'pre_launch',
        current: null,
        previous: null,
        observed: { current: 10 },
      },
    });
  });
});
