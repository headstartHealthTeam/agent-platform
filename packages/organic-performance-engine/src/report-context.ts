import { z } from 'zod';

import { normalizePath } from './analysis.js';

const sourceSchema = z
  .object({
    url: z.url(),
    revision: z.string().trim().min(1),
    retrievedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const datedWindow = z
  .object({ startDate: z.iso.date(), endDate: z.iso.date() })
  .strict()
  .refine((row) => row.startDate <= row.endDate, 'Evidence window is reversed');

/** Agent-verified classifications and evidence retain their own identity, separate from metrics. */
export const reportContextSchema = z
  .object({
    schemaVersion: z.literal('organic-report-context/v1'),
    publicHostname: z.string().min(1),
    reportWindow: datedWindow,
    editorial: z
      .object({
        version: z.string().min(1),
        sources: z.array(sourceSchema).min(1),
        mappingPolicy: z.string().trim().min(1),
        pillars: z.array(
          z
            .object({
              id: z.string().min(1),
              audience: z.enum(['families', 'bcbas', 'rbts']),
              label: z.string().min(1),
              sourceUrl: z.url(),
            })
            .strict()
        ),
        articles: z.array(
          z
            .object({
              path: z.string().startsWith('/'),
              title: z.string().min(1),
              audience: z.enum(['families', 'bcbas', 'rbts', 'shared_unassigned']),
              pillarId: z.string().nullable(),
              publishedOn: z.iso.date().nullable(),
              sourceUrl: z.url(),
              rationale: z.string().trim().min(1),
            })
            .strict()
        ),
      })
      .strict(),
    aiVisibility: z.discriminatedUnion('status', [
      z
        .object({
          status: z.literal('unavailable'),
          checkedAt: z.iso.datetime({ offset: true }),
          provider: z.string().min(1),
          reason: z.string().trim().min(1),
          evidence: z.array(sourceSchema).min(1),
        })
        .strict(),
      z
        .object({
          status: z.literal('available'),
          observations: z
            .array(
              z
                .object({
                  provider: z.string().min(1),
                  platform: z.string().min(1),
                  metric: z.string().min(1),
                  definition: z.string().min(1),
                  value: z.number().nonnegative(),
                  unit: z.string().min(1),
                  window: datedWindow,
                  coverage: z.string().min(1),
                  source: sourceSchema,
                })
                .strict()
            )
            .min(1),
        })
        .strict(),
    ]),
    highlightPaths: z.array(z.string().startsWith('/')).max(8),
    followUps: z
      .array(
        z
          .object({
            label: z.string().min(1),
            metric: z.string().min(1),
            value: z.number(),
            unit: z.string().min(1),
            window: datedWindow,
            source: sourceSchema,
            limitation: z.string().trim().min(1),
          })
          .strict()
      )
      .max(12),
    journeyAssessment: z
      .object({
        status: z.enum(['aggregate-only', 'verified-funnel']),
        explanation: z.string().trim().min(1),
        sources: z.array(sourceSchema).min(1),
        // Only an independently retained, same-population ordered funnel may supply these rows.
        steps: z.array(
          z
            .object({
              audience: z.string().min(1),
              step: z.string().min(1),
              population: z.string().min(1),
              count: z.number().int().nonnegative(),
              window: datedWindow,
              source: sourceSchema,
            })
            .strict()
        ),
      })
      .strict(),
  })
  .strict()
  .superRefine((context, refinement) => {
    const issue = (message: string): void => {
      refinement.addIssue({ code: 'custom', message });
    };
    const paths = context.editorial.articles.map((article) => article.path);
    if (new Set(paths).size !== paths.length) issue('Duplicate article paths');
    const ids = context.editorial.pillars.map((pillar) => pillar.id);
    if (new Set(ids).size !== ids.length) issue('Duplicate pillar identifiers');
    for (const article of context.editorial.articles) {
      if (normalizePath(article.path) !== article.path) issue('Article path must be normalized');
      const pillar = context.editorial.pillars.find((row) => row.id === article.pillarId);
      if (article.pillarId !== null && pillar?.audience !== article.audience)
        issue('Article pillar must belong to its audience');
    }
    if (new Set(context.highlightPaths).size !== context.highlightPaths.length)
      issue('Duplicate highlight paths');
    validateJourney(context.journeyAssessment, context.reportWindow, issue);
  });

export type ReportContext = z.infer<typeof reportContextSchema>;

function validateJourney(
  journey: ReportContext['journeyAssessment'],
  window: ReportContext['reportWindow'],
  issue: (message: string) => void
): void {
  if (journey.status === 'aggregate-only' && journey.steps.length)
    issue('Aggregate events cannot be rendered as funnel steps');
  if (journey.status === 'verified-funnel' && journey.steps.length < 2)
    issue('Verified funnel requires at least two retained steps');
  const previousSteps = new Map<string, number>();
  for (const step of journey.steps) {
    if (step.window.startDate !== window.startDate || step.window.endDate !== window.endDate)
      issue('Funnel steps must cover the reporting window');
    const key = `${step.audience}:${step.population}`;
    const prior = previousSteps.get(key);
    if (prior !== undefined && step.count > prior) issue('Ordered funnel counts cannot increase');
    previousSteps.set(key, step.count);
  }
}
