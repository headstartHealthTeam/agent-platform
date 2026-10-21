import type { StoryGate, StoryGateOverride, StoryIssue } from './story-types.js';

export const STORY_ISSUE_ORDER = new Map([
  ['insurance-verification', 10],
  ['initial-authorization', 20],
  ['initial-assessment', 30],
  ['provider-capacity', 35],
  ['family-availability', 35],
  ['required-documentation', 40],
  ['treatment-plan', 50],
  ['clinical-review', 60],
  ['payer-submission', 70],
  ['treatment-authorization', 80],
  ['rbt-staffing', 90],
  ['first-97153', 100],
]);

export function prerequisiteGateOverride(
  issue: Pick<StoryIssue, 'issueKey'>,
  priorGate: StoryGate
): StoryGateOverride | null {
  const definitions = new Map<string, { unresolvedGate: string; owner: string }>([
    [
      'provider-capacity',
      {
        unresolvedGate:
          'Resolve provider capacity or assign a provider who can complete the next intake milestone',
        owner: 'CSM',
      },
    ],
    [
      'family-availability',
      {
        unresolvedGate:
          'Confirm family availability and a workable plan for the next intake milestone',
        owner: 'CSM',
      },
    ],
    [
      'required-documentation',
      {
        unresolvedGate: 'Obtain the outstanding required documentation before the case can advance',
        owner: priorGate.owner ?? 'CSM',
      },
    ],
    [
      'treatment-plan',
      {
        unresolvedGate: 'Complete treatment-plan drafting and confirm the submission date',
        owner: 'CSM',
      },
    ],
    [
      'clinical-review',
      {
        unresolvedGate: 'Complete Clinical Quality review before payer submission',
        owner: 'Clinical Quality',
      },
    ],
    [
      'rbt-staffing',
      {
        unresolvedGate: 'Confirm RBT staffing before the first 97153 service can be scheduled',
        owner: 'RBT Team',
      },
    ],
  ]);
  const definition = definitions.get(issue.issueKey);
  if (!definition) return null;
  return {
    issueKey: issue.issueKey,
    ...definition,
    recommendedAction: null,
    recommendedActionType: null,
    recommendedFollowUpDate: null,
  };
}

export function activeIssueGateOverride(
  issue: StoryIssue | null | undefined,
  priorGate: StoryGate
): StoryGateOverride | null {
  if (!issue?.latestEvent) return null;
  const event = issue.latestEvent;
  const fallback = prerequisiteGateOverride(issue, priorGate);
  return {
    issueKey: issue.issueKey,
    processPosition: priorGate.processPosition,
    unresolvedGate: event.gateImpact ?? fallback?.unresolvedGate ?? priorGate.unresolvedGate,
    owner: event.actionOwner ?? fallback?.owner ?? priorGate.owner,
    recommendedAction: event.recommendedAction ?? fallback?.recommendedAction ?? null,
    recommendedActionType: event.actionType ?? fallback?.recommendedActionType ?? null,
    recommendedFollowUpDate: event.followUpDate ?? event.milestoneDate ?? null,
  };
}
