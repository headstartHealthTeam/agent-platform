import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { captureProperty } from './google-capture-property.js';
import type {
  PortalCollectionBaseRow,
  PortalCollectionPlan,
  PortalCollectionProfile,
  PortalInventoryExecution,
} from './portal-collection-types.js';

const text = z.string().nullish();
const identity = z.union([z.string(), z.literal(false), z.literal(0), z.null(), z.undefined()]);
const identities = z.array(identity).nullish();
const provider = z.looseObject({
  primaryName: text,
  primaryEmail: text,
  name: text,
  email: text,
  names: identities,
  emails: identities,
  phones: identities,
  portalProviderIds: identities,
});
const role = provider.omit({ name: true, email: true });
const person = z.looseObject({
  opportunityId: text,
  opportunityName: text,
  name: text,
  clientName: text,
  knownNameVariants: identities,
  clientAliases: identities,
  practice: z.union([z.string(), z.record(z.string(), z.unknown())]).nullish(),
  practiceAliases: identities,
  providerNames: identities,
  providerEmails: identities,
  providerPhones: identities,
  providerRoles: z.array(preserveCollectionRecord(role)).nullish(),
  providers: z.array(preserveCollectionRecord(provider)).nullish(),
  authorizationNumbers: z.array(identity).optional(),
  payers: identities,
  payer: text,
  familyEmails: identities,
  familyPhones: identities,
  rbtNames: identities,
  candidateNames: identities,
  rbtRequests: z.array(z.looseObject({ name: text, assignedRbt: text })).nullish(),
  candidates: z.array(z.looseObject({ name: text })).nullish(),
  stage: z.unknown().optional(),
});
const profile = person.extend({
  opportunityId: z.string(),
  opportunityName: z.string(),
  providerRoster: z.array(preserveCollectionRecord(person)).optional(),
  searchWindow: z.looseObject({ fromDate: text, toDate: text }).nullish(),
});
const request = z.looseObject({
  requestKey: z.string(),
  requestType: z.string().optional(),
  opportunityIds: z.array(z.string()).optional(),
  providerUserId: z.string().optional(),
  roster: z.array(preserveCollectionRecord(person)).nullish(),
});
const chat = z.looseObject({
  id: text,
  messageId: text,
  providerId: text,
  createdAt: text,
  providerName: text,
  channel: text,
  opportunityId: text,
  clientOpportunityId: text,
  requestKey: text,
  messages: z.array(z.looseObject({ content: z.unknown() })).nullish(),
});
const chats = z.array(preserveCollectionRecord(chat)).nullish();
const inventory = z.looseObject({
  requestKey: z.string(),
  status: z.unknown().optional(),
  paginationComplete: z.unknown().optional(),
  pages: z.unknown().optional(),
  chats,
});

/** Retain raw producer metadata; only collection-consumed fields have a schema contract. */
export function parsePortalCollectionProfiles(value: unknown): PortalCollectionProfile[] {
  return z.array(preserveCollectionRecord(profile)).parse(value);
}
/** Planning never scores conversations: do not inspect irrelevant scoring fields. */
export function parsePortalPlanProfiles(value: unknown): PortalCollectionProfile[] {
  return z
    .array(
      preserveCollectionRecord(
        z.object({
          opportunityId: z.string(),
          opportunityName: z.string(),
          knownNameVariants: identities,
          searchWindow: z.looseObject({ fromDate: text, toDate: text }).nullish(),
          providerRoles: z
            .array(
              preserveCollectionRecord(
                role.pick({ primaryName: true, names: true, portalProviderIds: true })
              )
            )
            .nullish(),
          providerRoster: z
            .array(preserveCollectionRecord(z.object({ opportunityId: text })))
            .optional(),
        })
      )
    )
    .parse(value);
}
export function parsePortalCollectionPlan(
  value: unknown
): PortalCollectionPlan & { readonly requests: readonly z.infer<typeof request>[] } {
  return preserveCollectionRecord(
    z.looseObject({
      sentinelRequestKey: z.string().nullable().optional(),
      requests: z.array(preserveCollectionRecord(request)),
    })
  ).parse(value);
}
export function parsePortalCollectionInventory(value: unknown): PortalInventoryExecution[] {
  return z.array(preserveCollectionRecord(inventory)).parse(value);
}
export function parsePortalCollectionBaseRows(
  value: unknown,
  profiles?: readonly PortalCollectionProfile[]
): PortalCollectionBaseRow[] {
  const rows = z.array(z.unknown()).parse(value);
  // The original Map selects only the last matching base row; unrelated envelopes are not evidence.
  const selectedRows =
    profiles === undefined
      ? rows
      : ((): unknown[] => {
          const byId = new Map(
            rows.map((row) => {
              const id = captureProperty(row, 'opportunityId');
              const hasId = Boolean(id);
              return [hasId ? id : captureProperty(row, 'opportunityName'), row];
            })
          );
          return [
            ...new Set(
              profiles
                .map((item) => byId.get(item.opportunityId) ?? byId.get(item.opportunityName))
                .filter((row) => row !== undefined)
            ),
          ];
        })();
  return selectedRows.map((row) => {
    const identity = z.object({ opportunityId: text, opportunityName: text }).parse(row);
    const selected =
      captureProperty(captureProperty(row, 'responses'), 'chats') ?? captureProperty(row, 'chats');
    return { ...identity, chats: chats.parse(selected) };
  });
}
