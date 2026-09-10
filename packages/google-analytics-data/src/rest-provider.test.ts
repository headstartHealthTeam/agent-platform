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
    const next = { ...row, dimensionValues: [{ value: '/next' }] };
    const result = await collectGa4Report(provider([page, { ...page, rows: [next] }]), request, 3);
    expect(result.rows).toHaveLength(2);
    expect(result.metadata).toEqual(page.metadata);
    const empty = await collectGa4Report(provider([{ ...page, rows: [], rowCount: 0 }]), request);
    expect(empty.rows).toEqual([]);
  });
  it('rejects repeated keys across pages even when row counts and metrics appear valid', async () => {
    const changedMetric = { ...row, metricValues: [{ value: '99' }] };
    await expect(
      collectGa4Report(provider([page, { ...page, rows: [changedMetric] }]), request)
    ).rejects.toThrow(/duplicate dimension keys/);
    await expect(
      collectGa4Report(provider([{ ...page, rows: [row, row] }]), { ...request, limit: 2 })
    ).rejects.toThrow(/duplicate dimension keys/);
  });
  it('compares the complete dimension tuple without delimiter collisions', async () => {
    const headers = [{ name: 'firstUserSource' }, { name: 'firstUserMedium' }];
    const rows = [
      { ...row, dimensionValues: [{ value: 'a|b' }, { value: 'c' }] },
      { ...row, dimensionValues: [{ value: 'a' }, { value: 'b|c' }] },
    ];
    const result = await collectGa4Report(
      provider(rows.map((item) => ({ ...page, dimensionHeaders: headers, rows: [item] }))),
      { ...request, dimensions: headers }
    );
    expect(result.rows).toEqual(rows);
  });
  it('preserves the same dimension group in distinct date ranges', async () => {
    const headers = [...page.dimensionHeaders, { name: 'dateRange' }];
    const rows = ['date_range_0', 'date_range_1'].map((value) => ({
      ...row,
      dimensionValues: [...row.dimensionValues, { value }],
    }));
    const result = await collectGa4Report(
      provider(rows.map((item) => ({ ...page, dimensionHeaders: headers, rows: [item] }))),
      {
        ...request,
        dateRanges: [...request.dateRanges, { startDate: '2026-07-01', endDate: '2026-07-31' }],
      }
    );
    expect(result.rows).toEqual(rows);
  });
  it('retains a no-dimension total and rejects malformed dimension widths', async () => {
    const total = { ...row, dimensionValues: [] };
    const result = await collectGa4Report(
      provider([{ ...page, rows: [total], dimensionHeaders: [], rowCount: 1 }]),
      { ...request, dimensions: [] }
    );
    expect(result.rows).toEqual([total]);
    await expect(
      collectGa4Report(provider([{ ...page, rows: [total], rowCount: 1 }]), request)
    ).rejects.toThrow(/header and value counts/);
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
  it('rejects oversized pages before a matching rowCount can bypass request or total limits', async () => {
    const next = { ...row, dimensionValues: [{ value: '/next' }] };
    await expect(
      collectGa4Report(provider([{ ...page, rows: [row, next] }]), request, 10)
    ).rejects.toThrow(/requested page limit/);
    const third = { ...row, dimensionValues: [{ value: '/third' }] };
    const fourth = { ...row, dimensionValues: [{ value: '/fourth' }] };
    const runReport = vi
      .fn()
      .mockResolvedValueOnce({ ...page, rows: [row, next], rowCount: 4 })
      .mockResolvedValueOnce({ ...page, rows: [third, fourth], rowCount: 4 });
    await expect(
      collectGa4Report({ getProperty: async () => ({}), runReport }, { ...request, limit: 2 }, 3)
    ).rejects.toThrow(/requested page limit/);
    expect(runReport).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2, limit: 1 }));
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
