import type { FreshnessAnalysis } from './freshness-analysis.js';
import type { ReportBillingRow } from './report-billing.js';
import { reportClean, reportText, reportTruncate } from './report-display-values.js';
import type { SavedFirefliesEvidence } from './saved-fireflies-evidence.js';
import { isUsableStageEvidence } from './source-outcome.js';

function initialFirefliesResult(row: SavedFirefliesEvidence | undefined): string {
  const meetings = row?.meetings ?? [];
  const excerpt = meetings
    .map((meeting) => ({
      ...meeting,
      transcriptEvidence: reportClean(
        [
          meeting.transcriptSnippet,
          ...(Array.isArray(meeting.matchedSentences)
            ? meeting.matchedSentences
            : [meeting.matchedSentences]),
        ]
          .filter(Boolean)
          .join(' ')
      ),
    }))
    .find((meeting) => meeting.transcriptEvidence);
  if (meetings.length)
    return excerpt
      ? `${reportText(excerpt.quality, 'Likely')}: ${String(excerpt.date)}; ${reportTruncate(excerpt.transcriptEvidence, 300)}`
      : 'Transcript required: meetings were found, but no client-specific transcript excerpt was collected.';
  return row?.searched
    ? 'Searched all accessible meetings for the stage-relevant provider, then matched client/practice/stage context; no relevant meeting found.'
    : 'Blocked: Fireflies was not checked in the current run.';
}
export interface ReportConversationDisplay {
  readonly firefliesResult: string;
  readonly firefliesWasSearched: boolean;
  readonly normalizedPortal: FreshnessAnalysis['evidence'];
  readonly usablePortal: FreshnessAnalysis['evidence'];
  readonly alohaClaimsResult: string;
}
export function reportConversationDisplay(
  row: SavedFirefliesEvidence | undefined,
  freshness: FreshnessAnalysis,
  billing: ReportBillingRow | undefined
): ReportConversationDisplay {
  let firefliesResult = initialFirefliesResult(row);
  const normalized = freshness.evidence.filter((event) => event.source === 'Fireflies');
  const usable = normalized.filter((event) => event.substantive && event.matchQuality !== 'Weak');
  const weak = normalized.filter((event) => event.matchQuality === 'Weak');
  const normalizedPortal = freshness.evidence.filter((event) => event.source === 'Portal chat');
  const firefliesWasSearched = (row?.meetings.length ?? 0) > 0 || row?.searched === true;
  if (!firefliesWasSearched && freshness.needsFireflies)
    firefliesResult = `Required but not checked: ${reportText(freshness.firefliesReason, 'Structured evidence did not produce a usable current update.')}`;
  if (firefliesWasSearched) {
    const first = usable[0];
    firefliesResult = first
      ? `${first.matchQuality}: ${first.eventDate}; ${reportTruncate(first.text, 300)}`
      : `Searched - Not Found: no stage-relevant client match${weak.length ? `; ${String(weak.length)} ambiguous first-name match${weak.length === 1 ? '' : 'es'} retained as weak evidence` : ''}.`;
  }
  return {
    firefliesResult,
    firefliesWasSearched,
    normalizedPortal,
    usablePortal: normalizedPortal.filter(isUsableStageEvidence),
    alohaClaimsResult: billing?.events.length
      ? `Linked Billing / Claims Direct: ${reportTruncate(billing.events[0]?.summary, 300)}`
      : 'Linked Billing / Claims searched; no stage-relevant 97151 or 97153 appointment found',
  };
}
