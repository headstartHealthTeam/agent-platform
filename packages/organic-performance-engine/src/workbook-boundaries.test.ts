import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { reportingSourcesSchema } from './source-config.js';
import { view } from './workbook-evidence.js';
import { buildWorkbookFacts } from './workbook-facts.js';
import { workbookFixture } from './workbook-fixture.test-helper.js';
import { required, total } from './workbook-metrics.js';
import { supplementalFacts } from './workbook-supplement.js';

async function setup(): Promise<{
  template: unknown;
  sources: ReturnType<typeof reportingSourcesSchema.parse>;
  evidence: Awaited<ReturnType<typeof workbookFixture>>;
}> {
  const [template, sources, evidence] = await Promise.all([
    readFile(new URL('../templates/headstart-report.v1.json', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../../../skills/organic-performance-reporting/references/headstart-sources.json',
        import.meta.url
      ),
      'utf8'
    ),
    workbookFixture(),
  ]);
  return {
    template: JSON.parse(template),
    sources: reportingSourcesSchema.parse(JSON.parse(sources)),
    evidence,
  };
}

describe('workbook source boundary regressions', () => {
  it('keeps optional missing metrics absent while preserving measured zero', async () => {
    const input = await setup();
    const ga = required(input.evidence.bundle.sources.ga4.periodTotals[0], 'GA4 total');
    delete ga['activeUsers'];
    delete ga['sessionKeyEventRate'];
    const nonbrand = required(input.evidence.bundle.sources.gsc.nonBrandedTotals[0], 'GSC total');
    delete nonbrand['ctr'];
    delete nonbrand['averagePosition'];
    const result = buildWorkbookFacts(input);
    expect(result.facts.blocks['acquisition.totals']?.[0]?.[2]).toBeNull();
    expect(result.facts.blocks['acquisition.totals']?.[0]?.[5]).toBeNull();
    expect(result.facts.blocks['search.nonbrand']?.[0]?.slice(3)).toEqual([null, null]);
    ga['activeUsers'] = 0;
    expect(total(input.evidence.bundle, 'ga4', 'current', 'activeUsers')).toBe(0);
    expect(total(input.evidence.bundle, 'ga4', 'current', 'not_present')).toBeNull();
  });

  it('uses one unavailable keyword date across presentation and raw evidence', async () => {
    const input = await setup();
    const semrush = required(input.evidence.bundle.sources.semrush, 'Semrush');
    delete semrush.metadata['keywordSnapshotDate'];
    const blocks = buildWorkbookFacts(input).facts.blocks;
    expect(blocks['market.keywordSnapshot']).toEqual([
      ['Latest keyword snapshot: unavailable (not report-period data)'],
    ]);
    expect(blocks['pillars.boundary']?.[0]?.[0]).toContain('Ranking extract: unavailable.');
    const rankings = required(blocks['raw.semrush'], 'raw rankings').filter(
      (row) => row[0] === 'Keyword ranking'
    );
    expect(rankings.length).toBeGreaterThan(0);
    expect(rankings.every((row) => row[2] === null)).toBe(true);
    expect(rankings.every((row) => row[8] === semrush.metadata.extractedAt)).toBe(true);
  });

  it('preserves a valid snapshot date separately from extraction time', async () => {
    const input = await setup();
    required(input.evidence.bundle.sources.semrush, 'Semrush').metadata['keywordSnapshotDate'] =
      '2026-09-08';
    const blocks = buildWorkbookFacts(input).facts.blocks;
    expect(blocks['market.keywordSnapshot']?.[0]?.[0]).toContain('2026-09-08');
    expect(blocks['pillars.boundary']?.[0]?.[0]).toContain('Ranking extract: 2026-09-08.');
    expect(
      required(blocks['raw.semrush'], 'raw rankings')
        .filter((row) => row[0] === 'Keyword ranking')
        .every((row) => row[2] === '2026-09-08')
    ).toBe(true);
  });

  it.each(['', '2026-02-30', '2026-09-09T00:00:00Z', 123, null])(
    'rejects malformed supplied keyword snapshot date %s',
    async (date) => {
      const input = await setup();
      required(input.evidence.bundle.sources.semrush, 'Semrush').metadata['keywordSnapshotDate'] =
        date;
      expect(() => buildWorkbookFacts(input)).toThrow();
    }
  );

  it('does not attach undated market history to an unavailable reporting snapshot', async () => {
    const input = await setup();
    const semrush = required(input.evidence.bundle.sources.semrush, 'Semrush');
    input.evidence.bundle.report.periods = input.evidence.bundle.report.periods.filter(
      (row) => row.id !== 'year_ago'
    );
    semrush.domainSnapshots = semrush.domainSnapshots.filter((row) => row.period !== 'year_ago');
    view(input.evidence, 'semrush-mcp-read-1').data = {
      tool: 'semrush_domain_rank_history',
      arguments: {
        domain: input.evidence.bundle.config.publicHostname,
        database: semrush.metadata.database,
      },
      response: {
        content: [{ type: 'text', text: 'Organic Traffic;Organic Cost;Rank\n17;23;99' }],
      },
    };
    expect(supplementalFacts(input.evidence, input.sources).get('market.overview')?.[2]).toEqual([
      'Unavailable',
      null,
      null,
      null,
      null,
    ]);
  });
});
