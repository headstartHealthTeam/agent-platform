import type { SalesforceQueryReader } from '@headstart-health/salesforce-read';
import { z } from 'zod';

import {
  preserveCollectionRecord,
  savedCollectionRecords,
  type StructuredCollectionArtifacts,
} from './collection-decoding.js';
import type { CollectedOpportunity } from './collection-opportunity-schema.js';
import { initialCollectionQueries } from './collection-queries.js';
import * as records from './collection-record-schemas.js';

export type StructuredCollectionSource =
  { readonly mode: 'live'; readonly reader: SalesforceQueryReader } | { readonly mode: 'saved' };

export interface InitialStructuredRecords {
  readonly authorizations: readonly z.infer<typeof records.collectedAuthorizationSchema>[];
  readonly authorizationReviews: readonly z.infer<typeof records.collectedAuthorizationSchema>[];
  readonly vobs: readonly z.infer<typeof records.collectedVobSchema>[];
  readonly clinicalQuality: readonly z.infer<typeof records.collectedClinicalQualitySchema>[];
  readonly rbtRequests: readonly z.infer<typeof records.collectedRbtRequestSchema>[];
  readonly directStaffing: readonly z.infer<typeof records.collectedStaffingSchema>[];
  readonly billingClaims: readonly z.infer<typeof records.collectedBillingSchema>[];
  readonly directTasks: readonly z.infer<typeof records.collectedCommunicationSchema>[];
  readonly directAircalls: readonly z.infer<typeof records.collectedCommunicationSchema>[];
  readonly opportunityHistory: readonly z.infer<typeof records.collectedHistorySchema>[];
  readonly contactRoles: readonly z.infer<typeof records.collectedContactRoleSchema>[];
  readonly contacts: readonly z.infer<typeof records.collectedContactSchema>[];
  readonly csmUsers: readonly z.infer<typeof records.collectedUserSchema>[];
  readonly frozenTaskUpdates: readonly z.infer<typeof records.collectedTaskUpdateSchema>[];
}

const text = z.string().nullish();
const frozenIdentitySchema = z.looseObject({
  familyContacts: z
    .array(z.looseObject({ id: text, name: text, email: text, phone: text }))
    .nullish(),
  currentCsm: z.looseObject({ name: text, email: text, userId: text }).nullish(),
});
export async function frozenCollectionContacts(artifacts: StructuredCollectionArtifacts): Promise<{
  contacts: z.infer<typeof records.collectedContactSchema>[];
  csmUsers: z.infer<typeof records.collectedUserSchema>[];
}> {
  const profiles = await savedCollectionRecords(
    artifacts,
    'identity_profile_rows.json',
    frozenIdentitySchema
  );
  const contacts = new Map<string, z.infer<typeof records.collectedContactSchema>>();
  const csmUsers = new Map<string, z.infer<typeof records.collectedUserSchema>>();
  for (const profile of profiles) {
    for (const contact of profile.familyContacts ?? []) {
      if (contact.id)
        contacts.set(contact.id, {
          Id: contact.id,
          Name: contact.name,
          Email: contact.email,
          Phone: contact.phone,
          MobilePhone: contact.phone,
        });
    }
    const csm = profile.currentCsm;
    if (csm?.name)
      csmUsers.set(csm.name.toLowerCase(), {
        Id: csm.userId,
        Name: csm.name,
        Email: csm.email,
        IsActive: true,
      });
  }
  return { contacts: [...contacts.values()], csmUsers: [...csmUsers.values()] };
}
export async function collectInitialStructuredRecords(
  source: StructuredCollectionSource,
  artifacts: StructuredCollectionArtifacts,
  opportunities: readonly Pick<CollectedOpportunity, 'Id' | 'ContactId' | 'CSM__c'>[],
  frozenPeople: Awaited<ReturnType<typeof frozenCollectionContacts>> | null
): Promise<InitialStructuredRecords> {
  const queries =
    source.mode === 'live'
      ? initialCollectionQueries({
          opportunityIds: opportunities.map((row) => row.Id),
          primaryContactIds: [
            ...new Set(opportunities.flatMap((row) => (row.ContactId ? [row.ContactId] : []))),
          ],
          csmNames: [...new Set(opportunities.flatMap((row) => (row.CSM__c ? [row.CSM__c] : [])))],
        })
      : null;
  const collect = <T>(
    file: string,
    schema: z.ZodType<T>,
    query: string | null | undefined
  ): Promise<readonly T[]> => {
    if (source.mode === 'saved') return savedCollectionRecords(artifacts, file, schema);
    return query
      ? source.reader.query(query, preserveCollectionRecord(schema))
      : Promise.resolve([]);
  };
  const [
    authorizations,
    authorizationReviews,
    vobs,
    clinicalQuality,
    rbtRequests,
    directStaffing,
    billingClaims,
    directTasks,
    directAircalls,
    opportunityHistory,
    contactRoles,
    contacts,
    csmUsers,
    frozenTaskUpdates,
  ] = await Promise.all([
    collect('auth_rows.json', records.collectedAuthorizationSchema, queries?.authorizations),
    collect(
      'authorization_review_rows.json',
      records.collectedAuthorizationSchema,
      queries?.authorizationReviews
    ),
    collect('vob_rows.json', records.collectedVobSchema, queries?.vobs),
    collect(
      'clinical_quality_rows.json',
      records.collectedClinicalQualitySchema,
      queries?.clinicalQuality
    ),
    collect('rbt_rows.json', records.collectedRbtRequestSchema, queries?.rbtRequests),
    collect('staffing_rows.json', records.collectedStaffingSchema, queries?.directStaffing),
    collect('billing_claim_records.json', records.collectedBillingSchema, queries?.billingClaims),
    collect('task_rows.json', records.collectedCommunicationSchema, queries?.directTasks),
    collect('aircall_rows.json', records.collectedCommunicationSchema, queries?.directAircalls),
    collect(
      'opportunity_history_rows.json',
      records.collectedHistorySchema,
      queries?.opportunityHistory
    ),
    collect('contact_role_rows.json', records.collectedContactRoleSchema, queries?.contactRoles),
    source.mode === 'live'
      ? collect('', records.collectedContactSchema, queries?.contacts)
      : Promise.resolve([]),
    source.mode === 'live'
      ? collect('', records.collectedUserSchema, queries?.csmUsers)
      : Promise.resolve([]),
    source.mode === 'saved'
      ? savedCollectionRecords(artifacts, 'task_feed_rows.json', records.collectedTaskUpdateSchema)
      : Promise.resolve([]),
  ]);
  const people = frozenPeople ?? { contacts, csmUsers };
  return {
    authorizations,
    authorizationReviews,
    vobs,
    clinicalQuality,
    rbtRequests,
    directStaffing,
    billingClaims,
    directTasks,
    directAircalls,
    opportunityHistory,
    contactRoles,
    ...people,
    frozenTaskUpdates,
  };
}
