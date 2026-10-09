import type {
  AuthorizationEvidenceRecord,
  ResolvedAuthorizationEvidence,
} from './authorization-evidence-types.js';
import type { AuthorizationGate } from './authorization-types.js';
import { isoDate } from './dates.js';
import { extractRequestedInformation } from './requested-information.js';
import { firstEvidenceText } from './source-evidence-context.js';

function coverageKey(record: AuthorizationEvidenceRecord): string {
  return (
    firstEvidenceText(
      record.Client_Insurance__c,
      record.Insurance_Position__c,
      record.Insurance_Slot__c
    ) ?? 'unspecified'
  )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
export function evidenceAuthorizationCoverage(
  resolution: AuthorizationGate | null,
  record: AuthorizationEvidenceRecord
): AuthorizationGate | null {
  return (
    (resolution?.coverages ?? []).find(
      (coverage) =>
        coverage.coverage === coverageKey(record) &&
        (coverage.authorizationId === record.Id ||
          coverage.blockingRecordId === record.Id ||
          (coverage.records ?? []).includes(record.Id))
    ) ?? null
  );
}
export function evidenceCoverageLabel(record: AuthorizationEvidenceRecord): string {
  const key = coverageKey(record);
  return key === 'unspecified' ? 'current' : key;
}
export function unresolvedCoverageText(
  resolution: AuthorizationGate | null,
  phase: string
): string | null {
  const unresolved = (resolution?.coverages ?? []).filter((coverage) => !coverage.satisfied);
  if (unresolved.length === 0) return null;
  return unresolved
    .map((coverage) => {
      const position = coverage.coverage === 'unspecified' ? 'current' : coverage.coverage;
      const payer = coverage.payer ? ` with ${coverage.payer}` : '';
      return `the ${String(position)} ${phase.toLowerCase()} authorization${payer} remains ${coverage.state.toLowerCase()}`;
    })
    .join('; ');
}
interface AuthorizationAction {
  readonly owner: string;
  readonly type: string;
  readonly text: string;
}
const INSURANCE_OPS = 'Insurance Ops';
const INSURANCE_FOLLOW_UP = 'Insurance Follow-Up';
function insuranceAction(text: string): AuthorizationAction {
  return { owner: INSURANCE_OPS, type: INSURANCE_FOLLOW_UP, text };
}
export function unresolvedCoverageAction(
  resolution: AuthorizationGate | null,
  phase: string
): AuthorizationAction {
  const coverage = (resolution?.coverages ?? []).find((item) => !item.satisfied);
  if (coverage === undefined)
    return insuranceAction(
      `Insurance Ops to confirm the remaining ${phase.toLowerCase()} authorization requirement and document the payer determination.`
    );
  const position = coverage.coverage === 'unspecified' ? 'current' : String(coverage.coverage);
  const payer = firstEvidenceText(coverage.payer) ?? 'the payer';
  const state = coverage.state;
  const explanation = [coverage.denialExplanation, coverage.denialReason].filter(Boolean).join(' ');
  const requested = extractRequestedInformation(explanation);
  if (/overlap|duplicate (?:service|authorization|provider)/i.test(explanation))
    return {
      owner: 'Intake',
      type: 'Family Outreach',
      text: `Intake to work with the family to resolve the overlapping authorization with ${payer} and document the payer's next required step.`,
    };
  if (requested)
    return insuranceAction(
      `Insurance Ops to obtain and submit ${requested} for the ${position} ${phase.toLowerCase()} authorization with ${payer} and document the next payer follow-up date.`
    );
  if (/additional details/i.test(state))
    return insuranceAction(
      `Insurance Ops to confirm and resolve the additional-information request for the ${position} ${phase.toLowerCase()} authorization with ${payer}.`
    );
  if (/denied|appeal|peer review|partial/i.test(state))
    return insuranceAction(
      `Insurance Ops to confirm the ${state.toLowerCase()} path for the ${position} ${phase.toLowerCase()} authorization with ${payer} and document the next payer action.`
    );
  return insuranceAction(
    `Insurance Ops to follow up with ${payer} on the pending ${position} ${phase.toLowerCase()} authorization and document the determination and next follow-up date.`
  );
}
export function resolvedEvidenceAuthorization(
  record: AuthorizationEvidenceRecord,
  phase: string,
  coverage: AuthorizationGate | null
): ResolvedAuthorizationEvidence | null {
  if (coverage !== null && !coverage.satisfied) return null;
  if (
    coverage !== null &&
    coverage.authorizationId !== record.Id &&
    !(coverage.records ?? []).includes(record.Id)
  )
    return null;
  const determination = String(record.Insurance_Determination__c)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const status = String(record.Auth_Status__c).toLowerCase().replace(/\s+/g, ' ').trim();
  const unresolved =
    /pending|review|additional details|denied|denial|appeal|peer review|partial|withdrawn/.test(
      `${determination} ${status}`
    );
  const approvalDate =
    phase === 'Initial'
      ? record.Initial_Auth_Approval_Date__c
      : record.Treatment_Auth_Approval_Date__c;
  const noAuthNeeded =
    record.No_Auth_Needed__c === true ||
    determination === 'no auth needed' ||
    status === 'no auth needed';
  const approved =
    !unresolved && Boolean(approvalDate) && (determination === 'approved' || status === 'approved');
  if (!noAuthNeeded && !approved) return null;
  return {
    approvalDate:
      firstEvidenceText(approvalDate, record.Master_Approval_Date__c, record.LastModifiedDate) ??
      record.CreatedDate,
    factType: noAuthNeeded ? 'auth-no-auth-needed' : 'auth-approved',
    noAuthNeeded,
    text: noAuthNeeded
      ? `The current ${phase.toLowerCase()} authorization requires no payer approval; the prerequisite was cleared on ${String(isoDate(firstEvidenceText(approvalDate, record.Master_Approval_Date__c) ?? record.LastModifiedDate))}.`
      : `The current ${phase.toLowerCase()} authorization was approved on ${String(isoDate(approvalDate))}; the payer prerequisite is complete.`,
  };
}
