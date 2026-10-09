import type { StoryEventContext } from './story-event-context.js';
import { compatibleRbtHireAndPrerequisite } from './story-rbt-compatibility.js';
import type { StoryEvent } from './story-types.js';
import { normalizedStoryText, storyTime } from './story-values.js';

export function isAuthorizationStoryIssue(key: string): boolean {
  return ['initial-authorization', 'treatment-authorization'].includes(key);
}

export function compatibleAuthorizationStatus<T extends StoryEvent>(
  context: StoryEventContext<T>
): boolean {
  const { previousStatus, currentStatus, original, priorLatestEvent, issueKey } = context;
  if (!isAuthorizationStoryIssue(issueKey) || !previousStatus || !currentStatus) return false;
  if (previousStatus === currentStatus) return true;
  const partial =
    /partial(?:ly)? approved|approved only part|denied [\d,]+ of [\d,]+ units|peer-to-peer.*(?:denied|units)|(?:denied|units).*peer-to-peer/.test(
      `${normalizedStoryText(priorLatestEvent ?? {})} ${normalizedStoryText(original)}`
    );
  return (
    partial &&
    [previousStatus, currentStatus].includes('Resolved') &&
    [previousStatus, currentStatus].some((status) =>
      ['Appeal', 'Partial Approval', 'Denied'].includes(status)
    )
  );
}

function authorizationRestatement<T extends StoryEvent>(context: StoryEventContext<T>): boolean {
  const { original, previousStatus, currentStatus, priorLatestEvent, issueKey } = context;
  if (!isAuthorizationStoryIssue(issueKey) || previousStatus !== 'Appeal') return false;
  if (
    priorLatestEvent &&
    currentStatus === 'Denied' &&
    ['auth-denied', 'auth-denial-reason'].includes((original.factType ?? '').toLowerCase()) &&
    !/appeal|reconsider|peer review/.test(normalizedStoryText(original))
  )
    return true;
  return (
    currentStatus === 'Pending' &&
    original.factType === 'auth-pending' &&
    /\b(?:pending|underway|in progress)\b/.test(priorLatestEvent?.text ?? '') &&
    !/\b(?:new|different|resubmitted|replacement)\b/i.test(original.text ?? '')
  );
}

function lowerRankedSameRecord<T extends StoryEvent>(context: StoryEventContext<T>): boolean {
  const { original, priorLatestEvent, sameRecord, currentRank, previousRank, issueKey } = context;
  const sameDate =
    sameRecord && storyTime(priorLatestEvent?.eventDate) === storyTime(original.eventDate);
  return (
    sameDate &&
    currentRank < previousRank &&
    !(
      issueKey === 'rbt-staffing' &&
      original.relationship === 'Conflicts' &&
      !compatibleRbtHireAndPrerequisite(priorLatestEvent, original)
    )
  );
}

export function supersededStoryRestatement<T extends StoryEvent>(
  context: StoryEventContext<T>
): boolean {
  const { original, previous, priorLatestEvent, equivalentFact } = context;
  const generic =
    previous?.state === 'Resolved' &&
    (original.factType ?? '').toLowerCase() === 'discussion' &&
    /(?:activity|update) was recorded|remaining prerequisite must be confirmed/i.test(
      original.text ?? ''
    );
  if (
    generic ||
    (equivalentFact && storyTime(original.eventDate) <= storyTime(priorLatestEvent?.eventDate))
  )
    return true;
  if (lowerRankedSameRecord(context)) return true;
  const sameDate =
    priorLatestEvent !== null &&
    storyTime(priorLatestEvent.eventDate) === storyTime(original.eventDate);
  if (
    sameDate &&
    original.specificityMissing === true &&
    priorLatestEvent.specificityMissing !== true &&
    priorLatestEvent.requestedInformation
  )
    return true;
  return authorizationRestatement(context);
}
