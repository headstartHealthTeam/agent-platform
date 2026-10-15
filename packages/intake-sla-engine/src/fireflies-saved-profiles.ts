import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { captureProperty } from './google-capture-property.js';
import type { InterpretationProfile } from './interpretation-packet.js';
import type { MeetingSegmentProfile, SegmentableMeeting } from './meeting-segment-types.js';
import { savedOptionalText as text } from './saved-report-fields.js';

const strings = z.array(z.string());
const dates = z.union([z.string(), z.number(), z.date()]).nullish();
const anchors = z.object({
  salesforceIds: strings,
  names: strings,
  emails: strings,
  phones: strings,
  practiceAliases: strings,
  meetingAliases: strings,
  portalProviderIds: strings,
});
// Matcher-only projection. Raw producer profiles remain untouched for packet/hash binding.
// Anchors are normalized through String by the original scorer; discarded falsy values stay empty.
const anchorText = z
  .unknown()
  .transform((value) => {
    const present = Boolean(value);
    return present ? String(value) : '';
  })
  .optional();
const identities = z
  .array(z.union([z.string(), z.literal(false), z.literal(0), z.null(), z.undefined()]))
  .nullish();
const provider = z.object({
  primaryName: anchorText,
  primaryEmail: anchorText,
  name: anchorText,
  email: anchorText,
  names: identities,
  emails: identities,
  phones: identities,
});
const person = z.object({
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
  providerRoles: z.array(provider).nullish(),
  providers: z.array(provider).nullish(),
  authorizationNumbers: identities,
  payers: identities,
  payer: text,
  familyEmails: identities,
  familyPhones: identities,
  rbtNames: identities,
  candidateNames: identities,
  rbtRequests: z.array(z.object({ name: text, assignedRbt: text })).nullish(),
  candidates: z.array(z.object({ name: text })).nullish(),
  stage: z.unknown().optional(),
});
const meetingProfile = person.extend({
  providerRoster: z.array(person).nullish(),
  providerIdentity: preserveCollectionRecord(anchors).nullish(),
  storyStartDate: dates,
  stageEntryDate: dates,
  slaCreatedDate: dates,
  asOf: dates,
});
/** Decode a selected matcher input, after replay/packet cohort and broad relevance selection. */
export function decodeFirefliesMeetingProfile(raw: unknown): MeetingSegmentProfile {
  return meetingProfile.parse(raw);
}
const named = z.union([z.string(), z.record(z.string(), z.unknown())]).nullish();
const packetProfileSchema = z.object({
  opportunityId: z.string(),
  opportunityName: z.string(),
  knownNameVariants: strings.nullish(),
  clientAliases: strings.nullish(),
  practice: named,
  providerRoles: z
    .array(z.object({ role: z.string(), names: strings.nullish(), emails: strings.nullish() }))
    .nullish(),
  currentCsm: named,
  priorCsms: z.array(z.unknown()).nullish(),
  authorizationNumbers: strings.nullish(),
  payers: z.array(z.json()).nullish(),
  rbtRequests: z.array(z.json()).nullish(),
  candidates: z.array(z.json()).nullish(),
  providerRoster: z
    .array(z.object({ opportunityId: text, id: text, opportunityName: text, name: text }))
    .nullish(),
  stage: text,
  stageEntryDate: text,
});
export function decodeFirefliesPacketProfile(value: unknown): InterpretationProfile {
  // Return the selected projection, not a rewritten profile for source hashing or matching.
  return packetProfileSchema.parse(value);
}
const segmentMeeting = z.object({
  id: z.union([z.string(), z.number()]).nullish(),
  title: anchorText,
  date: dates,
  participants: z.array(text).nullish(),
  organizerEmail: text,
  fullTranscript: text,
  transcript: text,
  transcriptText: text,
  transcriptSnippet: text,
});
export function decodeSegmentableMeeting(value: unknown): SegmentableMeeting {
  // Only the selected transcript fallback is consumed by the matcher.
  const selected =
    captureProperty(value, 'fullTranscript') ??
    captureProperty(value, 'transcript') ??
    captureProperty(value, 'transcriptText') ??
    captureProperty(value, 'transcriptSnippet') ??
    '';
  const row = segmentMeeting
    .omit({ fullTranscript: true, transcript: true, transcriptText: true, transcriptSnippet: true })
    .parse(value);
  return { ...row, fullTranscript: z.string().parse(selected) };
}
