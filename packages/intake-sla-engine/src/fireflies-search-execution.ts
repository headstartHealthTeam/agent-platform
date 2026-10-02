import { buildFirefliesCollectionPlan } from './fireflies-collection.js';
import type { FirefliesProfile } from './fireflies-collection.js';

export interface FirefliesSearchAttempt {
  readonly phase: string;
  readonly completed?: boolean | null;
  readonly paginationComplete?: boolean | null;
  readonly discoveredParticipantEmails?: readonly string[] | null;
  readonly meetingIds?: readonly string[] | null;
  readonly participantEmail?: string;
  readonly participantEmails?: readonly string[] | null;
  readonly meetings?:
    | readonly {
        readonly participants?: readonly string[] | null;
        readonly meetingAttendees?: readonly { readonly email: string }[] | null;
      }[]
    | null;
}
export interface FirefliesSearchExecution {
  readonly attempts?: readonly FirefliesSearchAttempt[] | null;
  readonly transcripts?:
    | readonly {
        readonly complete?: boolean | null;
        readonly id?: string | null;
        readonly transcriptId?: string;
      }[]
    | null;
}
export interface FirefliesSearchAssessment {
  status: 'Blocked' | 'Partial' | 'Complete';
  identityCoverage: string;
  requiredPhases: string[];
  completedPhases: string[];
  missingPhases: string[];
  pagesComplete: boolean;
  candidateMeetings: number;
  transcriptsRetrieved: number;
  missingTranscripts: string[];
  discoveredParticipantEmails: string[];
  newlyDiscoveredParticipantEmails: string[];
  missingDiscoveredParticipantSearches: string[];
  attempts: number;
  reason: string;
}
function unique(items: readonly string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
function normalizedEmail(value = ''): string {
  return value.trim().toLowerCase();
}
function externalParticipantEmails(attempts: readonly FirefliesSearchAttempt[]): string[] {
  return unique(
    attempts
      .filter((attempt) =>
        ['Provider and practice title', 'Current and prior CSM'].includes(attempt.phase)
      )
      .flatMap((attempt) => [
        ...(attempt.discoveredParticipantEmails ?? []),
        ...(attempt.meetings ?? []).flatMap(
          (meeting) =>
            meeting.participants ??
            meeting.meetingAttendees?.map((attendee) => attendee.email) ??
            []
        ),
      ])
      .map(normalizedEmail)
      .filter(
        (email) =>
          email.length > 0 &&
          !email.endsWith('@headstart.health') &&
          !email.endsWith('@fireflies.ai')
      )
  );
}
function complete(attempt: FirefliesSearchAttempt): boolean {
  return attempt.completed === true && attempt.paginationComplete !== false;
}
function assessmentReason(
  status: string,
  identityBlocked: boolean,
  missingPhases: readonly string[],
  missingTranscripts: readonly string[],
  missingSearches: readonly string[]
): string {
  if (status === 'Complete')
    return 'Every provider identity path, page, candidate meeting, and full transcript was checked.';
  return [
    identityBlocked ? 'Provider identity could not be resolved.' : '',
    missingPhases.length > 0 ? `Missing search phases: ${missingPhases.join(', ')}.` : '',
    missingTranscripts.length > 0
      ? `Missing ${String(missingTranscripts.length)} candidate full transcript(s).`
      : '',
    missingSearches.length > 0
      ? `Discovered provider participant email(s) still require a complete search: ${missingSearches.join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}
export function assessFirefliesSearchExecution({
  profile,
  execution = {},
}: {
  readonly profile: FirefliesProfile;
  readonly execution?: FirefliesSearchExecution;
}): FirefliesSearchAssessment {
  const plan = buildFirefliesCollectionPlan(profile);
  const attempts = execution.attempts ?? [];
  const completedPhases = new Set(attempts.filter(complete).map((attempt) => attempt.phase));
  const requiredPhases = unique(
    plan.providerPlans.flatMap((providerPlan) => providerPlan.requiredSearchPhases.slice(0, 3))
  );
  const missingPhases = requiredPhases.filter((phase) => !completedPhases.has(phase));
  const candidateIds = unique(attempts.flatMap((attempt) => attempt.meetingIds ?? []));
  const retrieved = new Set(
    (execution.transcripts ?? [])
      .filter((transcript) => transcript.complete !== false)
      .map((transcript) => transcript.id ?? transcript.transcriptId)
  );
  const missingTranscripts = candidateIds.filter((id) => !retrieved.has(id));
  const plannedEmails = new Set(
    plan.providerPlans
      .flatMap((providerPlan) => providerPlan.participantEmails)
      .map(normalizedEmail)
  );
  const discoveredParticipantEmails = externalParticipantEmails(attempts);
  const searchedEmails = new Set(
    attempts
      .filter((attempt) => attempt.phase === 'Participant email' && complete(attempt))
      .flatMap((attempt) => [attempt.participantEmail, ...(attempt.participantEmails ?? [])])
      .map(normalizedEmail)
  );
  const newlyDiscoveredParticipantEmails = discoveredParticipantEmails.filter(
    (email) => !plannedEmails.has(email)
  );
  const missingDiscoveredParticipantSearches = newlyDiscoveredParticipantEmails.filter(
    (email) => !searchedEmails.has(email)
  );
  const identityBlocked = plan.identityCoverage.status === 'Blocked';
  const partial =
    missingPhases.length > 0 ||
    missingTranscripts.length > 0 ||
    missingDiscoveredParticipantSearches.length > 0;
  const status = identityBlocked ? 'Blocked' : partial ? 'Partial' : 'Complete';
  return {
    status,
    identityCoverage: plan.identityCoverage.status,
    requiredPhases,
    completedPhases: [...completedPhases],
    missingPhases,
    pagesComplete: attempts.every((attempt) => attempt.paginationComplete !== false),
    candidateMeetings: candidateIds.length,
    transcriptsRetrieved: retrieved.size,
    missingTranscripts,
    discoveredParticipantEmails,
    newlyDiscoveredParticipantEmails,
    missingDiscoveredParticipantSearches,
    attempts: attempts.length,
    reason: assessmentReason(
      status,
      identityBlocked,
      missingPhases,
      missingTranscripts,
      missingDiscoveredParticipantSearches
    ),
  };
}
