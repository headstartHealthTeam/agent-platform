import { describe, expect, it } from 'vitest';

import {
  SEMRUSH_READ_OPERATIONS,
  normalizeSemrushRankings,
  preflightSemrush,
  readSemrushRankings,
  semrushDomainRequirement,
  semrushDomainRequestSchema,
  type SemrushDomainRequest,
  type SemrushReadProvider,
} from './semrush.js';

class FixtureProvider implements SemrushReadProvider {
  public async domainOverview(request: SemrushDomainRequest): Promise<unknown> {
    return {
      domain: request.domain,
      database: request.database,
      device: request.device,
      rankingKeywords: 711,
      snapshotDate: '2026-08-15',
    };
  }

  public async domainOrganicKeywords(): Promise<unknown> {
    return [
      {
        keyword: 'bcba private practice',
        position: '21',
        searchVolume: '40',
        url: 'https://example.test/resource',
      },
    ];
  }

  public async keywordOverview(): Promise<unknown> {
    return [];
  }
}

describe('Semrush data adapter', () => {
  it('normalizes numeric provider fields and domain names', async () => {
    const rows = await readSemrushRankings(new FixtureProvider(), {
      domain: 'www.Example.test',
      database: 'us',
    });
    expect(rows[0]).toMatchObject({ position: 21, searchVolume: 40 });
  });

  it('preflights exact scope and declares only bounded read operations', async () => {
    const requirement = semrushDomainRequirement({
      domain: 'www.Example.test',
      database: 'us',
      device: 'desktop',
    });
    expect(requirement.targetAssertions[0]).toEqual({ key: 'domain', expected: 'example.test' });
    expect(SEMRUSH_READ_OPERATIONS).toEqual([
      'domainOverview',
      'domainOrganicKeywords',
      'keywordOverview',
    ]);
    const result = await preflightSemrush(new FixtureProvider(), {
      request: { domain: 'example.test', database: 'us' },
      providerId: 'semrush-mcp',
      adapterVersion: 'pinned-revision',
    });
    expect(result.status).toBe('ready');
  });
  it('validates requirement scope with the same normalization and defaults as requests', () => {
    const input = { domain: 'www.Example.test', database: 'us' };
    const request = semrushDomainRequestSchema.parse(input);
    expect(semrushDomainRequirement(input).targetAssertions).toEqual([
      { key: 'domain', expected: request.domain },
      { key: 'database', expected: request.database },
      { key: 'device', expected: request.device },
    ]);
    const planningInput = {
      ...input,
      limit: 1000,
      snapshotDates: { current: '20260815', previous: '20260715' },
    };
    expect(semrushDomainRequirement(planningInput)).toEqual(semrushDomainRequirement(input));
    expect(() => semrushDomainRequestSchema.parse(planningInput)).toThrow();
    for (const database of ['', 'US', 'us;', 'too-long']) {
      expect(() => semrushDomainRequirement({ ...input, database })).toThrow();
      expect(() => semrushDomainRequestSchema.parse({ ...input, database })).toThrow();
    }
    // Exercise the public runtime boundary without weakening its compile-time device union.
    expect(() => {
      Reflect.apply(semrushDomainRequirement, undefined, [{ ...input, device: 'tablet' }]);
    }).toThrow();
    expect(
      semrushDomainRequirement({ ...input, device: 'mobile' }).targetAssertions
    ).toContainEqual({ key: 'device', expected: 'mobile' });
  });

  it('fails closed for malformed rankings and mismatched provider scope', async () => {
    expect(() => normalizeSemrushRankings([{ keyword: '', position: 0 }])).toThrow();
    const mismatch: SemrushReadProvider = {
      domainOverview: async () => ({
        domain: 'other.test',
        database: 'us',
        device: 'desktop',
        rankingKeywords: 0,
      }),
      domainOrganicKeywords: async () => [],
      keywordOverview: async () => [],
    };
    await expect(
      preflightSemrush(mismatch, {
        request: {
          domain: 'example.test',
          database: 'us',
          device: 'desktop',
          snapshotDate: '20260815',
          limit: 100,
        },
        providerId: 'semrush-mcp',
        adapterVersion: 'pinned-revision',
      })
    ).resolves.toMatchObject({ status: 'wrong-target' });
  });

  it('classifies provider failures without leaking credentials', async () => {
    const unavailable: SemrushReadProvider = {
      domainOverview: async () => {
        throw new Error('private provider credential and response contents');
      },
      domainOrganicKeywords: async () => [],
      keywordOverview: async () => [],
    };
    const result = await preflightSemrush(unavailable, {
      request: { domain: 'example.test', database: 'us' },
      providerId: 'semrush-mcp',
      adapterVersion: 'pinned-revision',
    });
    expect(result).toMatchObject({
      status: 'provider-unavailable',
      permissions: [],
      message: 'Semrush preflight failed; verify the configured provider and requested read access',
    });
    expect(JSON.stringify(result)).not.toContain('private provider');
    const malformed: SemrushReadProvider = {
      ...unavailable,
      domainOverview: async () => ({
        domain: 'private provider credential',
        rankingKeywords: 'private response contents',
      }),
    };
    const malformedResult = await preflightSemrush(malformed, {
      request: { domain: 'example.test', database: 'us' },
      providerId: 'semrush-mcp',
      adapterVersion: 'pinned-revision',
    });
    expect(malformedResult).toEqual(result);
    expect(JSON.stringify(malformedResult)).not.toContain('private');
  });
});
