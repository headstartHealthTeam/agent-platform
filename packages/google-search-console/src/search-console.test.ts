import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FetchSearchConsoleTransport,
  GcloudAppDefaultTokenProvider,
  SearchConsoleClient,
  SearchConsoleError,
  addSnapshotMetadata,
  buildSearchAnalyticsRequest,
  preflightSearchConsole,
  resolveSiteUrl,
  runPaginatedSearch,
  searchConsoleRequirement,
  type SearchConsoleTransport,
} from './search-console.js';

class FixtureTransport implements SearchConsoleTransport {
  readonly #responses: unknown[];

  public constructor(responses: unknown[]) {
    this.#responses = [...responses];
  }

  public async request(): Promise<unknown> {
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error('fixture exhausted');
    }
    return response;
  }
}

describe('Search Console adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates requests and paginates without mutating the base request', async () => {
    const request = buildSearchAnalyticsRequest({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      dimensions: ['query'],
      rowLimit: 2,
    });
    const client = new SearchConsoleClient(
      new FixtureTransport([
        {
          rows: [{ keys: ['a'] }, { keys: ['b'] }, { keys: ['c'] }],
          responseAggregationType: 'byProperty',
        },
      ])
    );
    const result = await runPaginatedSearch(client, 'sc-domain:example.test', request, {
      allPages: true,
      maxRows: 3,
    });
    expect(result['rowCount']).toBe(3);
    expect(result['pagination']).toEqual({ pagesRequested: 1, truncatedAtMaxRows: true });
    expect(request.startRow).toBe(0);

    const exhausted = await runPaginatedSearch(
      new SearchConsoleClient(new FixtureTransport([{ rows: [{ keys: ['a'] }] }])),
      'sc-domain:example.test',
      request,
      { allPages: true, maxRows: 3 }
    );
    expect(exhausted['pagination']).toEqual({
      pagesRequested: 1,
      truncatedAtMaxRows: false,
    });
  });

  it('selects one verified site and rejects ambiguous properties', async () => {
    const one = new SearchConsoleClient(
      new FixtureTransport([
        {
          siteEntry: [{ siteUrl: 'sc-domain:example.test', permissionLevel: 'siteOwner' }],
        },
      ])
    );
    await expect(resolveSiteUrl(one)).resolves.toBe('sc-domain:example.test');

    const many = new SearchConsoleClient(
      new FixtureTransport([
        {
          siteEntry: [
            { siteUrl: 'sc-domain:a.test', permissionLevel: 'siteOwner' },
            { siteUrl: 'sc-domain:b.test', permissionLevel: 'siteOwner' },
          ],
        },
      ])
    );
    await expect(resolveSiteUrl(many)).rejects.toThrow(SearchConsoleError);

    const none = new SearchConsoleClient(
      new FixtureTransport([
        {
          siteEntry: [
            {
              siteUrl: 'sc-domain:unverified.test',
              permissionLevel: 'siteUnverifiedUser',
            },
          ],
        },
      ])
    );
    await expect(resolveSiteUrl(none)).rejects.toThrow(/no verified/);
    await expect(resolveSiteUrl(one, 'sc-domain:explicit.test')).resolves.toBe(
      'sc-domain:explicit.test'
    );
  });

  it('adds stable snapshot provenance and rejects invalid combinations', () => {
    expect(addSnapshotMetadata({}, new Date('2026-09-09T12:34:56.789Z'))['_snapshot']).toEqual({
      schemaVersion: 'gsc-report-snapshot/v1',
      extractedAt: '2026-09-09T12:34:56Z',
    });
    expect(() =>
      buildSearchAnalyticsRequest({
        startDate: '2026-08-31',
        endDate: '2026-08-01',
        dimensions: ['hour'],
      })
    ).toThrow();
    expect(() =>
      buildSearchAnalyticsRequest({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        dimensions: ['query', 'query'],
      })
    ).toThrow(/duplicates/);
    expect(() => addSnapshotMetadata({}, new Date('invalid'))).toThrow(/valid/);
  });

  it('supports bounded single-page and sitemap reads', async () => {
    const request = buildSearchAnalyticsRequest({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    const result = await runPaginatedSearch(
      new SearchConsoleClient(new FixtureTransport([{ rows: [{ clicks: 1 }] }])),
      'sc-domain:example.test',
      request,
      { allPages: false, maxRows: 10 }
    );
    expect(result['rowCount']).toBe(1);
    await expect(
      new SearchConsoleClient(new FixtureTransport([{ sitemap: [] }])).listSitemaps(
        'sc-domain:example.test'
      )
    ).resolves.toEqual({ sitemap: [] });
    await expect(
      runPaginatedSearch(
        new SearchConsoleClient(new FixtureTransport([])),
        'sc-domain:example.test',
        request,
        { allPages: true, maxRows: 0 }
      )
    ).rejects.toThrow(/positive integer/);
  });

  it('preflights exact properties and returns sanitized failures', async () => {
    expect(searchConsoleRequirement('sc-domain:example.test').targetAssertions).toEqual([
      { key: 'siteUrl', expected: 'sc-domain:example.test' },
    ]);
    const ready = await preflightSearchConsole(
      new SearchConsoleClient(
        new FixtureTransport([
          {
            siteEntry: [{ siteUrl: 'sc-domain:example.test', permissionLevel: 'siteOwner' }],
          },
        ])
      ),
      {
        siteUrl: 'sc-domain:example.test',
        providerId: 'gsc-api',
        adapterVersion: 'fixture-v1',
      }
    );
    expect(ready.status).toBe('ready');

    const wrong = await preflightSearchConsole(
      new SearchConsoleClient(new FixtureTransport([{ siteEntry: [] }])),
      {
        siteUrl: 'sc-domain:example.test',
        providerId: 'gsc-api',
        adapterVersion: 'fixture-v1',
      }
    );
    expect(wrong.status).toBe('wrong-target');

    const failed = await preflightSearchConsole(new SearchConsoleClient(new FixtureTransport([])), {
      siteUrl: 'sc-domain:example.test',
      providerId: 'gsc-api',
      adapterVersion: 'fixture-v1',
    });
    expect(failed.status).toBe('unauthenticated');
  });

  it('uses injected ADC token commands and handles empty or failed tokens', async () => {
    await expect(
      new GcloudAppDefaultTokenProvider({
        run: async (): Promise<{ readonly stdout: string }> => ({
          stdout: 'fixture-token\n',
        }),
      }).getAccessToken()
    ).resolves.toBe('fixture-token');
    await expect(
      new GcloudAppDefaultTokenProvider({
        run: async (): Promise<{ readonly stdout: string }> => ({ stdout: '' }),
      }).getAccessToken()
    ).rejects.toThrow(/ADC is unavailable/);
    await expect(
      new GcloudAppDefaultTokenProvider({
        run: async (): Promise<{ readonly stdout: string }> => {
          throw new Error('gcloud failed');
        },
      }).getAccessToken()
    ).rejects.toThrow(/ADC is unavailable/);
  });

  it('performs authenticated JSON transport reads and reports safe HTTP errors', async () => {
    const tokenProvider = { getAccessToken: async (): Promise<string> => 'fixture-token' };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ siteEntry: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );
    const transport = new FetchSearchConsoleTransport(tokenProvider);
    await expect(transport.request('GET', '/sites')).resolves.toEqual({ siteEntry: [] });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'denied' } }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );
    await expect(
      transport.request('POST', '/sites/example/searchAnalytics/query', { a: 1 })
    ).rejects.toThrow(/HTTP 403/);
    await expect(transport.request('POST', '/sites')).rejects.toThrow(/do not agree/);
    await expect(transport.request('POST', '/sites/example/sitemaps', {})).rejects.toThrow(
      /allowlist/
    );
  });
});
