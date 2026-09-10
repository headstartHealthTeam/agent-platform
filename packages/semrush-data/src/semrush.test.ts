import { describe, expect, it } from 'vitest';

import {
  SEMRUSH_READ_OPERATIONS,
  normalizeSemrushRankings,
  preflightSemrush,
  readSemrushRankings,
  semrushDomainRequirement,
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
        throw new Error('provider unavailable');
      },
      domainOrganicKeywords: async () => [],
      keywordOverview: async () => [],
    };
    await expect(
      preflightSemrush(unavailable, {
        request: { domain: 'example.test', database: 'us' },
        providerId: 'semrush-mcp',
        adapterVersion: 'pinned-revision',
      })
    ).resolves.toMatchObject({ status: 'provider-unavailable', message: 'provider unavailable' });
  });
});
