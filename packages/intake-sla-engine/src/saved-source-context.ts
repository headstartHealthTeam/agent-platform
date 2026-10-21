import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { matchPortalAuthRequestsToOpportunities } from './portal-auth-request.js';
import type { ReportIdentityProfile } from './report-identity-types.js';
import {
  decodeSourceExecution,
  loadSavedTranscriptHealth,
  savedConversationSourceHealth,
} from './saved-source-health.js';
import type {
  SavedSourceArtifacts,
  SavedSourceExecution,
  SavedTranscriptHealth,
} from './saved-source-health.js';
import { loadSavedSourceRows, savedSourceJson } from './saved-source-rows.js';
import {
  verifyDenialContext,
  type DenialContextCoverage,
  type DenialContextRow,
} from './slack-denial-context.js';
import { denialContextRequirements } from './slack-denial-requirements.js';
import type { StructuredCollection } from './structured-collection.js';

const text = z.string().nullish();
const identifier = z.union([z.string(), z.number()]).nullish();
const person = z
  .looseObject({
    name: z.unknown().optional(),
    firstName: z.unknown().optional(),
    lastName: z.unknown().optional(),
  })
  .nullish();
const requestSchema = z.looseObject({
  opportunityId: text,
  clientOpportunityId: text,
  client: person,
  provider: person,
  requestNumber: identifier,
  friendlyId: identifier,
  Id: identifier,
  submittedAt: text,
  createdAt: text,
});
const inventorySchema = z.looseObject({
  collectedAt: z.unknown().optional(),
  complete: z.unknown().optional(),
  rows: z.unknown().optional(),
  requests: z.unknown().optional(),
});
type PortalRequest = z.infer<typeof requestSchema>;
export interface SavedPortalRequests {
  readonly inventory: unknown;
  readonly records: readonly PortalRequest[];
  readonly collection: ReturnType<typeof matchPortalAuthRequestsToOpportunities<PortalRequest>>;
}
type SourceRows = Awaited<ReturnType<typeof loadSavedSourceRows>>;
export interface SavedReportSources {
  readonly portal: SourceRows;
  readonly fireflies: SourceRows;
  readonly transcriptHealth: SavedTranscriptHealth;
  readonly portalRequests: SavedPortalRequests;
  readonly portalExecution: SavedSourceExecution | null;
  readonly firefliesExecution: SavedSourceExecution | null;
  readonly health: ReturnType<typeof savedConversationSourceHealth>;
  readonly slack: SourceRows;
  readonly slackSweepExecution: unknown;
  readonly denialCoverage: DenialContextCoverage;
  readonly denialByOpportunity: ReadonlyMap<string, DenialContextRow>;
  readonly gmail: SourceRows;
  readonly files: SourceRows;
}
async function loadPortalRequests(
  artifacts: SavedSourceArtifacts,
  profiles: readonly ReportIdentityProfile[]
): Promise<SavedPortalRequests> {
  const raw = await savedSourceJson(artifacts, 'portal_auth_request_inventory.json');
  const inventory = Array.isArray(raw) || raw === null ? null : inventorySchema.parse(raw);
  const records = z
    .array(preserveCollectionRecord(requestSchema))
    .parse(Array.isArray(raw) ? raw : (inventory?.rows ?? inventory?.requests ?? []));
  const collection = matchPortalAuthRequestsToOpportunities(records, profiles);
  await artifacts.write('portal_auth_request_rows.json', {
    collectedAt: inventory?.collectedAt ?? null,
    complete: inventory?.complete === true,
    recordsRetrieved: records.length,
    matchedRequests: [...collection.byOpportunity.values()].flat(),
    unmatchedRequests: collection.unmatched,
  });
  return { inventory: raw, records, collection };
}
/** Compose retained source snapshots; no discovery, provider reads or interpretation occurs here. */
export async function loadSavedReportSources(input: {
  readonly artifacts: SavedSourceArtifacts;
  readonly collection: StructuredCollection;
  readonly profiles: readonly ReportIdentityProfile[];
  readonly runId: string;
  readonly runAt: Date;
}): Promise<SavedReportSources> {
  const { artifacts, collection, profiles, runId, runAt } = input;
  const portal = await loadSavedSourceRows(artifacts, 'portal_rows.json');
  const fireflies = await loadSavedSourceRows(artifacts, 'fireflies_rows.json');
  const transcriptHealth = await loadSavedTranscriptHealth(
    artifacts,
    fireflies.rows,
    profiles,
    runAt
  );
  const portalRequests = await loadPortalRequests(artifacts, profiles);
  const [portalRawExecution, firefliesRawExecution] = await Promise.all([
    artifacts.read('portal_inventory_execution.json'),
    artifacts.read('fireflies_inventory_execution.json'),
  ]);
  const portalExecution = decodeSourceExecution(portalRawExecution);
  const firefliesExecution = decodeSourceExecution(firefliesRawExecution);
  const health = savedConversationSourceHealth({
    opportunities: collection.opportunities,
    portalRows: portal.byOpportunity,
    firefliesRows: fireflies.byOpportunity,
    portalExecution,
    firefliesExecution,
    transcriptHealth,
  });
  const slack = await loadSavedSourceRows(artifacts, 'slack_rows.json', profiles);
  const slackSweepExecution = await savedSourceJson(artifacts, 'slack_full_sweep_execution.json');
  const denialCoverage = verifyDenialContext({
    requirements: denialContextRequirements({
      opportunities: collection.opportunities,
      profiles,
      auths: collection.authorizations,
      authReviews: collection.authorizationReviews,
      asOf: runAt.toISOString(),
    }),
    runId,
    asOf: runAt.toISOString(),
    plan: await savedSourceJson(artifacts, 'slack_full_sweep_plan.json'),
    capture: await savedSourceJson(artifacts, 'slack_search_capture.json'),
    searchRows: await savedSourceJson(artifacts, 'slack_full_sweep_exact_name.json', []),
    threadRows: await savedSourceJson(artifacts, 'slack_full_sweep_threads.json', []),
    mergedRows: await savedSourceJson(artifacts, 'slack_rows.json', []),
  });
  await artifacts.write('slack_denial_coverage.json', denialCoverage);
  const gmail = await loadSavedSourceRows(artifacts, 'gmail_rows.json');
  const files = await loadSavedSourceRows(artifacts, 'escalation_file_rows.json');
  return {
    portal,
    fireflies,
    transcriptHealth,
    portalRequests,
    portalExecution,
    firefliesExecution,
    health,
    slack,
    slackSweepExecution,
    denialCoverage,
    denialByOpportunity: new Map(denialCoverage.rows.map((row) => [row.opportunityId, row])),
    gmail,
    files,
  };
}
