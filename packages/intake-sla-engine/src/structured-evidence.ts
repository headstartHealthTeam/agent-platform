import { createEvidenceEvent, type EvidenceDate, type EvidenceEvent } from './evidence.js';

export interface StructuredEvidenceInput {
  readonly opportunityId: string;
  readonly source: string;
  readonly sourceRecordId: string;
  readonly eventDate: EvidenceDate;
  readonly category: string;
  readonly text: string;
  readonly gateImpact?: string | null | undefined;
  readonly actionOwner?: string | null | undefined;
  readonly actionType?: string | null | undefined;
  readonly recommendedAction?: string | null | undefined;
  readonly processRelevance?: number;
  readonly milestoneDate?: string | null;
  readonly followUpDate?: string | null;
  readonly rawText?: string | null;
  readonly factType?: string | null;
  readonly requestedInformation?: string | null;
  readonly specificityMissing?: boolean;
  readonly candidateStep?: string | null;
  readonly candidateName?: string | null;
  readonly candidateActive?: boolean | null;
  readonly issueKey?: string | null;
}
export interface StructuredEvidenceEvent extends EvidenceEvent {
  readonly eventDate: EvidenceDate;
  readonly requestedInformation: string | null;
  readonly specificityMissing: boolean;
  readonly candidateStep: string | null;
  readonly candidateName: string | null;
  readonly candidateActive: boolean | null;
}
/** Source adapters' existing direct/substantive projection; admission and gate meaning stay with each adapter. */
export function structuredEvidenceEvent({
  opportunityId,
  source,
  sourceRecordId,
  eventDate,
  category,
  text,
  gateImpact,
  actionOwner,
  actionType,
  recommendedAction,
  processRelevance = 9,
  milestoneDate = null,
  followUpDate = null,
  rawText = null,
  factType = null,
  requestedInformation = null,
  specificityMissing = false,
  candidateStep = null,
  candidateName = null,
  candidateActive = null,
  issueKey = null,
}: StructuredEvidenceInput): StructuredEvidenceEvent {
  return createEvidenceEvent({
    opportunityId,
    source,
    sourceRecordId,
    eventDate,
    category,
    text,
    rawText,
    matchQuality: 'Direct',
    substantive: true,
    relationship: 'Supports',
    processRelevance,
    gateImpact,
    actionOwner,
    actionType,
    recommendedAction,
    milestoneDate,
    followUpDate,
    factType,
    requestedInformation,
    specificityMissing,
    candidateStep,
    candidateName,
    candidateActive,
    issueKey,
  });
}
