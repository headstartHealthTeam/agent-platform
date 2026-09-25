import { selectCurrentCandidateMatch, type CandidateMatch } from './candidate-match.js';
import type { DateValue } from './dates.js';
import type { FactPacket } from './recommendation-types.js';
import { reportText } from './report-display-values.js';

export interface ReportExpandedReview {
  readonly blocker?: string | null | undefined;
  readonly summary: string;
  readonly sourceQuality?: string | null | undefined;
  readonly evidenceConflict?: string | boolean | null | undefined;
}
export interface ReportReviewFreshness {
  readonly updateFreshness: string;
  readonly latestUpdateAt?: string | null | undefined;
  readonly latestUpdateSource?: string | null | undefined;
  readonly daysSinceUpdate?: number | null | undefined;
}
export interface ReportMaterialGapInput {
  readonly opp?: { readonly X97153_Scheduled_For__c?: string | null | undefined } | null;
  readonly expanded: ReportExpandedReview;
  readonly freshness: ReportReviewFreshness;
  readonly firefliesResult: string;
  readonly hasValidMilestone?: boolean | DateValue;
  readonly authorizationGate?: {
    readonly conflict?: boolean;
    readonly conflictReason?: string | null;
  } | null;
  readonly packet?: Partial<
    Pick<FactPacket, 'iaCompletionDocumentationConflict' | 'startEvidenceConflict' | 'gaps'>
  > | null;
}
export type ReportEvidenceStatus = 'Blocked' | 'Conflicting' | 'Missing' | 'Partial' | 'Complete';

const EARLY_MILESTONES: readonly (readonly [RegExp, string])[] = [
  [
    /family declined services/i,
    'Close or discharge the Opportunity with the family decision documented.',
  ],
  [/verification complete/i, 'Advance to IA Requested with the IA authorization path initiated.'],
  [/insurance verification pending/i, 'Complete VOB and confirm eligibility.'],
  [
    /partially approved/i,
    'Document provider acceptance of the reduced authorization or submit the appeal.',
  ],
  [
    /denial|payer correction/i,
    'Document the denial correction or appeal and submit the next payer action.',
  ],
  [/authorization pending/i, 'Receive and record the payer determination.'],
  [/clinical review/i, 'Clinical Quality records approval or returns specific edits.'],
  [/parent signature/i, 'Parent signature is completed and recorded.'],
  [/provider signature/i, 'Provider signature is completed and recorded.'],
  [/signature/i, 'All required treatment-plan signatures are completed.'],
  [/treatment plan ready for submission/i, 'Submit the treatment plan for authorization.'],
  [/treatment plan/i, 'Complete and submit the treatment plan with a committed submission date.'],
  [
    /paired-client dependency/i,
    'Document the hold decision and restart condition, or schedule the initial assessment.',
  ],
  [
    /interpreter|translation support/i,
    'Secure interpreter or translation support and confirm the initial assessment date.',
  ],
  [
    /provider scheduling|initial assessment|re-engagement/i,
    'Confirm and record the initial assessment date.',
  ],
];
export function reportNextMilestone(
  blocker: string | null | undefined,
  ticketMatches: readonly CandidateMatch[] = []
): string {
  const text = String(blocker);
  const early = EARLY_MILESTONES.find(([pattern]) => pattern.test(text));
  if (early) return early[1];
  if (/candidate|RBT|treatment start/i.test(text)) {
    const match = selectCurrentCandidateMatch(ticketMatches);
    return /hired/i.test(
      `${reportText(match?.Ticket_Match_Status__c)} ${reportText(match?.Candidate__r?.Applicant_Status__c)}`
    )
      ? 'Provider schedules the first 97153 appointment; Salesforce scheduling or linked billing confirms the service date.'
      : 'Confirm staffing and the expected first 97153 appointment.';
  }
  if (/document|coverage correction/i.test(text))
    return 'Complete and record the missing document or coverage correction.';
  if (/family availability|care-plan feasibility|responsiveness/i.test(text))
    return 'Confirm whether and when the family can proceed.';
  return 'Document the next completed intake milestone.';
}
function conflictGap(input: ReportMaterialGapInput): string {
  const { authorizationGate, packet, expanded } = input;
  const hasConflict = Boolean(expanded.evidenceConflict);
  if (authorizationGate?.conflict)
    return reportText(
      authorizationGate.conflictReason,
      'Authorization records contain conflicting status or date fields.'
    );
  if (packet?.iaCompletionDocumentationConflict)
    return 'Provider-reported IA completion conflicts with missing Salesforce completion evidence and outstanding assessment records.';
  if (packet?.startEvidenceConflict)
    return 'Provider-reported treatment start conflicts with Salesforce staffing and first-service records.';
  if (hasConflict)
    return /authorization|payer|denial|initial review|treatment review/i.test(
      String(expanded.evidenceConflict)
    )
      ? 'Authorization sources disagree on the controlling payer status or determination.'
      : 'Relevant sources disagree on the current gate; the controlling operational status must be verified.';
  return '';
}
function freshnessGap({ freshness, hasValidMilestone = false }: ReportMaterialGapInput): string {
  const validMilestone = Boolean(hasValidMilestone);
  if (freshness.updateFreshness === 'Missing')
    return 'No dated, stage-relevant evidence was found.';
  if (freshness.updateFreshness === 'Stale')
    return `Current status has not been substantively confirmed since ${reportText(freshness.latestUpdateAt?.slice(0, 10), 'the last recorded update')}.`;
  if (freshness.updateFreshness === 'Semi-Stale' && !validMilestone)
    return `The latest substantive update is ${String(freshness.daysSinceUpdate)} days old and has no still-valid explicit milestone.`;
  return '';
}
function milestoneGap({ expanded, opp }: ReportMaterialGapInput): string {
  const blocker = String(expanded.blocker);
  if (/No substantive/i.test(expanded.summary))
    return 'A recent activity exists, but it does not confirm the current operational status.';
  if (/verification complete/i.test(blocker))
    return 'The remaining prerequisite preventing advancement from Insurance Verification is not documented.';
  if (
    /provider scheduling|initial assessment/i.test(blocker) &&
    !/\b\d{1,2}\/\d{1,2}\b/.test(expanded.summary)
  )
    return 'A provider-confirmed initial assessment date is missing.';
  if (/hired RBT|treatment start pending/i.test(blocker) && !opp?.X97153_Scheduled_For__c)
    return 'A provider-confirmed first 97153 appointment is missing; an RBT availability date is not confirmation.';
  return '';
}
function requirementGap({
  packet,
  expanded,
  freshness,
  firefliesResult,
}: ReportMaterialGapInput): string {
  if (packet?.gaps?.some((item) => /does not identify the authorization/i.test(item)))
    return 'The SLA note reports pending insurance approval without identifying the authorization; Insurance Ops must reconcile it with linked records.';
  if (packet?.gaps?.some((item) => /does not name the exact item/i.test(item)))
    return 'The payer request is documented, but the exact required item is not identified.';
  if (
    /Required document or coverage correction/i.test(String(expanded.blocker)) &&
    /remains unresolved/i.test(expanded.summary)
  )
    return 'The specific missing requirement is not identified.';
  if (freshness.latestUpdateSource === 'Fireflies' && firefliesResult.startsWith('Likely:'))
    return 'The Fireflies client match is likely and should be identity-confirmed.';
  return '';
}
/** Ordered report explanation only; does not add source requirements or alter underlying facts. */
export function reportMaterialGap(input: ReportMaterialGapInput): string {
  return conflictGap(input) || freshnessGap(input) || milestoneGap(input) || requirementGap(input);
}
export function reportEvidenceReviewStatus({
  expanded,
  freshness,
  gap,
  sourceBlocked = false,
}: {
  readonly expanded: ReportExpandedReview;
  readonly freshness: ReportReviewFreshness;
  readonly gap: string;
  readonly sourceBlocked?: boolean;
}): ReportEvidenceStatus {
  const hasConflict = Boolean(expanded.evidenceConflict);
  if (sourceBlocked) return 'Blocked';
  if (hasConflict) return 'Conflicting';
  if (freshness.updateFreshness === 'Missing') return 'Missing';
  if (freshness.updateFreshness === 'Stale' || gap || expanded.sourceQuality === 'Likely')
    return 'Partial';
  return 'Complete';
}
