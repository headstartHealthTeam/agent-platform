import {
  capabilityPreflightResultSchema,
  capabilityRequirementSchema,
  type CapabilityPreflightResult,
  type CapabilityRequirement,
} from '@headstart-health/capability-contracts';
import { z } from 'zod';

export const GA4_REPORT_READ = 'google-analytics.ga4-report.read' as const;
export const GA4_PROPERTY_READ = 'google-analytics.property.read' as const;

const nameSchema = z.string().min(1).max(256);
const dateRangeSchema = z
  .object({ startDate: z.iso.date(), endDate: z.iso.date(), name: nameSchema.optional() })
  .strict()
  .refine((range) => range.startDate <= range.endDate, {
    message: 'startDate must be on or before endDate',
  });

export const ga4ReportRequestSchema = z
  .object({
    property: z.string().regex(/^properties\/\d+$/),
    dateRanges: z.array(dateRangeSchema).min(1).max(4),
    dimensions: z
      .array(z.object({ name: nameSchema }).strict())
      .max(9)
      .default([]),
    metrics: z
      .array(z.object({ name: nameSchema }).strict())
      .min(1)
      .max(10),
    dimensionFilter: z.unknown().optional(),
    metricFilter: z.unknown().optional(),
    limit: z.number().int().positive().max(250_000).default(100_000),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

const headerSchema = z.object({ name: nameSchema }).catchall(z.unknown());
const valueSchema = z.object({ value: z.string() }).catchall(z.unknown());
export const ga4ReportResponseSchema = z
  .object({
    dimensionHeaders: z.array(headerSchema).default([]),
    metricHeaders: z.array(headerSchema).default([]),
    rows: z
      .array(
        z
          .object({
            dimensionValues: z.array(valueSchema).default([]),
            metricValues: z.array(valueSchema).default([]),
          })
          .catchall(z.unknown())
      )
      .default([]),
    rowCount: z.number().int().min(0).optional(),
    metadata: z
      .object({ timeZone: z.string().min(1).optional(), currencyCode: z.string().optional() })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown());

export type Ga4ReportRequest = z.infer<typeof ga4ReportRequestSchema>;
export type Ga4ReportResponse = z.infer<typeof ga4ReportResponseSchema>;
export interface NormalizedGa4Row {
  readonly dimensions: Readonly<Record<string, string>>;
  readonly metrics: Readonly<Record<string, string>>;
}

export interface GoogleAnalyticsReadProvider {
  runReport(request: Ga4ReportRequest): Promise<unknown>;
  getProperty(property: string): Promise<unknown>;
}

export class GoogleAnalyticsDataError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GoogleAnalyticsDataError';
  }
}

function zipValues(
  headers: readonly z.infer<typeof headerSchema>[],
  values: readonly z.infer<typeof valueSchema>[],
  context: string
): Readonly<Record<string, string>> {
  if (headers.length !== values.length) {
    throw new GoogleAnalyticsDataError(`${context} header and value counts do not match`);
  }
  return Object.fromEntries(
    headers.map((header, index) => {
      const value = values.at(index);
      if (value === undefined) {
        throw new GoogleAnalyticsDataError(`${context} is missing value ${String(index)}`);
      }
      return [header.name, value.value];
    })
  );
}

export function normalizeGa4Report(responseInput: unknown): readonly NormalizedGa4Row[] {
  const response = ga4ReportResponseSchema.parse(responseInput);
  return response.rows.map((row) => ({
    dimensions: zipValues(response.dimensionHeaders, row.dimensionValues, 'dimension'),
    metrics: zipValues(response.metricHeaders, row.metricValues, 'metric'),
  }));
}

export function ga4ReportRequirement(property: string): CapabilityRequirement {
  return capabilityRequirementSchema.parse({
    id: GA4_REPORT_READ,
    sideEffect: 'read',
    requiredPermissions: ['analytics.readonly'],
    targetAssertions: [{ key: 'property', expected: property }],
  });
}

export async function preflightGa4(
  provider: GoogleAnalyticsReadProvider,
  input: {
    readonly property: string;
    readonly providerId: string;
    readonly adapterVersion: string;
  }
): Promise<CapabilityPreflightResult> {
  try {
    const property = z
      .object({ name: z.string().min(1) })
      .catchall(z.unknown())
      .parse(await provider.getProperty(input.property));
    const ready = property.name === input.property;
    return capabilityPreflightResultSchema.parse({
      capabilityId: GA4_REPORT_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: ready ? 'ready' : 'wrong-target',
      permissions: ready ? ['analytics.readonly'] : [],
      targetIdentity: { property: property.name },
      message: ready
        ? 'verified accessible GA4 property'
        : 'provider returned another GA4 property',
    });
  } catch (error: unknown) {
    return capabilityPreflightResultSchema.parse({
      capabilityId: GA4_REPORT_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: 'unauthenticated',
      permissions: [],
      targetIdentity: { property: input.property },
      message: error instanceof Error ? error.message : 'GA4 preflight failed',
    });
  }
}

export async function runNormalizedGa4Report(
  provider: GoogleAnalyticsReadProvider,
  requestInput: z.input<typeof ga4ReportRequestSchema>
): Promise<readonly NormalizedGa4Row[]> {
  const request = ga4ReportRequestSchema.parse(requestInput);
  return normalizeGa4Report(await provider.runReport(request));
}
