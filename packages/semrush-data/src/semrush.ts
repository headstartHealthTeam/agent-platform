import {
  capabilityPreflightResultSchema,
  capabilityRequirementSchema,
  type CapabilityPreflightResult,
  type CapabilityRequirement,
} from '@headstart-health/capability-contracts';
import { z } from 'zod';

export const SEMRUSH_DOMAIN_ORGANIC_READ = 'semrush.domain-organic.read' as const;
export const SEMRUSH_KEYWORD_RESEARCH_READ = 'semrush.keyword-research.read' as const;
export const SEMRUSH_READ_OPERATIONS = [
  'domainOverview',
  'domainOrganicKeywords',
  'keywordOverview',
] as const;

const domainSchema = z
  .string()
  .min(1)
  .max(253)
  .transform((value) => value.toLowerCase().replace(/^www\./, ''));
const databaseSchema = z.string().regex(/^[a-z]{2,5}$/);
const deviceSchema = z.enum(['desktop', 'mobile']);

export const semrushDomainRequestSchema = z
  .object({
    domain: domainSchema,
    database: databaseSchema,
    device: deviceSchema.default('desktop'),
    snapshotDate: z
      .string()
      .regex(/^\d{8}$/)
      .optional(),
    limit: z.number().int().positive().max(100_000).default(10_000),
  })
  .strict();

export const semrushRankingSchema = z
  .object({
    keyword: z.string().min(1),
    position: z.coerce.number().positive(),
    searchVolume: z.coerce.number().min(0),
    url: z.url(),
  })
  .strict();

export const semrushDomainOverviewSchema = z
  .object({
    domain: domainSchema,
    database: databaseSchema,
    device: deviceSchema,
    rankingKeywords: z.coerce.number().int().min(0),
    snapshotDate: z.iso.date().optional(),
  })
  .strict();

export type SemrushDomainRequest = z.infer<typeof semrushDomainRequestSchema>;
export type SemrushRanking = z.infer<typeof semrushRankingSchema>;
export type SemrushDomainOverview = z.infer<typeof semrushDomainOverviewSchema>;

export interface SemrushReadProvider {
  domainOverview(request: SemrushDomainRequest): Promise<unknown>;
  domainOrganicKeywords(request: SemrushDomainRequest): Promise<unknown>;
  keywordOverview(input: {
    readonly keywords: readonly string[];
    readonly database: string;
  }): Promise<unknown>;
}

export function normalizeSemrushRankings(input: unknown): readonly SemrushRanking[] {
  return z.array(semrushRankingSchema).parse(input);
}

export async function readSemrushRankings(
  provider: SemrushReadProvider,
  requestInput: z.input<typeof semrushDomainRequestSchema>
): Promise<readonly SemrushRanking[]> {
  const request = semrushDomainRequestSchema.parse(requestInput);
  return normalizeSemrushRankings(await provider.domainOrganicKeywords(request));
}

export function semrushDomainRequirement(input: {
  readonly domain: string;
  readonly database: string;
  readonly device: 'desktop' | 'mobile';
}): CapabilityRequirement {
  const normalizedDomain = domainSchema.parse(input.domain);
  return capabilityRequirementSchema.parse({
    id: SEMRUSH_DOMAIN_ORGANIC_READ,
    sideEffect: 'read',
    requiredPermissions: ['domain-overview:read', 'domain-organic:read'],
    targetAssertions: [
      { key: 'domain', expected: normalizedDomain },
      { key: 'database', expected: input.database },
      { key: 'device', expected: input.device },
    ],
  });
}

export async function preflightSemrush(
  provider: SemrushReadProvider,
  input: {
    readonly request: z.input<typeof semrushDomainRequestSchema>;
    readonly providerId: string;
    readonly adapterVersion: string;
  }
): Promise<CapabilityPreflightResult> {
  const request = semrushDomainRequestSchema.parse(input.request);
  try {
    const overview = semrushDomainOverviewSchema.parse(await provider.domainOverview(request));
    const ready =
      overview.domain === request.domain &&
      overview.database === request.database &&
      overview.device === request.device;
    return capabilityPreflightResultSchema.parse({
      capabilityId: SEMRUSH_DOMAIN_ORGANIC_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: ready ? 'ready' : 'wrong-target',
      permissions: ready ? ['domain-overview:read', 'domain-organic:read'] : [],
      targetIdentity: {
        domain: overview.domain,
        database: overview.database,
        device: overview.device,
      },
      message: ready ? 'verified Semrush domain scope' : 'provider returned another domain scope',
    });
  } catch (error: unknown) {
    return capabilityPreflightResultSchema.parse({
      capabilityId: SEMRUSH_DOMAIN_ORGANIC_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: 'provider-unavailable',
      permissions: [],
      targetIdentity: {
        domain: request.domain,
        database: request.database,
        device: request.device,
      },
      message: error instanceof Error ? error.message : 'Semrush preflight failed',
    });
  }
}
