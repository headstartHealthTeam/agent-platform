import type { GoogleJsonReader } from '@headstart-health/google-read-transport';
import { z } from 'zod';

import {
  ga4ReportRequestSchema,
  ga4ReportResponseSchema,
  GoogleAnalyticsDataError,
  type Ga4ReportRequest,
  type GoogleAnalyticsReadProvider,
  type Ga4ReportResponse,
} from './google-analytics.js';

const propertySchema = z.string().regex(/^properties\/\d+$/);
export const GA4_QUALITY_FLAGS = [
  'subject_to_thresholding',
  'other_row_loss',
  'sampling_metadata_present',
] as const;
export type Ga4QualityFlag = (typeof GA4_QUALITY_FLAGS)[number];
export class GoogleAnalyticsRestProvider implements GoogleAnalyticsReadProvider {
  readonly #http: GoogleJsonReader;
  public constructor(http: GoogleJsonReader) {
    this.#http = http;
  }
  public async getProperty(property: string): Promise<unknown> {
    return this.#http.request(
      `https://analyticsadmin.googleapis.com/v1beta/${propertySchema.parse(property)}`
    );
  }
  public async runReport(input: Ga4ReportRequest): Promise<unknown> {
    const { property, ...body } = ga4ReportRequestSchema.parse(input);
    return this.#http.request(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
      ...body,
      limit: String(body.limit),
      offset: String(body.offset),
    });
  }
}

function rememberDistinctRows(page: Ga4ReportResponse, seen: Set<string>): void {
  for (const row of page.rows) {
    if (row.dimensionValues.length !== page.dimensionHeaders.length)
      throw new GoogleAnalyticsDataError('GA4 dimension header and value counts do not match');
    // The complete returned tuple includes GA4's automatic dateRange column for
    // multi-period requests. Distinct periods must never be mistaken for duplicate groups.
    const key = JSON.stringify(row.dimensionValues.map(({ value }) => value));
    if (seen.has(key))
      throw new GoogleAnalyticsDataError('GA4 pagination returned duplicate dimension keys');
    seen.add(key);
  }
}

export async function collectGa4Report(
  provider: GoogleAnalyticsReadProvider,
  input: z.input<typeof ga4ReportRequestSchema>,
  maxRows = 100_000,
  qualityPolicy: 'require-unflagged' | 'allow-with-caveats' = 'require-unflagged'
): Promise<Ga4ReportResponse> {
  const request = ga4ReportRequestSchema.parse(input);
  if (!Number.isSafeInteger(maxRows) || maxRows < 1)
    throw new GoogleAnalyticsDataError('maxRows must be a positive integer');
  const rows: Ga4ReportResponse['rows'] = [];
  const seen = new Set<string>();
  let first: Ga4ReportResponse | undefined;
  while (rows.length < maxRows) {
    const pageLimit = Math.min(request.limit, maxRows - rows.length);
    const page = ga4ReportResponseSchema.parse(
      await provider.runReport({
        ...request,
        offset: request.offset + rows.length,
        limit: pageLimit,
      })
    );
    if (page.rows.length > pageLimit)
      throw new GoogleAnalyticsDataError('GA4 response exceeds the requested page limit');
    if (page.rowCount === undefined)
      throw new GoogleAnalyticsDataError(
        'GA4 rowCount is required to verify extraction completeness'
      );
    if (qualityPolicy === 'require-unflagged' && ga4QualityFlags(page).length > 0)
      throw new GoogleAnalyticsDataError(
        'GA4 report has quality flags; selected policy requires unflagged evidence'
      );
    first ??= page;
    if (
      JSON.stringify([page.dimensionHeaders, page.metricHeaders, page.rowCount, page.metadata]) !==
      JSON.stringify([first.dimensionHeaders, first.metricHeaders, first.rowCount, first.metadata])
    )
      throw new GoogleAnalyticsDataError('GA4 report changed during pagination');
    rememberDistinctRows(page, seen);
    rows.push(...page.rows);
    if (rows.length + request.offset === page.rowCount) return { ...first, rows };
    if (page.rows.length === 0 || rows.length + request.offset > page.rowCount)
      throw new GoogleAnalyticsDataError('GA4 pagination does not reconcile to rowCount');
  }
  throw new GoogleAnalyticsDataError('GA4 report exceeds configured maxRows');
}

export function ga4QualityFlags(response: Ga4ReportResponse): readonly Ga4QualityFlag[] {
  const flags: Ga4QualityFlag[] = [];
  if (response.metadata?.['subjectToThresholding'] === true) flags.push('subject_to_thresholding');
  if (response.metadata?.['dataLossFromOtherRow'] === true) flags.push('other_row_loss');
  const sampling = response.metadata?.['samplingMetadatas'];
  if (Array.isArray(sampling) && sampling.length > 0) flags.push('sampling_metadata_present');
  return flags;
}
