import { describe, expect, it, vi } from 'vitest';

import { ga4ReportRequestSchema, type GoogleAnalyticsReadProvider } from './google-analytics.js';
import { collectGa4Report, GoogleAnalyticsRestProvider, ga4QualityFlags } from './rest-provider.js';

const request = ga4ReportRequestSchema.parse({
  property: 'properties/123',
  dateRanges: [{ startDate: '2026-08-01', endDate: '2026-08-31' }],
  dimensions: [{ name: 'landingPage' }],
  metrics: [{ name: 'sessions' }],
  limit: 1,
});
const row = { dimensionValues: [{ value: '/example' }], metricValues: [{ value: '1' }] };
const page = {
  dimensionHeaders: [{ name: 'landingPage' }],
  metricHeaders: [{ name: 'sessions' }],
  rows: [row],
  rowCount: 2,
  metadata: { timeZone: 'America/Chicago' },
};
function provider(responses: unknown[]): GoogleAnalyticsReadProvider {
  return {
    getProperty: async () => ({ name: request.property }),
    runReport: async () => responses.shift(),
  };
}
describe('GA4 REST and pagination', () => {
  it('uses the correct GET and report POST without putting property in the body', async () => {
    const http = { request: vi.fn(async () => page) };
    const client = new GoogleAnalyticsRestProvider(http);
    await client.getProperty('properties/123');
    await client.runReport(request);
    expect(http.request).toHaveBeenNthCalledWith(
      1,
      'https://analyticsadmin.googleapis.com/v1beta/properties/123'
    );
    expect(http.request).toHaveBeenNthCalledWith(
      2,
      'https://analyticsdata.googleapis.com/v1beta/properties/123:runReport',
      expect.objectContaining({ limit: '1', offset: '0' })
    );
    await expect(client.getProperty('properties/../bad')).rejects.toThrow();
  });
  it('collects every page and retains source metadata', async () => {
    const result = await collectGa4Report(provider([page, page]), request, 3);
    expect(result.rows).toHaveLength(2);
    expect(result.metadata).toEqual(page.metadata);
    const empty = await collectGa4Report(provider([{ ...page, rows: [], rowCount: 0 }]), request);
    expect(empty.rows).toEqual([]);
  });
  it('fails on pagination gaps, changed source shape, and limits', async () => {
    await expect(collectGa4Report(provider([]), request, 0)).rejects.toThrow(/positive/);
    await expect(
      collectGa4Report(provider([{ ...page, rowCount: undefined }]), request)
    ).rejects.toThrow(/rowCount/);
    await expect(
      collectGa4Report(provider([page, { ...page, rowCount: 3 }]), request)
    ).rejects.toThrow(/changed/);
    await expect(collectGa4Report(provider([{ ...page, rows: [] }]), request)).rejects.toThrow(
      /reconcile/
    );
    await expect(collectGa4Report(provider([page]), request, 1)).rejects.toThrow(/maxRows/);
    await expect(collectGa4Report(provider([{ ...page, rowCount: 0 }]), request)).rejects.toThrow(
      /reconcile/
    );
  });
  it.each([
    { subjectToThresholding: true },
    { dataLossFromOtherRow: true },
    { samplingMetadatas: [{ samplesReadCount: '1', samplingSpaceSize: '10' }] },
  ])('rejects quality flags under the strict default %j', async (metadata) => {
    await expect(collectGa4Report(provider([{ ...page, metadata }]), request)).rejects.toThrow(
      /quality flags/
    );
  });
  it('allows a caller-selected caveated read while retaining metadata and enforcing pagination', async () => {
    const flagged = { ...page, rowCount: 1, metadata: { subjectToThresholding: true } };
    const response = await collectGa4Report(provider([flagged]), request, 10, 'allow-with-caveats');
    expect(ga4QualityFlags(response)).toEqual(['subject_to_thresholding']);
    expect(response.metadata).toEqual(flagged.metadata);
    await expect(
      collectGa4Report(
        provider([
          { ...flagged, rowCount: 2 },
          { ...flagged, rows: [] },
        ]),
        request,
        10,
        'allow-with-caveats'
      )
    ).rejects.toThrow(/changed|reconcile/);
  });
});
