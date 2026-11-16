import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { sha256Json } from './analysis.js';
import { reportContextSchema, type ReportContext } from './report-context.js';
import { reportingSourcesSchema } from './source-config.js';
import { workbookTemplateSchema } from './workbook-contract.js';
import { buildDetailedFacts } from './workbook-detail.js';
import { view } from './workbook-evidence.js';
import { buildWorkbookFacts } from './workbook-facts.js';
import { workbookFixture } from './workbook-fixture.test-helper.js';
import { required } from './workbook-metrics.js';

const source = {
  url: 'https://example.com/review',
  revision: 'review-1',
  retrievedAt: '2026-09-09T12:00:00Z',
};
function context(): ReportContext {
  return {
    schemaVersion: 'organic-report-context/v1',
    publicHostname: 'headstart.health',
    reportWindow: { startDate: '2026-08-01', endDate: '2026-08-31' },
    editorial: {
      version: 'synthetic/v1',
      sources: [source],
      mappingPolicy: 'Verified synthetic metadata.',
      pillars: [{ id: 'business', audience: 'bcbas', label: 'Business', sourceUrl: source.url }],
      articles: [
        {
          path: '/bcba',
          title: 'Synthetic article',
          audience: 'bcbas',
          pillarId: 'business',
          publishedOn: '2025-01-01',
          sourceUrl: source.url,
          rationale: 'Synthetic business article.',
        },
      ],
    },
    aiVisibility: {
      status: 'unavailable',
      checkedAt: source.retrievedAt,
      provider: 'Synthetic MCP',
      reason: 'No AI report capability.',
      evidence: [source],
    },
    highlightPaths: ['/bcba'],
    followUps: [],
    journeyAssessment: {
      status: 'aggregate-only',
      explanation: 'Separate event totals are not a funnel.',
      sources: [source],
      steps: [],
    },
  };
}

describe('expanded reporting evidence', () => {
  it('fills every fact binding in the v2 template without changing the historical contract', async () => {
    const evidence = await workbookFixture();
    const template = workbookTemplateSchema.parse(
      JSON.parse(
        await readFile(new URL('../templates/headstart-report.v2.json', import.meta.url), 'utf8')
      )
    );
    const sources: unknown = JSON.parse(
      await readFile(
        new URL(
          '../../../skills/organic-performance-reporting/references/headstart-sources.v2.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    evidence.bundle.report.sourceConfiguration = {
      version: 'headstart-organic-sources/v2',
      sha256: sha256Json(sources),
    };
    const result = buildWorkbookFacts({ evidence, sources, template, context: context() });
    const bindings = template.sheets.flatMap((sheet) =>
      sheet.bindings.filter((binding) => binding.owner === 'facts')
    );
    expect(Object.keys(result.facts.blocks).sort()).toEqual(
      bindings.map((binding) => binding.id).sort()
    );
    for (const binding of bindings) {
      const rows = required(result.facts.blocks[binding.id], binding.id);
      expect(rows.length).toBeLessThanOrEqual(binding.expandRows ?? binding.range.rows);
      expect(rows.every((row) => row.length <= binding.range.columns)).toBe(true);
    }
    expect(result.facts.evidence.some((row) => row.source === 'report-context')).toBe(true);
    expect(result.facts.blocks['detail.highlightBoundary']).toEqual([
      ['Primary evidence: 2026-08-01 to 2026-08-31.'],
    ]);
    expect(template.revision).toBe(2);
    expect(
      template.sheets.flatMap((sheet) => sheet.bindings).find((b) => b.id === 'detail.followUps')
        ?.optionalSection
    ).toEqual({ startRow: 26, endRow: 42 });
  });
  it('withholds reviewed partial GSC comparisons while retaining GA4 YoY and raw search evidence', async () => {
    const evidence = await workbookFixture();
    evidence.bundle.sources.gsc.metadata.unavailableComparisons = {
      year_ago: 'Only four daily rows returned; historical month is incomplete.',
    };
    const template: unknown = JSON.parse(
      await readFile(new URL('../templates/headstart-report.v1.json', import.meta.url), 'utf8')
    );
    const sources: unknown = JSON.parse(
      await readFile(
        new URL(
          '../../../skills/organic-performance-reporting/references/headstart-sources.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    const result = buildWorkbookFacts({ evidence, template, sources });
    expect(result.facts.blocks['kpi.sitewide']?.[0]?.[3]).toBeNull();
    expect(result.facts.blocks['kpi.sitewide']?.[0]?.[4]).toBeNull();
    const baseline = structuredClone(evidence);
    delete baseline.bundle.sources.gsc.metadata.unavailableComparisons;
    const original = buildWorkbookFacts({ evidence: baseline, template, sources });
    expect(result.facts.blocks['kpi.sitewide']?.[3]?.[3]).toBe(
      original.facts.blocks['kpi.sitewide']?.[3]?.[3]
    );
    expect(result.facts.blocks['kpi.bcbas']?.[0]?.[3]).toBeNull();
    expect(result.facts.blocks['report.boundary']?.[0]?.[0]).toContain(
      'historical month is incomplete'
    );
    expect(result.facts.blocks['raw.gsc']?.some((row) => row[0] === 'gsc-year_ago-pages')).toBe(
      true
    );
    expect(
      buildDetailedFacts(evidence, context())
        .get('detail.pillars')
        ?.filter((row) => row[2] === 'Aug 2025')
        .every((row) => row[4] === null)
    ).toBe(true);
  });
  it('projects reproducible page/query comparisons, article coverage and explicit AI unavailability', async () => {
    const evidence = await workbookFixture();
    const result = buildDetailedFacts(evidence, context());
    expect(result).toEqual(buildDetailedFacts(evidence, context()));
    const page = result
      .get('detail.search')
      ?.find((row) => row[0] === 'Page' && row[1] === '/bcba');
    expect(page?.slice(2, 6)).toEqual([87, 102, -15, -15 / 102]);
    expect(result.get('detail.articles')?.[0]?.slice(0, 4)).toEqual([
      'Synthetic article',
      '/bcba',
      'bcbas',
      'Business',
    ]);
    expect(result.get('detail.ai')?.[0]?.[1]).toBe('Unavailable');
    expect(result.get('detail.funnel')).toEqual([]);
    expect(result.get('detail.provenance')?.[0]?.[0]).toContain(source.url);
    expect(
      result.get('detail.pillars')?.some((row) => row[0] === 'bcbas' && row[1] === 'Business')
    ).toBe(true);
  });
  it('retains missing rows as null instead of inferring zero and includes vanished rows', async () => {
    const evidence = await workbookFixture();
    const previous = view(evidence, 'gsc-previous-queries');
    previous.data = {
      request: {
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        dimensions: ['query'],
        dimensionFilterGroups: [{ filters: evidence.bundle.sources.gsc.metadata.filters }],
      },
      rows: [{ keys: ['vanished'], clicks: 0, impressions: 3, ctr: 0, position: 4 }],
      rowCount: 1,
      pagination: { truncatedAtMaxRows: false },
    };
    const rows = buildDetailedFacts(evidence, context()).get('detail.search');
    const missing = rows?.find((row) => row[1] === 'vanished');
    expect(missing?.slice(2, 6)).toEqual([null, 0, null, null]);
    expect(missing?.[16]).toContain('not inferred zero');
  });
  it.each([null, 0])(
    'keeps page drilldowns consistent for a %s baseline while preserving v1 replay',
    async (baseline) => {
      const evidence = await workbookFixture();
      for (const id of ['previous', 'year_ago'] as const) {
        const window = required(
          evidence.bundle.report.periods.find((row) => row.id === id),
          id
        );
        evidence.bundle.sources.gsc.pageRows = evidence.bundle.sources.gsc.pageRows.flatMap(
          (row) => {
            if (row.period !== id || row.url !== 'https://headstart.health/bcba') return [row];
            return baseline === null ? [] : [{ ...row, clicks: baseline }];
          }
        );
        const rows = evidence.bundle.sources.gsc.pageRows
          .filter((row) => row.period === id)
          .map((row) => ({
            keys: [row.url],
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.impressions ? row.clicks / row.impressions : 0,
            position: 12,
          }));
        view(evidence, `gsc-${id}-pages`).data = {
          request: {
            startDate: window.startDate,
            endDate: window.endDate,
            dimensions: ['page'],
            dimensionFilterGroups: [{ filters: evidence.bundle.sources.gsc.metadata.filters }],
          },
          rows,
          rowCount: rows.length,
          pagination: { truncatedAtMaxRows: false },
        };
      }
      for (const version of ['v1', 'v2']) {
        const template: unknown = JSON.parse(
          await readFile(
            new URL(`../templates/headstart-report.${version}.json`, import.meta.url),
            'utf8'
          )
        );
        const sources: unknown = JSON.parse(
          await readFile(
            new URL(
              `../../../skills/organic-performance-reporting/references/headstart-sources${version === 'v1' ? '' : '.v2'}.json`,
              import.meta.url
            ),
            'utf8'
          )
        );
        evidence.bundle.report.sourceConfiguration = {
          version: reportingSourcesSchema.parse(sources).version,
          sha256: sha256Json(sources),
        };
        const result = buildWorkbookFacts({
          evidence,
          sources,
          template,
          ...(version === 'v2' ? { context: context() } : {}),
        }).facts.blocks;
        const expected = version === 'v2' && baseline === null ? null : 87;
        const search = required(
          result['search.pages']?.find((row) => row[0] === '/bcba'),
          'search'
        );
        const content = required(
          result['content.pages']?.find((row) => row[0] === '/bcba'),
          'content'
        );
        expect(search.slice(5, 7)).toEqual([expected, expected]);
        expect(content.slice(6, 8)).toEqual([expected, expected]);
        if (version === 'v2') {
          const comparison = required(
            result['detail.search']?.find((row) => row[0] === 'Page' && row[1] === '/bcba'),
            'comparison'
          );
          expect(comparison.slice(2, 6)).toEqual([87, baseline, expected, null]);
          expect(content[6]).toBe(comparison[4]);
          expect(search[5]).toBe(comparison[4]);
        }
      }
    }
  );
  it('keeps undated articles visible without asserting historical publication counts', async () => {
    const input = context();
    required(input.editorial.articles[0], 'article').publishedOn = null;
    const result = buildDetailedFacts(await workbookFixture(), input);
    expect(result.get('detail.articles')).toHaveLength(1);
    const rows = required(result.get('detail.pillars'), 'pillars').filter(
      (row) => row[0] === 'bcbas' && row[1] === 'Business'
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row[3]).toBeNull();
      expect(row[10]).toContain('1 undated, publication count unavailable');
    }
    expect(rows[0]?.[4]).toBe(87);
  });
  it('sums repeated outcome events while preserving absent and measured-zero values', async () => {
    const evidence = await workbookFixture();
    evidence.bundle.sources.ga4.eventRows = [
      { period: 'current', eventName: 'interest_form_submit', keyEvents: 2 },
      { period: 'current', eventName: 'interest_form_submit', keyEvents: 3 },
      { period: 'previous', eventName: 'interest_form_submit', keyEvents: 0 },
    ];
    const rows = required(
      buildDetailedFacts(evidence, context()).get('detail.outcomes'),
      'outcomes'
    ).filter((row) => row[0] === 'bcbas');
    expect(rows.map((row) => row[5])).toEqual([5, 0, null]);
  });
  it('shows launch-month observations without a misleading full-month growth rate', async () => {
    const input = context();
    required(input.editorial.articles[0], 'article').publishedOn = '2026-07-24';
    const result = buildDetailedFacts(await workbookFixture(), input);
    const row = result.get('detail.search')?.find((item) => item[1] === '/bcba');
    expect(row?.[2]).toBe(87);
    expect(row?.[3]).toBe(102);
    expect(row?.[5]).toBeNull();
    expect(row?.[16]).toBe('first_full_baseline');
  });
  it('uses the later route launch even when the article predates its new URL', async () => {
    const evidence = await workbookFixture();
    const route = required(
      evidence.bundle.config.routeRegistry.find((rule) => rule.exactPaths.includes('/bcba')),
      'route'
    );
    route.lifecycle = {
      launchedOn: '2026-07-15',
      evidenceUrl: source.url,
      comparisonPolicy: 'complete-post-launch-months',
    };
    const row = buildDetailedFacts(evidence, context())
      .get('detail.search')
      ?.find((item) => item[1] === '/bcba');
    expect(row?.[5]).toBeNull();
    expect(row?.[16]).toBe('first_full_baseline');
  });
  it('rejects wrong target/window, duplicate and cross-audience classifications', async () => {
    const evidence = await workbookFixture();
    expect(() =>
      buildDetailedFacts(evidence, { ...context(), publicHostname: 'other.test' })
    ).toThrow('target/period');
    expect(() =>
      buildDetailedFacts(evidence, {
        ...context(),
        reportWindow: { startDate: '2026-09-01', endDate: '2026-09-30' },
      })
    ).toThrow('target/period');
    const input = context();
    input.editorial.articles.push({ ...required(input.editorial.articles[0], 'article') });
    expect(() => reportContextSchema.parse(input)).toThrow('Duplicate article');
    input.editorial.articles.pop();
    required(input.editorial.articles[0], 'article').audience = 'families';
    expect(() => reportContextSchema.parse(input)).toThrow('belong to its audience');
  });
  it('keeps dated AI observations and later follow-ups separate from monthly values', async () => {
    const input = context();
    input.aiVisibility = {
      status: 'available',
      observations: [
        {
          provider: 'Synthetic AI source',
          platform: 'Assistant',
          metric: 'Citations',
          definition: 'Observed citations in a fixed prompt sample.',
          value: 0,
          unit: 'count',
          window: input.reportWindow,
          coverage: '20 synthetic prompts',
          source,
        },
      ],
    };
    input.followUps = [
      {
        label: 'Later signal',
        metric: 'Impressions',
        value: 8,
        unit: 'count',
        window: { startDate: '2026-09-01', endDate: '2026-09-08' },
        source,
        limitation: 'Unequal period; no growth comparison.',
      },
    ];
    const evidence = await workbookFixture();
    const result = buildDetailedFacts(evidence, input);
    expect(result.get('detail.ai')?.[0]?.[3]).toBe(0);
    expect(result.get('detail.followUps')?.[0]?.[4]).toBe('2026-09-01 to 2026-09-08');
    expect(result.get('detail.highlightBoundary')?.[0]?.[0]).toContain(
      'Follow-up observations above are separately dated'
    );
    input.highlightPaths = ['/no-evidence'];
    expect(() => buildDetailedFacts(evidence, input)).toThrow('no retained page evidence');
  });
  it('does not permit unordered or out-of-period aggregate events to masquerade as a funnel', () => {
    const input = context();
    input.journeyAssessment.steps = [
      {
        audience: 'families',
        step: 'Started',
        population: 'same users',
        count: 4,
        window: input.reportWindow,
        source,
      },
    ];
    expect(() => reportContextSchema.parse(input)).toThrow('Aggregate events');
    input.journeyAssessment.status = 'verified-funnel';
    input.journeyAssessment.steps.push({
      ...required(input.journeyAssessment.steps[0], 'step'),
      step: 'Complete',
      count: 5,
    });
    expect(() => reportContextSchema.parse(input)).toThrow('cannot increase');
    required(input.journeyAssessment.steps[1], 'step').count = 2;
    expect(reportContextSchema.parse(input).journeyAssessment.status).toBe('verified-funnel');
    required(input.journeyAssessment.steps[1], 'step').population = 'different users';
    expect(() => reportContextSchema.parse(input)).toThrow('Each funnel population');
    required(input.journeyAssessment.steps[1], 'step').population = 'same users';
    required(input.journeyAssessment.steps[1], 'step').step = 'Started';
    expect(() => reportContextSchema.parse(input)).toThrow('Duplicate funnel step');
    input.journeyAssessment.steps = [];
    input.journeyAssessment.status = 'aggregate-only';
    input.highlightPaths = ['/bcba/'];
    expect(() => reportContextSchema.parse(input)).toThrow('Highlight paths must be normalized');
  });
});
