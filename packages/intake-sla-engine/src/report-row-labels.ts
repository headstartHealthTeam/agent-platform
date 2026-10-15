import type {
  ConversationMatchCounts,
  ConversationSearchResult,
  SearchMatch,
} from './conversation-search-result.js';
import type { OpportunityNoteRecord } from './opportunity-note-evidence.js';
import {
  reportClean,
  reportOperationalText,
  reportText,
  reportTruncate,
} from './report-display-values.js';
import type { ReportEvidenceStatus } from './report-row-review.js';

type NamedProvider = { readonly Name?: string | null | undefined } | null | undefined;
export interface ReportProviderOpportunity {
  readonly StageName?: string | null | undefined;
  readonly IA_Rendering_Provider__r?: NamedProvider;
  readonly TA_Rendering_Provider__r?: NamedProvider;
  readonly Rendering_Provider__r?: NamedProvider;
}
export type ReportSlaComparison = NonNullable<OpportunityNoteRecord['Current_SLA__r']> &
  Readonly<
    Partial<
      Record<
        'Action_Item_Update__c' | 'Provider_Action_Items__c' | 'Action_Item__c',
        string | null | undefined
      >
    >
  >;
export function reportRelevantProvider(opp: ReportProviderOpportunity): string {
  const ia = reportText(opp.IA_Rendering_Provider__r?.Name);
  const ta = reportText(opp.TA_Rendering_Provider__r?.Name);
  const general = reportText(opp.Rendering_Provider__r?.Name);
  const stage = reportText(opp.StageName);
  let provider = general || ia || ta;
  if (/^(Insurance Verification|IA |IC )|IA Requested|IA Approved|IA Scheduled/.test(stage))
    provider = ia || general || ta;
  else if (/97151|Treatment Plan|TA Requested|TA Approved|97153|First Day/.test(stage))
    provider = ta || general || ia;
  return reportClean(provider).replace(/\s+/g, ' ').trim();
}
export function reportCurrentSlaSummary(sla: ReportSlaComparison): string {
  const reason = reportOperationalText(reportText(sla.Reason_for_Delay__c));
  const notes = reportOperationalText(reportText(sla.Reason_for_Delay_Notes__c));
  return reason && notes ? reportTruncate(`${reason}: ${notes}`, 500) : reason || notes;
}
/** Existing action text is comparison-only and never enters evidence through this projection. */
export function reportCurrentActionItem(sla: ReportSlaComparison): string {
  return (
    [sla.Action_Item_Update__c, sla.Provider_Action_Items__c, sla.Action_Item__c]
      .map((value) => reportOperationalText(reportText(value)))
      .find(
        (value) =>
          Boolean(value) &&
          !/^(?:not started|in progress|completed|complete|open|closed)$/i.test(value)
      ) ?? ''
  );
}
export interface ReportInterpretationLabelInput {
  readonly candidateCount: number;
  readonly mode: string;
  readonly unrecoveredCount: number;
  readonly failureCount: number;
  readonly eventCount: number;
}
function segmentLabel(count: number): string {
  return `${String(count)} segment${count === 1 ? '' : 's'}`;
}
export function reportInterpretationStatus(input: ReportInterpretationLabelInput): string {
  const { candidateCount, mode, unrecoveredCount, failureCount, eventCount } = input;
  if (!candidateCount) return 'No candidate transcript';
  if (mode === 'disabled') return 'Disabled';
  if (mode === 'unavailable') return 'Blocked - no API or precomputed interpretation';
  if (unrecoveredCount)
    return `Partial - ${String(unrecoveredCount)} unrecovered segment${unrecoveredCount === 1 ? '' : 's'}`;
  if (failureCount) return `Complete with deterministic recovery - ${segmentLabel(failureCount)}`;
  if (eventCount)
    return `Complete (${mode}) - ${String(eventCount)} finding${eventCount === 1 ? '' : 's'}`;
  return `Complete (${mode}) - no substantive finding`;
}
export function reportInterpretationGap({
  candidateCount,
  mode,
  unrecoveredCount,
  failureCount,
}: ReportInterpretationLabelInput): string {
  if (candidateCount && mode === 'unavailable')
    return 'AI transcript interpretation was unavailable; candidate transcript segments were not admitted as evidence.';
  if (unrecoveredCount)
    return `AI transcript interpretation failed for ${segmentLabel(unrecoveredCount)}; those segments produced no recoverable deterministic finding.`;
  if (failureCount)
    return `AI transcript interpretation was unavailable for ${segmentLabel(failureCount)}; constrained deterministic transcript findings were admitted for review.`;
  return '';
}
export interface ReportWeakMatch extends SearchMatch {
  readonly matchedAs?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
  readonly score: number;
  readonly reason?: string | null | undefined;
}
export interface ReportSearchAudit {
  readonly status: string;
  readonly recordsScanned: number;
  readonly matchCounts: ConversationMatchCounts;
}
export function reportConversationMatchAudit({
  opportunityName,
  fireflies,
  calls,
}: {
  readonly opportunityName: string;
  readonly fireflies?: Pick<
    ConversationSearchResult<ReportWeakMatch>,
    'status' | 'recordsScanned' | 'segmentsScanned' | 'matchCounts' | 'weakMatches'
  > | null;
  readonly calls: ReportSearchAudit;
}): string {
  const weak = (fireflies?.weakMatches ?? []).map((match) =>
    [
      match.matchedAs ? `heard as ${match.matchedAs}` : 'unconfirmed name',
      reportText(match.opportunityName, opportunityName),
      `score ${String(match.score)}`,
      match.reason,
    ]
      .filter(Boolean)
      .join('; ')
  );
  return [
    fireflies
      ? `Fireflies: ${fireflies.status}; scanned ${String(fireflies.recordsScanned)} meeting(s) and ${String(fireflies.segmentsScanned)} segment(s); Direct ${String(fireflies.matchCounts.Direct)}, Likely ${String(fireflies.matchCounts.Likely)}, Weak ${String(fireflies.matchCounts.Weak)}.`
      : 'Fireflies: no conversation-search audit record.',
    weak.length ? `Top weak matches: ${weak.join(' | ')}` : '',
    `Calls / Texts: ${calls.status}; scanned ${String(calls.recordsScanned)} record(s); Direct ${String(calls.matchCounts.Direct)}, Likely ${String(calls.matchCounts.Likely)}, Weak ${String(calls.matchCounts.Weak)}.`,
  ]
    .filter(Boolean)
    .join(' ');
}
export function reportFinalReadiness({
  qualityValid,
  identityMatchReview,
  evidenceStatus,
  preliminaryReadyToCopy,
}: {
  readonly qualityValid: boolean;
  readonly identityMatchReview: string;
  readonly evidenceStatus: ReportEvidenceStatus;
  readonly preliminaryReadyToCopy: 'Yes' | 'Review' | 'Blocked';
}): {
  readonly evidenceStatus: ReportEvidenceStatus;
  readonly readyToCopy: 'Yes' | 'Review' | 'Blocked';
} {
  if (qualityValid && !identityMatchReview)
    return { evidenceStatus, readyToCopy: preliminaryReadyToCopy };
  return evidenceStatus === 'Blocked'
    ? { evidenceStatus: 'Blocked', readyToCopy: 'Blocked' }
    : { evidenceStatus: 'Partial', readyToCopy: 'Review' };
}
