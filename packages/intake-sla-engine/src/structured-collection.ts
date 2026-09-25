import type { z } from 'zod';

import { assertBillingCollectionReceipt, billingCollectionReceipt } from './billing-collection.js';
import {
  preserveCollectionRecord,
  savedCollectionRecords,
  type StructuredCollectionArtifacts,
} from './collection-decoding.js';
import {
  collectInitialStructuredRecords,
  frozenCollectionContacts,
  type InitialStructuredRecords,
  type StructuredCollectionSource,
} from './collection-initial.js';
import {
  normalizeCollectedAuthorizations,
  normalizeCollectedOpportunities,
  normalizeCollectedRbtRequests,
  normalizeCollectedStaffing,
  mergeCollectedStaffing,
  type NormalizedCollectionOpportunity,
  type NormalizedCollectionAuthorization,
  type NormalizedCollectionRbtRequest,
  type NormalizedCollectionStaffing,
} from './collection-normalization.js';
import {
  collectedOpportunitySchema,
  type CollectedOpportunity,
} from './collection-opportunity-schema.js';
import * as queries from './collection-queries.js';
import * as schemas from './collection-record-schemas.js';
import type { ReportTaskUpdate } from './report-display-types.js';
import { reportTaskFeedEvents } from './report-task-display.js';

interface CandidateCollection {
  readonly ticketMatches: readonly z.infer<typeof schemas.collectedTicketMatchSchema>[];
  readonly firstInterviews: readonly z.infer<typeof schemas.collectedInterviewSchema>[];
  readonly talentAcquisition: readonly z.infer<typeof schemas.collectedCandidateSchema>[];
}
export interface StructuredCollection
  extends
    CandidateCollection,
    Pick<
      InitialStructuredRecords,
      | 'authorizationReviews'
      | 'vobs'
      | 'clinicalQuality'
      | 'billingClaims'
      | 'opportunityHistory'
      | 'contactRoles'
      | 'contacts'
      | 'csmUsers'
    > {
  readonly opportunities: NormalizedCollectionOpportunity<CollectedOpportunity>[];
  readonly authorizations: NormalizedCollectionAuthorization<
    z.infer<typeof schemas.collectedAuthorizationSchema>
  >[];
  readonly rbtRequests: NormalizedCollectionRbtRequest<
    z.infer<typeof schemas.collectedRbtRequestSchema>
  >[];
  readonly staffing: NormalizedCollectionStaffing<
    z.infer<typeof schemas.collectedStaffingSchema>
  >[];
  readonly tasks: readonly Communication[];
  readonly aircalls: readonly (Communication & { readonly aircall__Message_Content__c: string })[];
  readonly taskUpdates: readonly ReportTaskUpdate[];
}

async function queryChunks<T>(
  source: StructuredCollectionSource,
  ids: readonly string[],
  makeQuery: (ids: readonly string[]) => string,
  schema: z.ZodType<T>,
  size = 100
): Promise<T[]> {
  if (source.mode === 'saved') return [];
  const records: T[] = [];
  for (let offset = 0; offset < ids.length; offset += size) {
    records.push(
      ...(await source.reader.query(
        makeQuery(ids.slice(offset, offset + size)),
        preserveCollectionRecord(schema)
      ))
    );
  }
  return records;
}
type Communication = z.infer<typeof schemas.collectedCommunicationSchema>;
function normalizeAircallRecord(
  record: Communication
): Communication & { readonly aircall__Message_Content__c: string } {
  const communicationType = [
    record.aircall__Type__c,
    record.aircall__Call_Type__c,
    record.aircall__Subtype__c,
  ]
    .filter(Boolean)
    .join(' ');
  const isSms = Boolean(record.aircall__SMS_Direction__c) || /\bsms\b/i.test(communicationType);
  return {
    ...record,
    aircall__Message_Content__c:
      [record.aircall__Message_Content__c, isSms ? record.aircall__Description__c : ''].find(
        Boolean
      ) ?? '',
  };
}
function uniqueRecords<T extends { readonly Id: string }>(rows: readonly T[]): T[] {
  return [...new Map(rows.map((row) => [row.Id, row])).values()];
}
async function relatedCandidateRecords(
  source: StructuredCollectionSource,
  artifacts: StructuredCollectionArtifacts,
  rbtIds: readonly string[]
): Promise<CandidateCollection> {
  const ticketMatches =
    source.mode === 'saved'
      ? await savedCollectionRecords(
          artifacts,
          'ticket_match_rows.json',
          schemas.collectedTicketMatchSchema
        )
      : await queryChunks(
          source,
          rbtIds,
          queries.ticketMatchCollectionQuery,
          schemas.collectedTicketMatchSchema
        );
  const candidateIds = [
    ...new Set(ticketMatches.flatMap((row) => (row.Candidate__c ? [row.Candidate__c] : []))),
  ];
  const firstInterviews =
    source.mode === 'saved'
      ? await savedCollectionRecords(
          artifacts,
          'first_interview_rows.json',
          schemas.collectedInterviewSchema
        )
      : await queryChunks(
          source,
          candidateIds,
          queries.firstInterviewCollectionQuery,
          schemas.collectedInterviewSchema
        );
  const talentAcquisition =
    source.mode === 'saved'
      ? await savedCollectionRecords(
          artifacts,
          'talent_acquisition_rows.json',
          schemas.collectedCandidateSchema
        )
      : await queryChunks(
          source,
          candidateIds,
          queries.talentAcquisitionCollectionQuery,
          schemas.collectedCandidateSchema
        );
  return { ticketMatches, firstInterviews, talentAcquisition };
}
/** Intake chooses the exact queries and checkpoint order; the shared reader owns read-only transport. */
export async function collectStructuredEvidence({
  source,
  artifacts,
  cutoff,
}: {
  readonly source: StructuredCollectionSource;
  readonly artifacts: StructuredCollectionArtifacts;
  readonly cutoff: string;
}): Promise<StructuredCollection> {
  const frozenPeople = source.mode === 'saved' ? await frozenCollectionContacts(artifacts) : null;
  const rawOpportunities =
    source.mode === 'saved'
      ? await savedCollectionRecords(artifacts, 'opportunity_rows.json', collectedOpportunitySchema)
      : await source.reader.query(
          queries.INTAKE_OPPORTUNITY_QUERY,
          preserveCollectionRecord(collectedOpportunitySchema)
        );
  const opportunities = normalizeCollectedOpportunities(rawOpportunities);
  if (source.mode === 'saved' && !opportunities.length)
    throw new Error('SLA_USE_EXISTING_STRUCTURED requires opportunity_rows.json');
  const opportunityIds = opportunities.map((row) => row.Id);
  await artifacts.write('opportunity_rows.json', opportunities);
  const initial = await collectInitialStructuredRecords(
    source,
    artifacts,
    opportunities,
    frozenPeople
  );
  const authorizations = normalizeCollectedAuthorizations(
    initial.authorizations,
    initial.authorizationReviews
  );
  const rbtRequests = normalizeCollectedRbtRequests(initial.rbtRequests);
  const directStaffing = normalizeCollectedStaffing(initial.directStaffing);
  const assignedIds = [
    ...new Set(rbtRequests.flatMap((row) => (row.RBT_Assigned__c ? [row.RBT_Assigned__c] : []))),
  ];
  const assignedStaffing = normalizeCollectedStaffing(
    await queryChunks(
      source,
      assignedIds,
      queries.assignedStaffingCollectionQuery,
      schemas.collectedStaffingSchema
    ),
    true
  );
  const staffing = mergeCollectedStaffing(directStaffing, assignedStaffing);
  const lineQueries = queries.approvedLineCollectionQueries();
  const [lineTasks, lineAircalls] =
    source.mode === 'saved'
      ? [[], []]
      : await Promise.all([
          source.reader.query(
            lineQueries.tasks,
            preserveCollectionRecord(schemas.collectedCommunicationSchema)
          ),
          source.reader.query(
            lineQueries.aircalls,
            preserveCollectionRecord(schemas.collectedCommunicationSchema)
          ),
        ]);
  const tasks = uniqueRecords([...initial.directTasks, ...lineTasks]);
  const aircalls = uniqueRecords(
    [...initial.directAircalls, ...lineAircalls].map(normalizeAircallRecord)
  );
  const taskFeeds = await queryChunks(
    source,
    tasks.map((row) => row.Id),
    queries.taskFeedCollectionQuery,
    schemas.collectedTaskFeedSchema,
    75
  );
  const taskUpdates =
    source.mode === 'saved' ? initial.frozenTaskUpdates : reportTaskFeedEvents(tasks, taskFeeds);
  const candidates = await relatedCandidateRecords(
    source,
    artifacts,
    rbtRequests.map((row) => row.Id)
  );
  for (const [name, rows] of [
    ['auth_rows.json', authorizations],
    ['authorization_review_rows.json', initial.authorizationReviews],
    ['vob_rows.json', initial.vobs],
    ['clinical_quality_rows.json', initial.clinicalQuality],
    ['rbt_rows.json', rbtRequests],
    ['staffing_rows.json', staffing],
  ] as const)
    await artifacts.write(name, rows);
  const billingInput = { records: initial.billingClaims, opportunityIds, cutoff };
  if (source.mode === 'saved')
    assertBillingCollectionReceipt({
      ...billingInput,
      receipt: (await artifacts.read('billing_collection_contract.json')) ?? null,
    });
  else
    await artifacts.write(
      'billing_collection_contract.json',
      billingCollectionReceipt(billingInput)
    );
  for (const [name, rows] of [
    ['billing_claim_records.json', initial.billingClaims],
    ['ticket_match_rows.json', candidates.ticketMatches],
    ['first_interview_rows.json', candidates.firstInterviews],
    ['talent_acquisition_rows.json', candidates.talentAcquisition],
    ['task_rows.json', tasks],
    ['task_feed_rows.json', taskUpdates],
    ['aircall_rows.json', aircalls],
    ['opportunity_history_rows.json', initial.opportunityHistory],
    ['contact_role_rows.json', initial.contactRoles],
  ] as const)
    await artifacts.write(name, rows);
  return {
    opportunities,
    authorizations,
    authorizationReviews: initial.authorizationReviews,
    vobs: initial.vobs,
    clinicalQuality: initial.clinicalQuality,
    rbtRequests,
    staffing,
    billingClaims: initial.billingClaims,
    tasks,
    aircalls,
    taskUpdates,
    opportunityHistory: initial.opportunityHistory,
    contactRoles: initial.contactRoles,
    contacts: initial.contacts,
    csmUsers: initial.csmUsers,
    ...candidates,
  };
}
