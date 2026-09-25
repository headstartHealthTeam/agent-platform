import { isoDate, nextBusinessDay, type DateValue } from './dates.js';
import { evidenceSpecificity } from './evidence.js';
import type {
  RecommendationAction,
  RecommendationEvent,
  RecommendationRawStory,
} from './recommendation-types.js';

const INITIAL_AUTHORIZATION = 'initial-authorization';
export const AUTHORIZATION_PROGRESS_TYPES = new Set([
  'ai-interpreted-conversation',
  'auth-appeal',
  'auth-corrections-complete',
  'auth-date-correction',
  'auth-denial-corrections',
  'auth-overlap-remediation',
  'auth-prior-service-termination',
  'auth-resubmission-signature',
  'auth-resubmitted-pending',
  'auth-state-fair-hearing',
  'family-document-update',
]);

export function rawComplementaryAuthorizationProgress(
  story: RecommendationRawStory,
  newest?: RecommendationEvent | null
): RecommendationEvent | null {
  const hasEventDate = Boolean(newest?.eventDate);
  if (
    ![INITIAL_AUTHORIZATION, 'treatment-authorization'].includes(story.currentGateIssueKey ?? '') ||
    !newest ||
    !hasEventDate
  ) {
    return null;
  }
  const newestDate = isoDate(newest.eventDate);
  return (
    [...(story.timeline ?? [])]
      .filter(
        (event) =>
          `${event.source}:${event.sourceRecordId}` !==
            `${newest.source}:${newest.sourceRecordId}` &&
          isoDate(event.eventDate) === newestDate &&
          event.issueKey === story.currentGateIssueKey &&
          ['Direct', 'Likely'].includes(event.matchQuality) &&
          !['Superseded', 'Conflicting'].includes(event.lifecycleState ?? '') &&
          AUTHORIZATION_PROGRESS_TYPES.has(event.factType ?? '') &&
          /\b(?:correct(?:ed|ion)?|edit(?:ed|s)?|resend|resent|resubmit(?:ted)?|send|sent|submit(?:ted)?|upload(?:ed|ing)?)\b/i.test(
            event.text
          ) &&
          /\b(?:not|remain|pending|unconfirmed|await|missing|without)\b/i.test(event.text)
      )
      .sort(
        (left, right) =>
          evidenceSpecificity(right) - evidenceSpecificity(left) ||
          Number(right.matchQuality === 'Direct') - Number(left.matchQuality === 'Direct')
      )[0] ?? null
  );
}

export function authorizationProgressAction(
  event: RecommendationEvent | null | undefined,
  story: RecommendationRawStory,
  asOf: DateValue
): RecommendationAction | null {
  if (!event) return null;
  const text = event.text;
  const namedItems: string[] = [];
  if (/\bSIPA\b/i.test(text)) namedItems.push('the corrected SIPA');
  if (/\bSRS(?:-2)?\b/i.test(text)) namedItems.push('the SRS');
  if (/\btreatment plan\b/i.test(text)) {
    namedItems.push('the corrected treatment plan');
  }
  const packageLabel = namedItems.length
    ? namedItems.length === 1
      ? (namedItems[0] ?? '')
      : `${namedItems.slice(0, -1).join(', ')} and ${namedItems.at(-1) ?? ''}`
    : 'the corrected authorization package';
  const phase =
    story.currentGateIssueKey === INITIAL_AUTHORIZATION
      ? INITIAL_AUTHORIZATION
      : 'treatment-authorization';
  return {
    type: 'Insurance Follow-Up',
    owner: 'Insurance Ops',
    text: `Insurance Ops to confirm payer receipt of ${packageLabel} and document the current ${phase} determination and next follow-up date.`,
    date: nextBusinessDay(asOf),
    basis: 'Recommended',
  };
}
