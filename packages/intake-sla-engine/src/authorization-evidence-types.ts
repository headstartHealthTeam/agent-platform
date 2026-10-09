import type { AuthorizationGate } from './authorization-types.js';
import type { EvidenceDate, EvidenceEvent } from './evidence.js';
import type { GateContext } from './gate-context.js';
import type { OpportunityNoteProfile } from './opportunity-note-evidence.js';
import type { SourceAuthorizationRecord } from './source-authorization-types.js';

export type AuthorizationEvidenceRecord = SourceAuthorizationRecord & {
  readonly Id: string;
  readonly Insurance_Position__c?: string | null | undefined;
  readonly Insurance_Slot__c?: string | null | undefined;
};
export interface AuthorizationSelection {
  readonly authorizationId?: string | null | undefined;
  readonly blockingRecordId?: string | null | undefined;
  readonly records?: readonly (string | undefined)[] | undefined;
  readonly coverages?: readonly AuthorizationSelection[] | undefined;
}
export interface AuthorizationEvidenceGate extends GateContext, AuthorizationSelection {
  readonly authorization?: AuthorizationSelection | null | undefined;
}
export interface AuthorizationsEvidenceInput {
  readonly records?: readonly AuthorizationEvidenceRecord[] | null | undefined;
  readonly profile: OpportunityNoteProfile;
  readonly gate?: AuthorizationEvidenceGate | null | undefined;
  readonly asOf: EvidenceDate;
}
export interface AuthorizationEvidenceContext {
  readonly input: AuthorizationsEvidenceInput;
  readonly phase: string | null;
  readonly insuranceGate: boolean;
  readonly interpretationGate: GateContext | null | undefined;
  readonly selected: readonly AuthorizationEvidenceRecord[];
  readonly resolution: AuthorizationGate | null;
  readonly resolverId: string | null | undefined;
  readonly noCurrentAuthorization: boolean;
}
export interface ResolvedAuthorizationEvidence {
  readonly approvalDate: string | null | undefined;
  readonly factType: string;
  readonly noAuthNeeded: boolean;
  readonly text: string;
}
export interface AuthorizationEvidenceIdentity {
  readonly opportunityId: string;
  readonly opportunityName: string | null | undefined;
  readonly authorizationNumber: string | null | undefined;
  readonly payer: string | null | undefined;
  readonly matchQuality: string;
}
export type AuthorizationEvidenceEvent = EvidenceEvent & {
  readonly lifecycleRecordId?: string;
  readonly denialReason?: string | null | undefined;
};
