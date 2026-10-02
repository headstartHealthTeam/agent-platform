import { isoDate } from './dates.js';
import type { EvidenceDate } from './evidence.js';
import { firstEvidenceText } from './source-evidence-context.js';

export interface StaffingEvidenceLink {
  readonly Id?: string | null | undefined;
  readonly Client_Opportunity_Record__c?: string | null | undefined;
  readonly Client_Opportunity__c?: string | null | undefined;
  readonly Opportunity__c?: string | null | undefined;
  readonly WhatId?: string | null | undefined;
  readonly Candidate__c?: string | null | undefined;
  readonly Talent_Acquisition__c?: string | null | undefined;
}
export type CandidateOpportunityMap = ReadonlyMap<string | null | undefined, string>;
export const RBT_TEAM = 'RBT Team';
export const RBT_FOLLOW_UP = 'RBT Follow-Up';
export const CANDIDATE_FOLLOW_UP =
  "RBT Team to confirm the candidate's current step, decision date, and expected start date.";

export function staffingRecordMatches(
  record: StaffingEvidenceLink,
  opportunityId: string,
  candidates?: CandidateOpportunityMap | null
): boolean {
  const direct = [
    record.Client_Opportunity_Record__c,
    record.Client_Opportunity__c,
    record.Opportunity__c,
    record.WhatId,
  ].filter(Boolean);
  if (direct.includes(opportunityId)) return true;
  // The last fallback retains null/undefined keys in existing captured candidate maps.
  const candidateId =
    firstEvidenceText(record.Candidate__c, record.Talent_Acquisition__c) ?? record.Id;
  return candidates instanceof Map && candidates.get(candidateId) === opportunityId;
}
export function staffingDisplayName(value: unknown = ''): string {
  const text = String(value).trim();
  if (text.length === 0 || text !== text.toLowerCase()) return text;
  return text.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}
export function futureStaffingDate(value: string | null | undefined, asOf: EvidenceDate): boolean {
  if (!value) return false;
  const date = isoDate(value);
  const cutoff = isoDate(asOf);
  return date !== null && cutoff !== null && date > cutoff;
}
