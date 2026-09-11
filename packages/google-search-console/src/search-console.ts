import {
  capabilityPreflightResultSchema,
  capabilityRequirementSchema,
  type CapabilityPreflightResult,
  type CapabilityRequirement,
} from '@headstart-health/capability-contracts';
import {
  GcloudReadTokenProvider,
  GoogleReadTransport,
} from '@headstart-health/google-read-transport';
import { z } from 'zod';

const API_BASE = 'https://www.googleapis.com/webmasters/v3';
const MAX_PAGE_SIZE = 25_000;

export const SEARCH_CONSOLE_PERFORMANCE_READ = 'google-search-console.performance.read' as const;
export const SEARCH_CONSOLE_SITES_READ = 'google-search-console.sites.read' as const;
export const SEARCH_CONSOLE_SITEMAPS_READ = 'google-search-console.sitemaps.read' as const;

const dimensionSchema = z.enum([
  'country',
  'date',
  'device',
  'hour',
  'page',
  'query',
  'searchAppearance',
]);
const operatorSchema = z.enum([
  'contains',
  'equals',
  'excludingRegex',
  'includingRegex',
  'notContains',
  'notEquals',
]);
const filterSchema = z
  .object({
    dimension: dimensionSchema,
    operator: operatorSchema,
    expression: z.string().min(1),
  })
  .strict();

export const searchAnalyticsRequestSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    type: z.enum(['discover', 'googleNews', 'image', 'news', 'video', 'web']).default('web'),
    dataState: z.enum(['all', 'final', 'hourly_all']).default('final'),
    rowLimit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(MAX_PAGE_SIZE),
    startRow: z.number().int().min(0).default(0),
    aggregationType: z.enum(['auto', 'byPage', 'byProperty']).default('auto'),
    dimensions: z.array(dimensionSchema).default([]),
    dimensionFilterGroups: z
      .array(z.object({ groupType: z.literal('and'), filters: z.array(filterSchema) }).strict())
      .default([]),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.startDate > request.endDate) {
      context.addIssue({ code: 'custom', message: 'startDate must be on or before endDate' });
    }
    if (new Set(request.dimensions).size !== request.dimensions.length) {
      context.addIssue({ code: 'custom', message: 'dimensions must not contain duplicates' });
    }
    if (request.dimensions.includes('hour') && request.dataState !== 'hourly_all') {
      context.addIssue({
        code: 'custom',
        message: 'the hour dimension requires dataState hourly_all',
      });
    }
  });

const searchAnalyticsRowSchema = z
  .object({
    keys: z.array(z.string()).optional(),
    clicks: z.number().optional(),
    impressions: z.number().optional(),
    ctr: z.number().optional(),
    position: z.number().optional(),
  })
  .catchall(z.unknown());

const searchAnalyticsResponseSchema = z
  .object({ rows: z.array(searchAnalyticsRowSchema).default([]) })
  .catchall(z.unknown());

const sitesResponseSchema = z
  .object({
    siteEntry: z
      .array(
        z
          .object({ siteUrl: z.string().min(1), permissionLevel: z.string().min(1) })
          .catchall(z.unknown())
      )
      .default([]),
  })
  .catchall(z.unknown());

export type SearchAnalyticsRequest = z.infer<typeof searchAnalyticsRequestSchema>;
export type SearchAnalyticsResponse = z.infer<typeof searchAnalyticsResponseSchema>;
export type SitesResponse = z.infer<typeof sitesResponseSchema>;

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface GcloudCommandRunner {
  run(command: string, arguments_: readonly string[]): Promise<{ readonly stdout: string }>;
}

export interface SearchConsoleTransport {
  request(
    method: 'GET' | 'POST',
    path: string,
    body?: Readonly<Record<string, unknown>>
  ): Promise<unknown>;
}

export class SearchConsoleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SearchConsoleError';
  }
}

export class GcloudAppDefaultTokenProvider extends GcloudReadTokenProvider {
  public constructor(runner?: GcloudCommandRunner) {
    super(
      runner === undefined
        ? undefined
        : async (): Promise<string> => {
            const result = await runner.run('gcloud', [
              'auth',
              'application-default',
              'print-access-token',
            ]);
            return result.stdout;
          }
    );
  }
}

export class FetchSearchConsoleTransport implements SearchConsoleTransport {
  readonly #http: GoogleReadTransport;

  public constructor(tokenProvider: AccessTokenProvider) {
    this.#http = new GoogleReadTransport(tokenProvider);
  }

  public async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Readonly<Record<string, unknown>>
  ): Promise<unknown> {
    if ((method === 'POST') !== (body !== undefined))
      throw new SearchConsoleError('Search Console method and body do not agree');
    return this.#http.request(`${API_BASE}${path}`, body);
  }
}

export class SearchConsoleClient {
  readonly #transport: SearchConsoleTransport;

  public constructor(transport: SearchConsoleTransport) {
    this.#transport = transport;
  }

  public async listSites(): Promise<SitesResponse> {
    return sitesResponseSchema.parse(await this.#transport.request('GET', '/sites'));
  }

  public async listSitemaps(siteUrl: string): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.#transport.request(
      'GET',
      `/sites/${encodeURIComponent(siteUrl)}/sitemaps`
    );
    return z.record(z.string(), z.unknown()).parse(result);
  }

  public async searchAnalytics(
    siteUrl: string,
    requestInput: SearchAnalyticsRequest
  ): Promise<SearchAnalyticsResponse> {
    const request = searchAnalyticsRequestSchema.parse(requestInput);
    const response = searchAnalyticsResponseSchema.parse(
      await this.#transport.request(
        'POST',
        `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        request
      )
    );
    if (response.rows.length > request.rowLimit)
      throw new SearchConsoleError('Search Console response exceeds the requested rowLimit');
    return response;
  }
}

export function buildSearchAnalyticsRequest(input: unknown): SearchAnalyticsRequest {
  return searchAnalyticsRequestSchema.parse(input);
}

export async function resolveSiteUrl(
  client: SearchConsoleClient,
  requestedSiteUrl?: string
): Promise<string> {
  if (requestedSiteUrl !== undefined && requestedSiteUrl.length > 0) {
    return requestedSiteUrl;
  }
  const payload = await client.listSites();
  const verified = payload.siteEntry
    .filter((entry) => entry.permissionLevel !== 'siteUnverifiedUser')
    .map((entry) => entry.siteUrl);
  if (verified.length === 1) {
    const siteUrl = verified[0];
    if (siteUrl !== undefined) {
      return siteUrl;
    }
  }
  if (verified.length === 0) {
    throw new SearchConsoleError('no verified Search Console properties are available');
  }
  throw new SearchConsoleError(
    'multiple Search Console properties are available; select one explicitly'
  );
}

export interface PaginatedSearchOptions {
  readonly allPages: boolean;
  readonly maxRows: number;
}

export async function runPaginatedSearch(
  client: SearchConsoleClient,
  siteUrl: string,
  requestInput: SearchAnalyticsRequest,
  options: PaginatedSearchOptions
): Promise<Readonly<Record<string, unknown>>> {
  if (!Number.isInteger(options.maxRows) || options.maxRows < 1) {
    throw new SearchConsoleError('maxRows must be a positive integer');
  }
  const request = searchAnalyticsRequestSchema.parse(requestInput);
  if (!options.allPages) {
    const boundedRequest = { ...request, rowLimit: Math.min(request.rowLimit, options.maxRows) };
    const response = await client.searchAnalytics(siteUrl, boundedRequest);
    return { ...response, rowCount: response.rows.length, siteUrl, request: boundedRequest };
  }

  const rows: z.infer<typeof searchAnalyticsRowSchema>[] = [];
  let startRow = request.startRow;
  let pagesRequested = 0;
  let responseMetadata: Readonly<Record<string, unknown>> = {};
  while (rows.length < options.maxRows) {
    const batchLimit = Math.min(request.rowLimit, options.maxRows - rows.length);
    const pageRequest = { ...request, rowLimit: batchLimit, startRow };
    const response = await client.searchAnalytics(siteUrl, pageRequest);
    pagesRequested += 1;
    if (pagesRequested === 1) {
      responseMetadata = Object.fromEntries(
        Object.entries(response).filter(([key]) => key !== 'rows')
      );
    }
    rows.push(...response.rows);
    if (response.rows.length < batchLimit) {
      break;
    }
    startRow += response.rows.length;
  }
  return {
    ...responseMetadata,
    siteUrl,
    request: { ...request, startRow: request.startRow, maxRows: options.maxRows },
    rows,
    rowCount: rows.length,
    pagination: {
      pagesRequested,
      truncatedAtMaxRows: rows.length >= options.maxRows,
    },
  };
}

export function searchConsoleRequirement(siteUrl: string): CapabilityRequirement {
  return capabilityRequirementSchema.parse({
    id: SEARCH_CONSOLE_PERFORMANCE_READ,
    sideEffect: 'read',
    requiredPermissions: ['webmasters.readonly'],
    targetAssertions: [{ key: 'siteUrl', expected: siteUrl }],
  });
}

export async function preflightSearchConsole(
  client: SearchConsoleClient,
  input: {
    readonly siteUrl: string;
    readonly providerId: string;
    readonly adapterVersion: string;
  }
): Promise<CapabilityPreflightResult> {
  try {
    const sites = await client.listSites();
    const entry = sites.siteEntry.find((candidate) => candidate.siteUrl === input.siteUrl);
    const ready = entry !== undefined && entry.permissionLevel !== 'siteUnverifiedUser';
    return capabilityPreflightResultSchema.parse({
      capabilityId: SEARCH_CONSOLE_PERFORMANCE_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: ready ? 'ready' : 'wrong-target',
      permissions: ready ? ['webmasters.readonly'] : [],
      targetIdentity: { siteUrl: input.siteUrl },
      message: ready
        ? 'verified accessible Search Console property'
        : 'property is not verified or accessible',
    });
  } catch {
    return capabilityPreflightResultSchema.parse({
      capabilityId: SEARCH_CONSOLE_PERFORMANCE_READ,
      providerId: input.providerId,
      adapterVersion: input.adapterVersion,
      status: 'provider-unavailable',
      permissions: [],
      targetIdentity: { siteUrl: input.siteUrl },
      message:
        'Search Console provider readiness could not be verified; authentication failure is not established',
    });
  }
}

export function addSnapshotMetadata(
  result: Readonly<Record<string, unknown>>,
  extractedAt = new Date()
): Readonly<Record<string, unknown>> {
  if (Number.isNaN(extractedAt.getTime())) {
    throw new SearchConsoleError('snapshot extraction time must be valid');
  }
  return {
    ...result,
    _snapshot: {
      schemaVersion: 'gsc-report-snapshot/v1',
      extractedAt: extractedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
  };
}
