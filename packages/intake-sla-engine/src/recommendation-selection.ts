import { isoDate } from './dates.js';
import { approvedEvidence, evidenceSpecificity } from './evidence.js';
import { dateValue } from './recommendation-date.js';
import { normalizeCategory } from './recommendation-text.js';
import type { RecommendationEvent, RecommendationRawStory } from './recommendation-types.js';

const REQUIRED_DOCUMENTATION = 'required-documentation';

export function shouldUseStructuredAction(
  newest: RecommendationEvent | null | undefined,
  structured: RecommendationEvent | null | undefined
): boolean {
  if (!structured?.recommendedAction) return false;
  if (!newest?.recommendedAction) return true;
  // Completing a prerequisite does not resolve a later, separate scheduling
  // barrier. Source relevance must not replace that barrier's explicit action.
  if (
    structured.factType === 'family-document-completed' &&
    newest.issueKey &&
    newest.issueKey !== structured.issueKey &&
    !['No Action', 'Monitor'].includes(newest.actionType ?? '') &&
    dateValue(newest.eventDate) > dateValue(structured.eventDate)
  )
    return false;
  if (
    newest.factType === 'tp-resubmitted-for-review' &&
    structured.factType === 'tp-revisions' &&
    dateValue(newest.eventDate) > dateValue(structured.eventDate)
  )
    return false;
  if (
    ['auth-overlap-family-outreach', 'auth-signature-documentation', 'required-document'].includes(
      newest.factType ?? ''
    )
  ) {
    return false;
  }
  if (newest.specificityMissing && structured.requestedInformation) return true;
  if (newest.source === structured.source && newest.sourceRecordId === structured.sourceRecordId) {
    return false;
  }
  return (
    ['treatment-ready-to-schedule', 'tp-ready', 'rbt-candidate', 'rbt-recruiting'].includes(
      newest.factType ?? ''
    ) || (structured.processRelevance ?? 0) > (newest.processRelevance ?? 0)
  );
}

export function activeRequiredDocumentationEvent(
  story: RecommendationRawStory,
  evidenceEvents: readonly RecommendationEvent[] = []
): RecommendationEvent | null {
  const activeIssue = (story.activeIssues ?? []).find(
    (issue) => issue.issueKey === REQUIRED_DOCUMENTATION && Boolean(issue.latestEventId)
  );
  if (!activeIssue) return null;
  const issueDate = isoDate(activeIssue.lastUpdatedDate);
  return (
    approvedEvidence(evidenceEvents)
      .filter(
        (event) =>
          (event.issueKey === REQUIRED_DOCUMENTATION ||
            normalizeCategory(event.category) === REQUIRED_DOCUMENTATION) &&
          isoDate(event.eventDate) === issueDate &&
          event.substantive &&
          ['Direct', 'Likely'].includes(event.matchQuality) &&
          Boolean(event.recommendedAction)
      )
      .sort(
        (left, right) =>
          Number(Boolean(right.requestedInformation)) -
            Number(Boolean(left.requestedInformation)) ||
          Number(left.specificityMissing === true) - Number(right.specificityMissing === true) ||
          Number(right.factType === 'family-document-update') -
            Number(left.factType === 'family-document-update') ||
          evidenceSpecificity(right) - evidenceSpecificity(left)
      )[0] ?? null
  );
}
