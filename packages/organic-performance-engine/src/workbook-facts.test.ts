import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { sha256Json } from './analysis.js';
import { reportingSourcesSchema } from './source-config.js';
import { workbookTemplateSchema } from './workbook-contract.js';
import {
  numeric,
  ratio,
  view,
  gaView,
  gscView,
  landingPages,
  publicPages,
  validateWorkbookEvidence,
} from './workbook-evidence.js';
import { buildWorkbookFacts } from './workbook-facts.js';
import { workbookFixture } from './workbook-fixture.test-helper.js';
import { delta, required, total } from './workbook-metrics.js';

async function setup(): Promise<Parameters<typeof buildWorkbookFacts>[0]> {
  const [template, sources, evidence] = await Promise.all([
    readFile(new URL('../templates/headstart-report.v1.json', import.meta.url), 'utf8').then(
      (text): unknown => JSON.parse(text)
    ),
    readFile(
      new URL(
        '../../../skills/organic-performance-reporting/references/headstart-sources.json',
        import.meta.url
      ),
      'utf8'
    ).then((text): unknown => JSON.parse(text)),
    workbookFixture(),
  ]);
  return { template, sources, evidence };
}
describe('deterministic full-workbook projection', () => {
  it('requires the collected source identity and rejects silent source/template/TAM drift', async () => {
    const input = await setup();
    const evidence = await workbookFixture();
    const sources = reportingSourcesSchema.parse(input.sources);
    expect(() => buildWorkbookFacts({ ...input, evidence })).not.toThrow();
    const template = workbookTemplateSchema.parse(input.template);
    expect(() =>
      buildWorkbookFacts({
        ...input,
        evidence,
        template: { ...template, version: 'unapproved/v99' },
      })
    ).toThrow('Workbook template differs');
    delete evidence.bundle.report.sourceConfiguration;
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow(
      'Legacy bundles remain analysis-only'
    );
    evidence.bundle.report.sourceConfiguration = {
      version: sources.version,
      sha256: sha256Json(sources),
    };
    expect(() =>
      buildWorkbookFacts({ ...input, evidence, sources: { ...sources, version: 'changed/v99' } })
    ).toThrow('differs');
    evidence.bundle.report.sourceConfiguration.sha256 = 'a'.repeat(64);
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow('differs');
    evidence.bundle.report.sourceConfiguration.sha256 = sha256Json(sources);
    expect(() =>
      buildWorkbookFacts({
        ...input,
        evidence,
        sources: { ...sources, tam: { ...sources.tam, range: "'Other TAM'!A1:T200" } },
      })
    ).toThrow('differs');
    expect(() =>
      buildWorkbookFacts({
        ...input,
        evidence,
        sources: {
          ...sources,
          strategy: { ...sources.strategy, title: 'Changed role provenance' },
        },
      })
    ).toThrow('differs');
    const tam = required(evidence.bundle.sources.tam, 'TAM');
    tam.metadata.sourceId = 'different-source';
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow('TAM identity');
    tam.metadata.sourceId = sources.tam.id;
    tam.metadata['range'] = "'Other TAM'!A1:T200";
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow('TAM identity');
  });
  it('projects verified zero rankings while retaining TAM denominators and a dated snapshot heading', async () => {
    const input = await setup();
    const evidence = await workbookFixture();
    required(evidence.bundle.sources.semrush, 'Semrush').rankings = [];
    const extract = view(evidence, 'semrush-mcp-read-3');
    extract.data = {
      tool: 'semrush_domain_organic_keywords',
      arguments: { domain: evidence.bundle.config.publicHostname, database: 'us' },
      response: {
        content: [{ type: 'text', text: 'Keyword;Position;Search Volume;Traffic (%);Url' }],
      },
    };
    const result = buildWorkbookFacts({ ...input, evidence });
    expect(result.facts.blocks['market.topKeywords']).toEqual([]);
    expect(result.facts.blocks['market.keywordSnapshot']).toEqual([
      ['Latest keyword snapshot: 2026-09-09 (not report-period data)'],
    ]);
    expect(result.facts.blocks['market.overview']?.[0]?.slice(0, 2)).toEqual(['Aug 2026', 711]);
    const pillars = required(result.facts.blocks['pillars.metrics'], 'pillar metrics');
    expect(pillars.length).toBeGreaterThan(0);
    expect(pillars.some((row) => Number(row[1]) > 0)).toBe(true);
    expect(pillars.every((row) => row[5] === 0 && row[6] === 0)).toBe(true);
    evidence.views = evidence.views.filter((row) => row !== extract);
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow(
      'Exactly one retained Semrush'
    );
  });
  it('rejects failed, duplicate and wrong-header Semrush extracts rather than manufacturing zero', async () => {
    const input = await setup();
    const evidence = await workbookFixture();
    const extract = view(evidence, 'semrush-mcp-read-3');
    const data = {
      tool: 'semrush_domain_organic_keywords',
      arguments: { domain: evidence.bundle.config.publicHostname, database: 'us' },
      response: { content: [{ type: 'text', text: 'Keyword;Position;Search Volume;Url' }] },
    };
    extract.data = data;
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow('required headers');
    extract.data = { ...data, response: { isError: true, content: [] } };
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow('MCP returned an error');
    extract.data = {
      ...data,
      response: {
        content: [{ type: 'text', text: 'Keyword;Position;Search Volume;Traffic (%);Url' }],
      },
    };
    evidence.views.push({ ...extract, name: 'semrush-mcp-read-4' });
    expect(() => buildWorkbookFacts({ ...input, evidence })).toThrow(
      'Exactly one retained Semrush'
    );
  });
  it('projects every approved factual binding with complete raw rows, rates and provenance', async () => {
    const input = await setup();
    const result = buildWorkbookFacts(input);
    expect(result).toEqual(buildWorkbookFacts(input));
    expect(result.facts.blocks['report.title']?.[0]?.[0]).not.toContain('validation');
    expect(result.facts.blocks['kpi.sitewide']?.[0]?.slice(0, 2)).toEqual([497, 633]);
    expect(result.facts.blocks['cards.values1']?.[0]).toEqual([
      497,
      null,
      null,
      null,
      14570,
      null,
      null,
      null,
      510,
      null,
      null,
      null,
    ]);
    expect(result.facts.blocks['kpi.sitewide']?.[2]?.[2]).toContain('pp');
    expect(result.facts.blocks['segments.ga4']?.[0]?.[8]).toBeCloseTo(0.1);
    expect(result.facts.blocks['market.topKeywords']).toHaveLength(2);
    expect(
      result.facts.blocks['raw.semrush']?.filter((row) => row[0] === 'Historical domain context')
    ).toHaveLength(3);
    expect(result.facts.blocks['content.pages']?.[0]?.[0]).toBe('/');
    expect(result.facts.blocks['pillars.metrics']?.length).toBeGreaterThan(0);
    expect(result.facts.evidence.every((row) => row.sourceSha256.length === 64)).toBe(true);
  });
  it('honors explicit diagnostic selections and rejects unknown, duplicate or overflowing selections', async () => {
    const input = await setup();
    expect(
      buildWorkbookFacts({ ...input, selection: { 'search.pages': ['/bcba'] } }).facts.blocks[
        'search.pages'
      ]
    ).toHaveLength(1);
    expect(() =>
      buildWorkbookFacts({ ...input, selection: { 'search.pages': ['/missing'] } })
    ).toThrow('missing');
    expect(() =>
      buildWorkbookFacts({ ...input, selection: { 'search.pgaes': ['/bcba'] } })
    ).toThrow();
    expect(() =>
      buildWorkbookFacts({ ...input, selection: { 'search.pages': ['/bcba', '/bcba'] } })
    ).toThrow('selection');
    expect(() =>
      buildWorkbookFacts({
        ...input,
        selection: { 'search.pages': Array.from({ length: 16 }, (_, index) => String(index)) },
      })
    ).toThrow('selection');
  });
  it('separates prelaunch and partial observations from full-month comparisons', async () => {
    const input = await setup();
    const evidence = await workbookFixture();
    const rule = evidence.bundle.config.routeRegistry[0];
    if (!rule) throw new Error('fixture');
    rule.lifecycle = {
      launchedOn: '2026-09-08',
      evidenceUrl: 'https://example.com/release',
      comparisonPolicy: 'complete-post-launch-months',
    };
    const before = buildWorkbookFacts({ ...input, evidence }).facts.blocks;
    expect(before['segments.gsc']?.[0]?.[2]).toBeNull();
    expect(before['content.rollup']?.[0]?.[1]).toBeNull();
    expect(before['initiatives.lifecycle']?.[0]?.slice(1)).toEqual([
      '2026-09-08',
      '2026-10',
      '2026-11',
      '2027-10',
    ]);
    rule.lifecycle.launchedOn = '2026-08-08';
    const partial = buildWorkbookFacts({ ...input, evidence }).facts.blocks;
    expect(partial['segments.gsc']?.[0]?.[2]).toBeGreaterThan(0);
    expect(partial['segments.gsc']?.[0]?.[4]).toBeNull();
  });
  it('preserves optional-source absence and unavailable comparisons without manufacturing zeros', async () => {
    const input = await setup();
    const evidence = await workbookFixture();
    delete evidence.bundle.sources.semrush;
    delete evidence.bundle.sources.tam;
    evidence.views = evidence.views.filter((row) => !row.name.startsWith('semrush-'));
    evidence.bundle.report.omittedSources = {
      semrush: 'Not requested in synthetic test',
      tam: 'Not requested in synthetic test',
    };
    const result = buildWorkbookFacts({ ...input, evidence });
    expect(result.facts.blocks['market.overview']).toEqual([]);
    expect(result.facts.blocks['pillars.metrics']).toEqual([]);
  });
  it('rejects evidence drift, duplicate views and incomplete retained pages', async () => {
    const evidence = await workbookFixture();
    evidence.views.push(required(evidence.views[0], 'view'));
    expect(() => {
      validateWorkbookEvidence(evidence);
    }).toThrow('Duplicate');
    evidence.views.pop();
    const page = evidence.bundle.sources.gsc.pageRows[0];
    if (!page) throw new Error('fixture');
    page.clicks += 1;
    expect(() => {
      validateWorkbookEvidence(evidence);
    }).toThrow('differ');
  });
  it('rejects per-page reassignment even when GA4 grand totals still agree', async () => {
    const evidence = await workbookFixture();
    const rows = evidence.bundle.sources.ga4.landingPageRows.filter((r) => r.period === 'current');
    const first = required(rows[0], 'first landing row');
    const second = required(rows[1], 'second landing row');
    [first.landingPage, second.landingPage] = [second.landingPage, first.landingPage];
    expect(() => {
      validateWorkbookEvidence(evidence);
    }).toThrow('GA4 landing rows differ');
  });
  it('rejects retained-query and bundle disagreement', async () => {
    const evidence = await workbookFixture();
    required(evidence.bundle.sources.gsc.queryRows[0], 'query').impressions += 1000;
    expect(() => {
      validateWorkbookEvidence(evidence);
    }).toThrow('GSC query rows differ');
  });
  it('does not label TAM opportunities unranked when Semrush evidence is missing', async () => {
    const input = await setup();
    const evidence = await workbookFixture();
    delete evidence.bundle.sources.semrush;
    evidence.views = evidence.views.filter((row) => !row.name.startsWith('semrush-'));
    evidence.bundle.report.omittedSources = { semrush: 'Not selected' };
    const blocks = buildWorkbookFacts({ ...input, evidence }).facts.blocks;
    expect(blocks['pillars.metrics']?.length).toBeGreaterThan(0);
    expect(blocks['pillars.opportunities']).toEqual([]);
  });
  it('uses absolute impression changes in the approved pillar change column', async () => {
    const input = await setup();
    for (const row of buildWorkbookFacts(input).facts.blocks['pillars.metrics'] ?? []) {
      expect(row[12]).toBe(Number(row[10]) - Number(row[11]));
    }
  });
  it('keeps chart header rows inside every approved source range so legends are labeled', async () => {
    const input = await setup();
    const { workbookTemplateSchema } = await import('./workbook-contract.js');
    const template = workbookTemplateSchema.parse(input.template);
    for (const sheet of template.sheets) {
      for (const spec of sheet.chartSpecs) {
        expect(spec).toHaveProperty('basicChart.headerCount', 1);
      }
    }
    expect(template.sheets.flatMap((sheet) => sheet.chartSpecs)).toHaveLength(4);
  });
  it('validates raw contracts and numeric missingness', async () => {
    const evidence = await workbookFixture();
    expect(gaView(evidence, 'current', 'channels')).toHaveLength(2);
    expect(gscView(evidence, 'current', 'nonbranded-queries').length).toBeGreaterThan(0);
    expect(publicPages(evidence, 'current')[0]?.position).toBe(12);
    expect(landingPages(evidence, 'current')[0]?.activeUsers).toBe(10);
    expect(() => view(evidence, 'missing')).toThrow('Exactly one');
    expect(() => numeric({ value: '' }, 'value')).toThrow('Missing numeric');
    expect(() => {
      required(undefined, 'x');
    }).toThrow('missing');
    expect(ratio(0, 0)).toBeNull();
    expect(delta(1, 0)).toBeNull();
    expect(delta(2, 1, 'absolute')).toBe(1);
    expect(total(evidence.bundle, 'gsc', 'current', 'clicks')).toBe(497);
  });
});
