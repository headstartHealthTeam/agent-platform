import type { StoryFact, StoryIssueStatus } from './story-types.js';
import { normalizedStoryText } from './story-values.js';

const STORY_PENDING = 'Pending';
const STORY_APPEAL = 'Appeal';
const STORY_DENIED = 'Denied';
const STORY_ADDITIONAL_DETAILS = 'Additional Details';
const STORY_PARTIAL_APPROVAL = 'Partial Approval';
const STORY_RESOLVED = 'Resolved';

export function explicitlyUnresolved(event: StoryFact): boolean {
  const value = normalizedStoryText(event);
  return /\b(?:pending|denied|denial|appeal|peer review|additional details|required|missing|outstanding|unconfirmed|not confirmed|not yet|still waiting|fell through|unresponsive|cannot|can'?t|incomplete|drafting|reschedul|cancel)\b/.test(
    value
  );
}

export function issueStatus(event: StoryFact): StoryIssueStatus | null {
  const value = normalizedStoryText(event);
  if ((event.factType ?? '').toLowerCase() === 'auth-coverage-satisfied') {
    return STORY_PENDING;
  }
  if (/\bappeal|reconsider|peer review\b/.test(value)) return STORY_APPEAL;
  if (/\bdenied|denial\b/.test(value)) return STORY_DENIED;
  if (/\badditional details|more information\b/.test(value)) return STORY_ADDITIONAL_DETAILS;
  if (/\bpartial(?:ly)? approved|partial approval\b/.test(value)) return STORY_PARTIAL_APPROVAL;
  if (/\b(?:approved|no auth needed|resolved|cleared)\b/.test(value)) {
    return STORY_RESOLVED;
  }
  if (/\bpending|in review|clinical review\b/.test(value)) return STORY_PENDING;
  return null;
}

export function explicitProgression(
  event: StoryFact,
  previousStatus: StoryIssueStatus | null
): boolean {
  const value = normalizedStoryText(event);
  const status = issueStatus(event);
  const forwardAuthorizationStates = new Map([
    [
      STORY_PENDING,
      new Set([
        STORY_ADDITIONAL_DETAILS,
        STORY_DENIED,
        STORY_APPEAL,
        STORY_PARTIAL_APPROVAL,
        STORY_RESOLVED,
      ]),
    ],
    [
      STORY_ADDITIONAL_DETAILS,
      new Set([STORY_PENDING, STORY_DENIED, STORY_APPEAL, STORY_PARTIAL_APPROVAL, STORY_RESOLVED]),
    ],
    [STORY_DENIED, new Set([STORY_APPEAL, STORY_RESOLVED])],
    [STORY_APPEAL, new Set([STORY_RESOLVED])],
    [STORY_PARTIAL_APPROVAL, new Set([STORY_RESOLVED])],
  ]);
  if (
    previousStatus !== null &&
    status !== null &&
    forwardAuthorizationStates.get(previousStatus)?.has(status)
  )
    return true;
  if (previousStatus === STORY_DENIED && /appeal|reconsider|resubmit|correction/.test(value)) {
    return true;
  }
  return /\bafter|following|supersed|replaced|resubmitted\b/.test(value);
}

export function assessmentCompletionResolved(event: StoryFact): boolean {
  // These facts describe prerequisites, sessions or a start milestone, not the whole gate.
  // Do not re-promote their prose through the legacy completion regex.
  if (
    [
      'family-document-completed',
      'ia-partial',
      'ia-session-completed',
      'ia-session-unverified',
      'ia-start-date-recorded',
      'billing-completion-review',
    ].includes((event.factType ?? '').toLowerCase())
  )
    return false;
  const value = (event.text ?? '').toLowerCase().replace(/\s+/g, ' ');
  if (
    /(?:whole[- ]assessment|initial assessment) completion (?:is |remains )?(?:not |unconfirmed)|(?:initial assessment|97151) (?:is |was )?not completed/.test(
      value
    )
  )
    return false;
  return /(?:initial assessment|97151).*(?:occurred|completed)|(?:occurred|completed).*(?:initial assessment|97151)/.test(
    value
  );
}
