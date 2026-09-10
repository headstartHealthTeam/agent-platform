import { z } from 'zod';

import { sha256Json } from './analysis.js';
import { collectionPlanSchema, type CollectionPlan } from './collector.js';
import { routeRuleSchema } from './schemas.js';

export const cohortConfigSchema = z
  .object({
    schemaVersion: z.literal('organic-cohort-configuration/v1'),
    version: z.string().min(1),
    publicHostname: z.string().min(1),
    evidence: z.array(z.url()).min(1),
    routeRegistry: z.array(routeRuleSchema).min(1),
    audienceRegistry: z.array(routeRuleSchema).min(1),
    unmatchedSegment: z.string().min(1),
    unmatchedAudience: z.string().min(1),
  })
  .strict();

/** Explicit --cohorts selection replaces only classification, never periods, events, or sources. */
export function resolveCohortConfig(input: unknown, cohortInput: unknown): CollectionPlan {
  const plan = collectionPlanSchema.parse(input);
  const cohorts = cohortConfigSchema.parse(cohortInput);
  if (cohorts.publicHostname !== plan.config.publicHostname)
    throw new Error('Cohort hostname differs from collection scope');
  return collectionPlanSchema.parse({
    ...plan,
    config: {
      ...plan.config,
      configVersion: cohorts.version,
      routeRegistry: cohorts.routeRegistry,
      audienceRegistry: cohorts.audienceRegistry,
      unmatchedSegment: cohorts.unmatchedSegment,
      unmatchedAudience: cohorts.unmatchedAudience,
    },
    report: {
      ...plan.report,
      cohortConfiguration: {
        version: cohorts.version,
        sha256: sha256Json(cohorts),
        evidence: cohorts.evidence,
      },
    },
  });
}
