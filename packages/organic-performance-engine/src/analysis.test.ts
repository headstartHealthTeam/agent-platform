import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  OrganicPerformanceAnalysisError,
  analyzeBundle,
  canonicalJson,
  canonicalJsonPretty,
  classifyPath,
  compare,
  exactHostname,
  normalizeKeyword,
  normalizePath,
} from './analysis.js';
import { organicPerformanceBundleSchema } from './schemas.js';

async function fixture(name: string): Promise<unknown> {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

describe('organic performance analysis', () => {
  it('reproduces the approved August 2026 golden analysis', async () => {
    const input = await fixture('august-2026-regression.json');
    const expected = await fixture('august-2026-analysis.expected.json');
    const { evidenceCoverage, audiences, lifecycle, ...legacyOutput } = analyzeBundle(input);
    expect(legacyOutput).toEqual(expected);
    expect(evidenceCoverage).toMatchObject({ status: 'complete' });
    expect(audiences).toMatchObject({
      gsc: { current: { families: { clicks: 25, impressions: 3375 } } },
      ga4: { current: { families: { sessions: 24, engagedSessions: 21 } } },
      ga4Reconciliation: { current: { sourceTotal: 510, delta: 1 } },
    });
    expect(lifecycle).toHaveProperty('segments.3.id', 'editorial_legacy');
    expect(lifecycle).toHaveProperty('segments.3.state', 'comparable');
  });

  it('serializes identical evidence deterministically', async () => {
    const input = await fixture('august-2026-regression.json');
    const first = canonicalJsonPretty(analyzeBundle(input));
    const second = canonicalJsonPretty(analyzeBundle(input));
    expect(second).toBe(first);
  });

  it('anchors historical context to the current report period, not extraction or array order', async () => {
    const bundle = organicPerformanceBundleSchema.parse(
      await fixture('august-2026-regression.json')
    );
    const baseline = analyzeBundle(bundle);
    bundle.report.periods.reverse();
    for (const source of Object.values(bundle.sources)) {
      if (source) source.metadata.extractedAt = '2027-01-10T12:00:00Z';
    }
    const replay = analyzeBundle(bundle);
    expect(replay['interpretationContract']).toEqual(baseline['interpretationContract']);
    expect(replay['kpis']).toEqual(baseline['kpis']);
  });

  it('retains zero-baseline and missing comparison semantics', () => {
    expect(compare(2, 0, 'count')).toEqual({
      status: 'not_meaningful_zero_baseline',
      absoluteChange: 2,
      relativeChange: null,
    });
    expect(compare(null, 2, 'count')).toEqual({
      status: 'missing',
      absoluteChange: null,
      relativeChange: null,
    });
  });

  it('normalizes English keywords and exact public paths deterministically', () => {
    expect(normalizeKeyword('  ABA\u00a0  Therapy ')).toBe('aba therapy');
    expect(normalizePath('https://headstart.health//blogs/example/?x=1', 'headstart.health')).toBe(
      '/blogs/example'
    );
    expect(exactHostname('https://headstart.health.evil.test/', 'headstart.health')).toBe(false);
    expect(exactHostname('not a url', 'headstart.health')).toBe(false);
    expect(exactHostname('ftp://headstart.health/', 'headstart.health')).toBe(false);
    expect(normalizePath('(not set)')).toBe('(not set)');
    expect(normalizePath('/resources//example/')).toBe('/resources/example');
    expect(() => normalizePath('')).toThrow(/non-empty/);
    expect(() => normalizePath('relative')).toThrow(/invalid absolute URL/);
    expect(() => normalizePath('https://app.headstart.health/path', 'headstart.health')).toThrow(
      /does not match/
    );
    expect(() => normalizeKeyword('  ')).toThrow(/non-empty/);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(canonicalJson({ b: 2, a: [true, null] })).toBe('{"a":[true,null],"b":2}');
    expect(canonicalJson({ ärzte: 1, zoo: 2, Z: 3, a: 4 })).toBe('{"Z":3,"a":4,"zoo":2,"ärzte":1}');
  });

  it.each(['/resources/100%-effective', '/resources/%E0%A4%A', '/resources/%FF'])(
    'retains undecodable path %s without losing its source metrics',
    async (path) => {
      expect(normalizePath(`${path}/?ignored=true`)).toBe(path);
      expect(normalizePath(`https://headstart.health${path}`, 'headstart.health')).toBe(path);
      const bundle = organicPerformanceBundleSchema.parse(
        await fixture('august-2026-regression.json')
      );
      bundle.config.routeRegistry.push({ id: 'raw_path', prefixes: [], exactPaths: [path] });
      bundle.config.audienceRegistry.push({ id: 'raw_path', prefixes: [], exactPaths: [path] });
      bundle.sources.ga4.landingPageRows.push({
        period: 'current',
        landingPage: path,
        sessions: 7,
        engagedSessions: 5,
        keyEvents: 2,
      });
      bundle.sources.gsc.pageRows.push({
        period: 'current',
        url: `https://headstart.health${path}`,
        clicks: 4,
        impressions: 8,
      });
      const analysis = analyzeBundle(bundle);
      for (const scope of ['segments', 'audiences']) {
        expect(analysis).toHaveProperty(`${scope}.ga4.current.raw_path`, {
          sessions: 7,
          engagedSessions: 5,
          keyEvents: 2,
        });
        expect(analysis).toHaveProperty(`${scope}.gsc.current.raw_path`, {
          clicks: 4,
          impressions: 8,
        });
        expect(analysis).toHaveProperty(`${scope}.ga4Reconciliation.current`, {
          sourceTotal: 510,
          classifiedTotal: 516,
          delta: -6,
        });
        expect(analysis).toHaveProperty(`${scope}.gscReconciliation.current`, {
          sourceTotal: 497,
          classifiedTotal: 501,
          delta: -4,
        });
      }
    }
  );

  it('continues decoding valid percent escapes without partially decoding invalid paths', () => {
    expect(normalizePath('/resources/caf%C3%A9/')).toBe('/resources/café');
    expect(normalizePath('/resources/caf%C3%A9-%FF/')).toBe('/resources/caf%C3%A9-%FF');
  });

  it('applies exact and prefix route rules before the unmatched fallback', () => {
    const registry = [
      { id: 'home', exactPaths: ['/'], prefixes: [] },
      { id: 'resources', exactPaths: [], prefixes: ['/resources/'] },
    ];
    expect(classifyPath('/', registry, 'other')).toBe('home');
    expect(classifyPath('/resources/example', registry, 'other')).toBe('resources');
    expect(classifyPath('/privacy', registry, 'other')).toBe('other');
    expect(classifyPath('(not set)', registry, 'other')).toBe('other');
  });

  it('fails closed for duplicate normalized TAM mappings', async () => {
    const raw = await fixture('august-2026-regression.json');
    const bundle = structuredClone(raw);
    if (typeof bundle !== 'object' || bundle === null) {
      throw new Error('invalid fixture');
    }
    const parsed = bundle as {
      sources: { tam: { keywords: Record<string, unknown>[] } };
    };
    parsed.sources.tam.keywords.push({
      ...parsed.sources.tam.keywords[0],
      keyword: ' FIND ABA CARE ',
      pillar: 'Conflicting pillar',
    });
    expect(() => analyzeBundle(parsed)).toThrow(OrganicPerformanceAnalysisError);
  });

  it('fails closed when the exact public-host GSC filter is missing', async () => {
    const raw = await fixture('august-2026-regression.json');
    const bundle = structuredClone(raw) as {
      sources: { gsc: { metadata: { filters: unknown[] } } };
    };
    bundle.sources.gsc.metadata.filters = [];
    expect(() => analyzeBundle(bundle)).toThrow(/exact public-host filter/);
  });

  it('fails closed for unequal periods and invalid route registries', async () => {
    const raw = await fixture('august-2026-regression.json');
    const unequal = structuredClone(raw) as {
      report: { periods: { id: string; startDate: string; endDate: string }[] };
    };
    const current = unequal.report.periods.find((period) => period.id === 'current');
    if (current === undefined) {
      throw new Error('current period missing');
    }
    current.endDate = '2026-08-30';
    expect(() => analyzeBundle(unequal)).toThrow(/equal lengths/);

    const duplicate = structuredClone(raw) as {
      config: {
        routeRegistry: { id: string; exactPaths: string[]; prefixes: string[] }[];
      };
    };
    const first = duplicate.config.routeRegistry[0];
    if (first === undefined) {
      throw new Error('route fixture missing');
    }
    duplicate.config.routeRegistry.push({ ...first });
    expect(() => analyzeBundle(duplicate)).toThrow(/duplicate routeRegistry/);
  });

  it('calculates non-zero TAM coverage from an exact public-host ranking', async () => {
    const raw = await fixture('august-2026-regression.json');
    const bundle = structuredClone(raw) as {
      sources: {
        semrush: {
          rankings: { keyword: string; position: number; searchVolume: number; url: string }[];
        };
      };
    };
    bundle.sources.semrush.rankings.push({
      keyword: 'ABA BASICS',
      position: 3,
      searchVolume: 222790,
      url: 'https://headstart.health/resources/aba-basics',
    });
    const analysis = analyzeBundle(bundle) as {
      contentPillars: { summary: { semrushExactMatches: number; confirmedTop10Coverage: number } };
    };
    expect(analysis.contentPillars.summary.semrushExactMatches).toBe(1);
    expect(analysis.contentPillars.summary.confirmedTop10Coverage).toBeGreaterThan(0);
  });
});
