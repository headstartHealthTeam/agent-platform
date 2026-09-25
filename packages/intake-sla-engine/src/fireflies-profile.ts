import { z } from 'zod';

import type { FirefliesProfile } from './fireflies-collection.js';

const text = z.string().nullish();
const values = z
  .union([
    z.string(),
    z.array(z.union([z.string(), z.literal(false), z.literal(0), z.null(), z.undefined()])),
  ])
  .nullish();
const provider = z.union([
  z.string(),
  z.literal(false),
  z.literal(0),
  z.null(),
  z.undefined(),
  z.looseObject({
    role: text,
    name: text,
    displayName: text,
    legalName: text,
    firefliesParticipantEmail: text,
    backendUserEmail: text,
    providerProfileEmail: text,
    contactEmail: text,
    businessEmail: text,
    email: text,
  }),
]);
const named = z.union([z.string(), z.record(z.string(), z.unknown())]).nullish();
const strings = z.array(z.string()).nullish();
const roster = z.array(z.looseObject({ opportunityName: text, Name: text })).nullish();
const profileSchema = z.looseObject({
  opportunityId: z.string(),
  opportunityName: z.string(),
  searchWindow: z.looseObject({ fromDate: text, toDate: text }).nullish(),
  stageEntryDate: text,
  asOf: text,
  providers: z.array(provider).nullish(),
  providerRoles: z
    .union([z.array(provider), z.record(z.string(), z.union([provider, z.array(provider)]))])
    .nullish(),
  practice: named,
  practiceAliases: values,
  currentCsm: named,
  priorCsms: values,
  csmNames: values,
  csmEmails: values,
  knownNameVariants: strings,
  clientAliases: strings,
  stage: z.unknown().optional(),
  currentStage: z.unknown().optional(),
  authorizationNumbers: strings,
  payers: strings,
  rbtNames: strings,
  candidateNames: strings,
  providerRoster: roster,
  practiceProviderRoster: roster,
});

/** Validate fields consumed by collection planning without removing hash-bound profile metadata. */
export function parseFirefliesProfiles(input: unknown): FirefliesProfile[] {
  return z.array(profileSchema).parse(input);
}
