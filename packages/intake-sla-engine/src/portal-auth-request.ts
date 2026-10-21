import type { IdentityValue } from './provider-identity-types.js';
import { normalizeRosterValue } from './roster-matching.js';

interface PortalRequestPerson {
  readonly name?: unknown;
  readonly firstName?: unknown;
  readonly lastName?: unknown;
}
export interface PortalAuthRequestRecord {
  readonly opportunityId?: string | null | undefined;
  readonly clientOpportunityId?: string | null | undefined;
  readonly clientName?: unknown;
  readonly alohaAbaClientAlias?: unknown;
  readonly providerName?: unknown;
  readonly client?: PortalRequestPerson | null | undefined;
  readonly provider?: PortalRequestPerson | null | undefined;
  readonly authType?: unknown;
  readonly type?: unknown;
  readonly authorizationType?: unknown;
  readonly requestNumber?: string | number | null | undefined;
  readonly friendlyId?: string | number | null | undefined;
  readonly Id?: string | number | null | undefined;
  readonly submittedAt?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
}
export interface PortalAuthRequestIdentity {
  readonly opportunityId: string;
  readonly opportunityName?: IdentityValue;
  readonly clientAliases?: readonly IdentityValue[] | null | undefined;
  readonly knownNameVariants?: readonly IdentityValue[] | null | undefined;
  readonly providerIdentity?:
    { readonly names?: readonly IdentityValue[] | null | undefined } | null | undefined;
}
interface NormalizedPortalMatch {
  readonly opportunityId: string;
  readonly clientName: string;
  readonly providerName: string;
  readonly authType: string;
  readonly requestNumber: string | number | null | undefined;
  readonly submittedAt: string | null | undefined;
  readonly matchQuality: 'Direct';
  readonly matchReason: string;
}
export type MatchedPortalAuthRequest<T extends PortalAuthRequestRecord = PortalAuthRequestRecord> =
  {
    readonly [K in keyof T as K extends keyof NormalizedPortalMatch ? never : K]: T[K];
  } & NormalizedPortalMatch;
export interface UnmatchedPortalAuthRequest {
  readonly requestNumber: string | number | null | undefined;
  readonly clientName: string;
  readonly providerName: string;
  readonly authType: string;
  readonly reason: 'Ambiguous Opportunity match' | 'No Opportunity match';
}
function text(value: unknown): string {
  switch (typeof value) {
    case 'undefined':
    case 'object':
      return '';
    case 'function':
      return value.toString().trim();
    case 'string':
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'symbol':
      return String(value).trim();
  }
}
function firstTruthy<T>(values: readonly T[]): T | undefined {
  return values.find(Boolean) ?? values.at(-1);
}
export function portalAuthRequestClientName(record: PortalAuthRequestRecord = {}): string {
  return text(
    firstTruthy([
      record.clientName,
      record.alohaAbaClientAlias,
      record.client?.name,
      [record.client?.firstName, record.client?.lastName].filter(Boolean).join(' '),
    ])
  );
}
export function portalAuthRequestProviderName(record: PortalAuthRequestRecord = {}): string {
  return text(
    firstTruthy([
      record.providerName,
      record.provider?.name,
      [record.provider?.firstName, record.provider?.lastName].filter(Boolean).join(' '),
    ])
  );
}
export function portalAuthRequestType(record: PortalAuthRequestRecord = {}): string {
  return text(firstTruthy([record.authType, record.type, record.authorizationType]));
}
function candidatesFor(
  profiles: readonly PortalAuthRequestIdentity[],
  explicitOpportunityId: string,
  clientName: string,
  providerName: string
): PortalAuthRequestIdentity[] {
  let candidates = explicitOpportunityId
    ? profiles.filter((profile) => profile.opportunityId === explicitOpportunityId)
    : profiles.filter((profile) => {
        const names = [
          profile.opportunityName,
          ...(profile.clientAliases ?? []),
          ...(profile.knownNameVariants ?? []),
        ]
          .map(normalizeRosterValue)
          .filter(Boolean);
        return Boolean(clientName) && names.includes(clientName);
      });
  if (candidates.length > 1 && providerName) {
    const providers = candidates.filter((profile) =>
      (profile.providerIdentity?.names ?? []).map(normalizeRosterValue).includes(providerName)
    );
    if (providers.length === 1) candidates = providers;
  }
  return candidates;
}
export function matchPortalAuthRequestsToOpportunities<T extends PortalAuthRequestRecord>(
  records: readonly T[] = [],
  profiles: readonly PortalAuthRequestIdentity[] = []
): {
  readonly byOpportunity: Map<string, MatchedPortalAuthRequest<T>[]>;
  readonly unmatched: UnmatchedPortalAuthRequest[];
} {
  const byOpportunity = new Map<string, MatchedPortalAuthRequest<T>[]>();
  const unmatched: UnmatchedPortalAuthRequest[] = [];
  for (const record of records) {
    const explicitOpportunityId = text(
      firstTruthy([record.opportunityId, record.clientOpportunityId])
    );
    const clientName = normalizeRosterValue(portalAuthRequestClientName(record));
    const providerName = normalizeRosterValue(portalAuthRequestProviderName(record));
    const candidates = candidatesFor(profiles, explicitOpportunityId, clientName, providerName);
    const profile = candidates.at(0);
    if (candidates.length !== 1 || profile === undefined) {
      unmatched.push({
        requestNumber: firstTruthy([record.requestNumber, record.friendlyId, record.Id]),
        clientName: portalAuthRequestClientName(record),
        providerName: portalAuthRequestProviderName(record),
        authType: portalAuthRequestType(record),
        reason: candidates.length > 0 ? 'Ambiguous Opportunity match' : 'No Opportunity match',
      });
      continue;
    }
    const matched: MatchedPortalAuthRequest<T> = {
      ...record,
      opportunityId: profile.opportunityId,
      clientName: portalAuthRequestClientName(record),
      providerName: portalAuthRequestProviderName(record),
      authType: portalAuthRequestType(record),
      requestNumber: firstTruthy([record.requestNumber, record.friendlyId, record.Id]),
      submittedAt: firstTruthy([record.submittedAt, record.createdAt]),
      matchQuality: 'Direct',
      matchReason: explicitOpportunityId
        ? 'Portal request supplied the Salesforce Opportunity ID.'
        : providerName
          ? 'Exact client identity matched one Opportunity; provider identity was retained as corroborating context.'
          : 'Exact client identity matched one Opportunity.',
    };
    const previous = byOpportunity.get(profile.opportunityId) ?? [];
    previous.push(matched);
    byOpportunity.set(profile.opportunityId, previous);
  }
  return { byOpportunity, unmatched };
}
