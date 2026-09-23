import { z } from 'zod';

import type { IdentityClusterArrays, ProviderIdentityInput } from './provider-identity-types.js';
import {
  identityValues,
  normalizeIdentityEmail,
  normalizeIdentityPhone,
  normalizeIdentityValue,
  PROVIDER_CLUSTER_ARRAY_FIELDS,
  uniqueIdentityValues,
} from './provider-identity-values.js';
import { buildProviderIdentityCluster, buildProviderRoleClusters } from './provider-identity.js';
import { firefliesClientSearchVariants, firefliesStageTerms } from './provider-search-terms.js';

export interface ProviderSearchInput extends ProviderIdentityInput {
  readonly opportunityName?: string | undefined;
  readonly knownNameVariants?: readonly string[] | null | undefined;
  readonly clientAliases?: readonly string[] | null | undefined;
  readonly stage?: string | null | undefined;
  readonly currentStage?: string | null | undefined;
  readonly authorizationNumbers?: readonly string[] | null | undefined;
  readonly payers?: readonly string[] | null | undefined;
  readonly rbtNames?: readonly string[] | null | undefined;
  readonly candidateNames?: readonly string[] | null | undefined;
  readonly providerRoster?:
    | readonly {
        readonly opportunityName?: string | null | undefined;
        readonly Name?: string | null | undefined;
      }[]
    | null
    | undefined;
  readonly practiceProviderRoster?:
    | readonly {
        readonly opportunityName?: string | null | undefined;
        readonly Name?: string | null | undefined;
      }[]
    | null
    | undefined;
}
const strings = z.array(z.string());
const clusterSchema = z.looseObject({
  salesforceIds: strings,
  names: strings,
  emails: strings,
  providerProfileEmails: strings,
  businessEmails: strings,
  contactEmails: strings,
  backendUserEmails: strings,
  firefliesParticipantEmails: strings,
  registryEmails: strings,
  phones: strings,
  practiceAliases: strings,
  meetingAliases: strings,
  portalProviderIds: strings,
  csmNames: strings,
  csmEmails: strings,
  role: z.string().nullish(),
  primaryName: z.string().nullish(),
  primaryEmail: z.string().nullish(),
  registryMatchCount: z.number().optional(),
});
type SearchCluster = z.infer<typeof clusterSchema>;
interface GroupedCluster extends SearchCluster {
  roles: string[];
}
export interface ProviderFirefliesSearchPlan {
  participantEmails: string[];
  participantEmailCandidates: { email: string; sources: string[] }[];
  titleTerms: string[];
  csmEmails: string[];
  csmNames: string[];
  identityDiscoveryOrder: string[];
  expansionRequiredWhen: string;
}
export interface FirefliesIdentityCoverage {
  status: 'Partial' | 'Complete';
  attemptedIdentityPaths: string[];
  missingIdentityPaths: string[];
}
export interface RoleFirefliesSearchPlan extends ProviderFirefliesSearchPlan {
  role: string;
  roles: string[];
  primaryName: string | null;
  clientSearchTerms: string[];
  rosterOpportunityNames: string[];
  stageTerms: string[];
  transcriptSearchTerms: string[];
  coverage: FirefliesIdentityCoverage;
  requiredSearchPhases: string[];
}
function emailSources(cluster: IdentityClusterArrays, email: string): string[] {
  return [
    cluster.firefliesParticipantEmails.includes(email) ? 'Verified Fireflies participant' : null,
    cluster.backendUserEmails.includes(email) ? 'Headstart backend user' : null,
    cluster.providerProfileEmails.includes(email) ? 'Salesforce provider profile' : null,
    cluster.contactEmails.includes(email) ? 'Salesforce contact' : null,
    cluster.businessEmails.includes(email) ? 'Salesforce business profile' : null,
    cluster.registryEmails.includes(email) ? 'Versioned identity registry' : null,
  ].filter((value) => value !== null);
}
export function providerFirefliesSearchPlan(
  cluster: IdentityClusterArrays
): ProviderFirefliesSearchPlan {
  const participantEmails = uniqueIdentityValues(
    [
      ...cluster.firefliesParticipantEmails,
      ...cluster.backendUserEmails,
      ...cluster.providerProfileEmails,
      ...cluster.contactEmails,
      ...cluster.businessEmails,
      ...cluster.registryEmails,
      ...cluster.emails,
    ],
    normalizeIdentityEmail
  ).map(normalizeIdentityEmail);
  return {
    participantEmails,
    participantEmailCandidates: participantEmails.map((email) => ({
      email,
      sources: emailSources(cluster, email),
    })),
    titleTerms: uniqueIdentityValues([
      ...cluster.names,
      ...cluster.practiceAliases,
      ...cluster.meetingAliases,
    ]),
    csmEmails: [...cluster.csmEmails],
    csmNames: [...cluster.csmNames],
    identityDiscoveryOrder: [
      'Resolve the Salesforce provider profile and Headstart backend user ID.',
      'Read the backend provider user for its login email and phone.',
      'Collect provider profile, linked Contact, and Business Profile emails.',
      'Search Fireflies by all collected emails.',
      'If coverage is still empty or incomplete, search meeting titles/transcripts by provider, practice, and current/prior CSM; verify the external participant and add that email to the identity registry.',
    ],
    expansionRequiredWhen:
      'The participant-email search returns no meetings, only silent meetings, or no meeting near the relevant SLA window.',
  };
}
function intersects(
  left: readonly string[],
  right: readonly string[],
  normalize: (value: string) => string = normalizeIdentityValue
): boolean {
  const rightValues = new Set(right.map(normalize).filter(Boolean));
  return left.some((value) => rightValues.has(normalize(value)));
}
function clustersOverlap(left: SearchCluster, right: SearchCluster): boolean {
  return (
    intersects(left.salesforceIds, right.salesforceIds, String) ||
    intersects(left.portalProviderIds, right.portalProviderIds, String) ||
    intersects(left.emails, right.emails, normalizeIdentityEmail) ||
    intersects(left.phones, right.phones, normalizeIdentityPhone) ||
    (intersects(left.names, right.names) && intersects(left.practiceAliases, right.practiceAliases))
  );
}
function fieldNormalizer(field: keyof IdentityClusterArrays): (value: string) => string {
  if (field.toLowerCase().includes('email')) return normalizeIdentityEmail;
  if (field === 'phones') return normalizeIdentityPhone;
  if (field.endsWith('Ids')) return String;
  return normalizeIdentityValue;
}
function mergeClusters(target: GroupedCluster, source: SearchCluster): void {
  target.roles = uniqueIdentityValues([...target.roles, source.role ?? 'Unspecified']);
  target.primaryName ??= source.primaryName ?? source.names[0] ?? null;
  target.primaryEmail ??= source.primaryEmail ?? source.emails[0] ?? null;
  target.registryMatchCount = Math.max(
    target.registryMatchCount ?? 0,
    source.registryMatchCount ?? 0
  );
  Object.assign(
    target,
    Object.fromEntries(
      PROVIDER_CLUSTER_ARRAY_FIELDS.map((field) => [
        field,
        uniqueIdentityValues(
          [...identityValues(target, [field]), ...identityValues(source, [field])],
          fieldNormalizer(field)
        ),
      ])
    )
  );
}
function groupedClusters(input: ProviderSearchInput): GroupedCluster[] {
  const existing = input.providerRoles;
  const isPrebuilt =
    Array.isArray(existing) &&
    existing.length > 0 &&
    existing.every((role: unknown) => {
      const parsed = z.object({ names: z.unknown().optional() }).safeParse(role);
      return Boolean(parsed.data?.names);
    });
  const roles = isPrebuilt
    ? z.array(clusterSchema).parse(existing)
    : buildProviderRoleClusters(input);
  const clusters =
    roles.length > 0 ? roles : [{ role: 'Unspecified', ...buildProviderIdentityCluster(input) }];
  const grouped: GroupedCluster[] = [];
  for (const cluster of clusters) {
    const match = grouped.find((candidate) => clustersOverlap(candidate, cluster));
    if (match === undefined) grouped.push({ ...cluster, roles: [cluster.role ?? 'Unspecified'] });
    else mergeClusters(match, cluster);
  }
  return grouped;
}
function coverageForPlan(
  plan: ProviderFirefliesSearchPlan,
  providerIdentityExpected: boolean
): FirefliesIdentityCoverage {
  const hasCsm = plan.csmEmails.length > 0 || plan.csmNames.length > 0;
  const attemptedIdentityPaths = [
    plan.participantEmails.length > 0 ? 'Participant email' : null,
    plan.titleTerms.length > 0 ? 'Provider or practice title' : null,
    hasCsm ? 'Current or prior CSM' : null,
  ].filter((value) => value !== null);
  const missingIdentityPaths = [
    !providerIdentityExpected || plan.participantEmails.length > 0 ? null : 'Provider email',
    plan.titleTerms.length > 0 ? null : 'Provider or practice name',
    hasCsm ? null : 'Current or prior CSM',
  ].filter((value) => value !== null);
  return {
    status: missingIdentityPaths.length > 0 ? 'Partial' : 'Complete',
    attemptedIdentityPaths,
    missingIdentityPaths,
  };
}
export function providerFirefliesSearchPlans(
  input: ProviderSearchInput
): RoleFirefliesSearchPlan[] {
  const grouped = groupedClusters(input);
  const roster = [...(input.providerRoster ?? []), ...(input.practiceProviderRoster ?? [])];
  const rosterOpportunityNames = uniqueIdentityValues(
    roster.map((record) => record.opportunityName ?? record.Name ?? '')
  );
  const clientSearchTerms = firefliesClientSearchVariants(input.opportunityName, [
    ...(input.knownNameVariants ?? []),
    ...(input.clientAliases ?? []),
  ]);
  const stageTerms = firefliesStageTerms(input.stage ?? input.currentStage);
  return grouped.map((cluster) => {
    const plan = providerFirefliesSearchPlan(cluster);
    return {
      role: cluster.roles.join(' / '),
      roles: cluster.roles,
      primaryName: cluster.primaryName ?? cluster.names[0] ?? null,
      ...plan,
      clientSearchTerms,
      rosterOpportunityNames,
      stageTerms,
      transcriptSearchTerms: uniqueIdentityValues([
        ...clientSearchTerms,
        ...stageTerms,
        ...(input.authorizationNumbers ?? []),
        ...(input.payers ?? []),
        ...(input.rbtNames ?? []),
        ...(input.candidateNames ?? []),
      ]),
      coverage: coverageForPlan(plan, Boolean(cluster.primaryName ?? cluster.names[0])),
      requiredSearchPhases: [
        'Participant email',
        'Provider and practice title',
        'Current and prior CSM',
        'Roster-constrained transcript keyword',
        'Full transcript retrieval and client rematch',
      ],
    };
  });
}
export function assessFirefliesIdentityCoverage(input: ProviderSearchInput): {
  status: 'Blocked' | 'Partial' | 'Complete';
  roles: number;
  completeRoles: number;
  missing: string[];
  plans: RoleFirefliesSearchPlan[];
} {
  const plans = providerFirefliesSearchPlans(input);
  if (plans.length === 0)
    return {
      status: 'Blocked',
      roles: 0,
      completeRoles: 0,
      missing: ['No provider role could be resolved'],
      plans: [],
    };
  const incomplete = plans.filter((plan) => plan.coverage.status !== 'Complete');
  return {
    status: incomplete.length > 0 ? 'Partial' : 'Complete',
    roles: plans.length,
    completeRoles: plans.length - incomplete.length,
    missing: uniqueIdentityValues(incomplete.flatMap((plan) => plan.coverage.missingIdentityPaths)),
    plans,
  };
}
