import { describe, expect, it } from 'vitest';

import {
  GoogleAnalyticsDataError,
  ga4ReportRequirement,
  normalizeGa4Report,
  preflightGa4,
  runNormalizedGa4Report,
  type GoogleAnalyticsReadProvider,
} from './google-analytics.js';

class FixtureProvider implements GoogleAnalyticsReadProvider {
  public async getProperty(property: string): Promise<unknown> {
    return { name: property, displayName: 'Fixture' };
  }

  public async runReport(): Promise<unknown> {
    return {
      dimensionHeaders: [{ name: 'landingPage' }],
      metricHeaders: [{ name: 'sessions' }],
      rows: [{ dimensionValues: [{ value: '/' }], metricValues: [{ value: '510' }] }],
      rowCount: 1,
    };
  }
}

describe('GA4 data adapter', () => {
  it('normalizes tabular Data API responses', async () => {
    const rows = await runNormalizedGa4Report(new FixtureProvider(), {
      property: 'properties/123',
      dateRanges: [{ startDate: '2026-08-01', endDate: '2026-08-31' }],
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }],
    });
    expect(rows).toEqual([{ dimensions: { landingPage: '/' }, metrics: { sessions: '510' } }]);
  });

  it('fails when provider headers and values diverge', () => {
    expect(() =>
      normalizeGa4Report({
        dimensionHeaders: [{ name: 'landingPage' }],
        metricHeaders: [],
        rows: [{ dimensionValues: [], metricValues: [] }],
      })
    ).toThrow(GoogleAnalyticsDataError);
  });

  it('verifies the exact property in capability evidence', async () => {
    expect(ga4ReportRequirement('properties/123').targetAssertions).toEqual([
      { key: 'property', expected: 'properties/123' },
    ]);
    const result = await preflightGa4(new FixtureProvider(), {
      property: 'properties/123',
      providerId: 'google-analytics-mcp',
      adapterVersion: 'fixture-v1',
    });
    expect(result.status).toBe('ready');
  });

  it('fails preflight closed for mismatched and unavailable properties', async () => {
    const mismatch: GoogleAnalyticsReadProvider = {
      getProperty: async () => ({ name: 'properties/999' }),
      runReport: async () => ({ rows: [] }),
    };
    await expect(
      preflightGa4(mismatch, {
        property: 'properties/123',
        providerId: 'google-analytics-mcp',
        adapterVersion: 'fixture-v1',
      })
    ).resolves.toMatchObject({ status: 'wrong-target' });

    const unavailable: GoogleAnalyticsReadProvider = {
      getProperty: async () => {
        throw new Error('not authenticated');
      },
      runReport: async () => ({ rows: [] }),
    };
    await expect(
      preflightGa4(unavailable, {
        property: 'properties/123',
        providerId: 'google-analytics-mcp',
        adapterVersion: 'fixture-v1',
      })
    ).resolves.toMatchObject({ status: 'unauthenticated', message: 'not authenticated' });
  });
});
