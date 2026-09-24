interface AuthorizationRecordFields {
  readonly id?: string;
  readonly authorizationType?: string | null;
  readonly type?: string;
  readonly determination?: string | null;
  readonly status?: string | null;
  readonly initialApprovalDate?: string | null;
  readonly initialSubmissionDate?: string | null;
  readonly treatmentApprovalDate?: string | null;
  readonly treatmentSubmissionDate?: string | null;
  readonly portalSubmissionDate?: string | null;
  readonly lastSubstantiveDate?: string | Date | null;
  readonly createdDate?: string | null;
  readonly authStartDate?: string | null;
  readonly authExpirationDate?: string | null;
  readonly superseded?: boolean;
  readonly active?: boolean;
  readonly noAuthNeeded?: boolean;
  readonly authorizationNumber?: string | null;
  readonly payer?: string | null;
  readonly insurancePosition?: string | null;
  readonly insuranceSlot?: string | null;
  readonly clientInsurance?: string | null;
  readonly denialReason?: string | null;
  readonly denialExplanation?: string | null;
}

// Source projections preserve own undefined fields just as the approved JS producer does.
export type AuthorizationRecord = {
  readonly [K in keyof AuthorizationRecordFields]?: AuthorizationRecordFields[K] | undefined;
};

export type AuthorizationState =
  | 'Missing'
  | 'Conflict'
  | 'No Auth Needed'
  | 'Approved'
  | 'Pending'
  | 'Pending Review'
  | 'Additional Details Required'
  | 'Denied'
  | 'Appeal'
  | 'Peer Review'
  | 'Partial Approval'
  | 'Withdrawn';

export interface DenialDetails {
  readonly denialOccurred: boolean;
  readonly denialReason: string | null;
  readonly denialExplanation: string | null;
  readonly denialRecordId: string | null;
}

export interface AuthorizationGate extends Partial<DenialDetails> {
  readonly phase: string;
  readonly state: AuthorizationState;
  readonly satisfied: boolean;
  readonly confidence: 'Low' | 'High';
  readonly blockingRecordId: string | null | undefined;
  readonly conflict: boolean;
  readonly reason: string;
  readonly records?: readonly (string | undefined)[];
  readonly coverage?: string;
  readonly payer?: string | null;
  readonly submissionDate?: string | null;
  readonly determinationDate?: string | null;
  readonly authorizationId?: string | undefined;
  readonly appealKind?: 'appeal' | 'peer review' | null;
  readonly coverages?: readonly AuthorizationGate[];
}

export interface AuthorizationGateInput {
  readonly phase: string;
  readonly authorizations?: readonly AuthorizationRecord[];
  readonly asOf?: string | Date;
}
