import type { ConversationSearchResult, SearchMatch } from './conversation-search-result.js';
import type { FirefliesEvidenceMatch } from './fireflies-evidence-types.js';
import { reportText } from './report-display-values.js';

export interface ReportInterpretationDisplayInput {
  readonly opportunityName: string;
  readonly candidateCount: number;
  readonly mode: string;
  readonly unrecoveredFailures: readonly unknown[];
  readonly failures: readonly unknown[];
  readonly events: readonly unknown[];
  readonly search: ConversationSearchResult<FirefliesEvidenceMatch> | undefined;
  readonly calls: ConversationSearchResult<SearchMatch>;
}
function interpretationStatus(input: ReportInterpretationDisplayInput): string {
  const { candidateCount, mode, unrecoveredFailures, failures, events } = input;
  if (!candidateCount) return 'No candidate transcript';
  if (mode === 'disabled') return 'Disabled';
  if (mode === 'unavailable') return 'Blocked - no API or precomputed interpretation';
  if (unrecoveredFailures.length)
    return `Partial - ${String(unrecoveredFailures.length)} unrecovered segment${unrecoveredFailures.length === 1 ? '' : 's'}`;
  if (failures.length)
    return `Complete with deterministic recovery - ${String(failures.length)} segment${failures.length === 1 ? '' : 's'}`;
  return events.length
    ? `Complete (${mode}) - ${String(events.length)} finding${events.length === 1 ? '' : 's'}`
    : `Complete (${mode}) - no substantive finding`;
}
function interpretationGap(input: ReportInterpretationDisplayInput): string {
  const { candidateCount, mode, unrecoveredFailures, failures } = input;
  if (candidateCount && mode === 'unavailable')
    return 'AI transcript interpretation was unavailable; candidate transcript segments were not admitted as evidence.';
  if (unrecoveredFailures.length)
    return `AI transcript interpretation failed for ${String(unrecoveredFailures.length)} segment${unrecoveredFailures.length === 1 ? '' : 's'}; those segments produced no recoverable deterministic finding.`;
  return failures.length
    ? `AI transcript interpretation was unavailable for ${String(failures.length)} segment${failures.length === 1 ? '' : 's'}; constrained deterministic transcript findings were admitted for review.`
    : '';
}
export function reportInterpretationDisplay(input: ReportInterpretationDisplayInput): {
  readonly aiInterpretationStatus: string;
  readonly aiInterpretationGap: string;
  readonly conversationMatchAudit: string;
} {
  const { search, calls } = input;
  const weak = (search?.weakMatches ?? []).map((match) => {
    const matchedAs = 'matchedAs' in match ? match.matchedAs : undefined;
    return [
      matchedAs ? `heard as ${matchedAs}` : 'unconfirmed name',
      reportText(match.opportunityName, input.opportunityName),
      `score ${String(match.score)}`,
      match.reason,
    ]
      .filter(Boolean)
      .join('; ');
  });
  return {
    aiInterpretationStatus: interpretationStatus(input),
    aiInterpretationGap: interpretationGap(input),
    conversationMatchAudit: [
      search
        ? `Fireflies: ${search.status}; scanned ${String(search.recordsScanned)} meeting(s) and ${String(search.segmentsScanned)} segment(s); Direct ${String(search.matchCounts.Direct)}, Likely ${String(search.matchCounts.Likely)}, Weak ${String(search.matchCounts.Weak)}.`
        : 'Fireflies: no conversation-search audit record.',
      weak.length ? `Top weak matches: ${weak.join(' | ')}` : '',
      `Calls / Texts: ${calls.status}; scanned ${String(calls.recordsScanned)} record(s); Direct ${String(calls.matchCounts.Direct)}, Likely ${String(calls.matchCounts.Likely)}, Weak ${String(calls.matchCounts.Weak)}.`,
    ]
      .filter(Boolean)
      .join(' '),
  };
}
