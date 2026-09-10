import { GA4_QUALITY_FLAGS } from '@headstart-health/google-analytics-data';
import { z } from 'zod';

export const periodIdSchema = z.enum(['current', 'previous', 'year_ago']);
export const comparisonPolicySchema = z
  .object({
    method: z.enum(['equal-length', 'calendar-months', 'custom']),
    rationale: z.string().trim().min(1),
  })
  .strict();
export const outcomeMeasurementSchema = z
  .object({
    hostname: z
      .string()
      .min(1)
      .max(253)
      .refine(
        (value) =>
          value
            .split('.')
            .every(
              (label) =>
                label.length > 0 &&
                label.length <= 63 &&
                /^[a-z0-9-]+$/.test(label) &&
                !label.startsWith('-') &&
                !label.endsWith('-')
            ),
        'Expected an exact lowercase hostname'
      ),
    metric: z.enum(['eventCount', 'keyEvents']),
    rationale: z.string().trim().min(1),
  })
  .strict();
export const qualityPolicySchema = z
  .object({
    mode: z.enum(['require-unflagged', 'allow-with-caveats']),
    rationale: z.string().trim().min(1),
  })
  .strict();
export const measurementLifecycleSchema = z
  .object({
    launchedOn: z.iso.date(),
    evidenceUrl: z.url(),
    comparisonPolicy: z.literal('complete-post-launch-months'),
  })
  .strict();
const finiteNumberSchema = z.number();
const periodSchema = z
  .object({
    id: periodIdSchema,
    label: z.string().min(1),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
  })
  .catchall(z.unknown());
const metadataBaseSchema = z
  .object({
    sourceId: z.string().min(1),
    extractedAt: z.iso.datetime({ offset: true }),
    complete: z.literal(true),
  })
  .catchall(z.unknown());
const periodMetricSchema = z
  .object({ period: periodIdSchema })
  .catchall(z.union([finiteNumberSchema, periodIdSchema]))
  .superRefine((row, context) => {
    for (const [key, value] of Object.entries(row)) {
      if (key !== 'period' && typeof value !== 'number')
        context.addIssue({ code: 'custom', message: 'Metric must be numeric', path: [key] });
    }
  });
export const routeRuleSchema = z
  .object({
    id: z.string().min(1),
    exactPaths: z.array(z.string()).default([]),
    prefixes: z.array(z.string()).default([]),
    lifecycle: measurementLifecycleSchema.optional(),
  })
  .strict();

const gscSchema = z
  .object({
    metadata: metadataBaseSchema.extend({
      filters: z.array(
        z
          .object({
            dimension: z.string(),
            operator: z.string(),
            expression: z.string(),
          })
          .strict()
      ),
    }),
    periodTotals: z.array(periodMetricSchema),
    nonBrandedTotals: z.array(periodMetricSchema),
    pageRows: z.array(
      z
        .object({
          period: periodIdSchema,
          url: z.string().min(1),
          clicks: finiteNumberSchema,
          impressions: finiteNumberSchema,
        })
        .strict()
    ),
    queryRows: z.array(
      z
        .object({
          period: periodIdSchema,
          query: z.string().min(1),
          clicks: finiteNumberSchema,
          impressions: finiteNumberSchema,
        })
        .strict()
    ),
  })
  .strict();

const ga4Schema = z
  .object({
    metadata: metadataBaseSchema.extend({
      timeZone: z.string().min(1),
      channelFilter: z.literal('sessionDefaultChannelGroup=Organic Search'),
      qualityIssues: z
        .array(
          z
            .object({
              period: periodIdSchema,
              view: z.string().min(1),
              flags: z.array(z.enum(GA4_QUALITY_FLAGS)).min(1),
            })
            .strict()
        )
        .optional(),
    }),
    periodTotals: z.array(periodMetricSchema),
    landingPageRows: z.array(
      z
        .object({
          period: periodIdSchema,
          landingPage: z.string().min(1),
          sessions: finiteNumberSchema,
          engagedSessions: finiteNumberSchema,
          keyEvents: finiteNumberSchema,
        })
        .strict()
    ),
    eventRows: z.array(
      z
        .object({
          period: periodIdSchema,
          eventName: z.string().min(1),
          keyEvents: finiteNumberSchema,
        })
        .strict()
    ),
    outcomeRows: z
      .array(
        z
          .object({
            audience: z.string().min(1),
            period: periodIdSchema,
            eventName: z.string().min(1),
            hostname: z.string().min(1),
            metric: z.enum(['eventCount', 'keyEvents']),
            value: z.number().nonnegative().nullable(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

const semrushSchema = z
  .object({
    metadata: metadataBaseSchema.extend({
      database: z.string().min(1),
      device: z.string().min(1),
    }),
    domainSnapshots: z.array(
      z
        .object({
          period: periodIdSchema,
          snapshotDate: z.iso.date(),
          rankingKeywords: finiteNumberSchema,
        })
        .strict()
    ),
    rankings: z.array(
      z
        .object({
          keyword: z.string().min(1),
          position: finiteNumberSchema.positive(),
          searchVolume: finiteNumberSchema.min(0),
          url: z.string().min(1),
        })
        .strict()
    ),
  })
  .strict();

const tamSchema = z
  .object({
    metadata: metadataBaseSchema.extend({
      sourceRevision: z.string().min(1),
      approvedAt: z.iso.date(),
    }),
    keywords: z.array(
      z
        .object({
          keyword: z.string().min(1),
          pillar: z.string().min(1),
          searchVolume: finiteNumberSchema.min(0),
          serviceability: z.enum(['confirmed', 'conditional']),
        })
        .strict()
    ),
  })
  .strict();

export const organicPerformanceBundleSchema = z
  .object({
    schemaVersion: z.literal('organic-performance-bundle/v1'),
    report: z
      .object({
        title: z.string().min(1),
        periods: z.array(periodSchema),
        comparisonPolicy: comparisonPolicySchema.optional(),
        unavailableComparisons: z
          .partialRecord(z.enum(['previous', 'year_ago']), z.string().trim().min(1))
          .optional(),
        omittedSources: z
          .partialRecord(z.enum(['semrush', 'tam']), z.string().trim().min(1))
          .optional(),
        qualityPolicy: qualityPolicySchema.optional(),
      })
      .catchall(z.unknown()),
    config: z
      .object({
        configVersion: z.string().min(1),
        publicHostname: z.string().min(1),
        unmatchedSegment: z.string().min(1),
        unmatchedAudience: z.string().min(1),
        routeRegistry: z.array(routeRuleSchema),
        audienceRegistry: z.array(routeRuleSchema),
        outcomeRegistry: z.array(
          z
            .object({
              audience: z.string().min(1),
              eventName: z.string().min(1).nullable(),
              measurement: outcomeMeasurementSchema.optional(),
              measurementLifecycle: measurementLifecycleSchema.optional(),
            })
            .strict()
        ),
      })
      .strict(),
    sources: z
      .object({
        gsc: gscSchema,
        ga4: ga4Schema,
        semrush: semrushSchema.optional(),
        tam: tamSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type OrganicPerformanceBundle = z.infer<typeof organicPerformanceBundleSchema>;
export type PeriodId = z.infer<typeof periodIdSchema>;
export type RouteRule = z.infer<typeof routeRuleSchema>;
