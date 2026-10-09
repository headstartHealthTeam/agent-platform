import { z } from 'zod';

export const FIREFLIES_CACHE_VERSION = '2026-09-10.1';
export const FIREFLIES_DISCOVERY_ADAPTER_VERSION = '2026-09-11.1';
export class FirefliesCacheError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FirefliesCacheError';
    this.code = code;
  }
}
export function requireCacheValue(
  condition: boolean,
  message: string,
  code = 'CACHE_VALIDATION_FAILED'
): asserts condition {
  if (!condition) throw new FirefliesCacheError(code, message);
}
export function cacheTimestamp(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  requireCacheValue(Number.isFinite(parsed), 'Cache input requires an explicit valid timestamp');
  return parsed;
}
const interval = z.number().nonnegative();
export const firefliesCachePolicySchema = z.looseObject({
  version: z.literal(FIREFLIES_CACHE_VERSION),
  stabilizationHours: interval,
  maxValidationAgeHours: interval,
  fullRevalidationHours: interval.positive(),
  approvalReference: z.unknown().optional(),
});
export type FirefliesCachePolicy = z.infer<typeof firefliesCachePolicySchema>;
export function validateCachePolicy(policy: unknown): FirefliesCachePolicy {
  const parsed = firefliesCachePolicySchema.safeParse(policy);
  requireCacheValue(parsed.success, 'Unsupported or invalid Fireflies cache policy');
  return parsed.data;
}
export interface FirefliesCollectionWindow {
  readonly fromDate: unknown;
  readonly toDate: unknown;
}
export const firefliesDiscoverySchema = z.looseObject({
  version: z.literal(FIREFLIES_CACHE_VERSION),
  runId: z.string().min(1),
  asOf: z.string(),
  collectionPlanHash: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  scope: z.looseObject({
    provider: z.literal('fireflies'),
    principalId: z.string().min(1),
    workspaceId: z.string().min(1),
  }),
  accessVerified: z.literal(true),
  query: z.strictObject({
    kind: z.literal('all-accessible-transcripts'),
    fromDate: z.string(),
    toDate: z.string(),
    limit: z.literal(50),
  }),
  pages: z.array(z.unknown()),
  normalization: z.unknown().optional(),
});
export type FirefliesDiscovery = z.infer<typeof firefliesDiscoverySchema>;
