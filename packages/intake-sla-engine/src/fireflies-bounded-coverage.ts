import { z } from 'zod';

import { boundedAttemptSchema } from './fireflies-bounded-contract.js';
import type {
  BoundedInputs,
  BoundedIssue,
  BoundedRow,
  BoundedSearchAttempt,
  FirefliesCandidateManifest,
} from './fireflies-bounded-contract.js';
import { validateCandidateBody } from './fireflies-candidate-body.js';
import type { RunMeetingRequest } from './fireflies-collection.js';
import type { RoleFirefliesSearchPlan } from './provider-search.js';

export interface BoundedCoverageResolution {
  opportunityId: string;
  reason: string;
  usableMeetingIds: string[];
  originalIssues: BoundedIssue[];
}
export interface BoundedCoverage {
  rows: BoundedRow[];
  resolutions: BoundedCoverageResolution[];
}
interface CoverageContext {
  readonly manifest: FirefliesCandidateManifest;
  readonly inputs: BoundedInputs;
  readonly records: readonly unknown[];
  readonly row: BoundedRow;
  readonly usableIds: Set<string>;
}
function usableBody(id: string, request: RunMeetingRequest, context: CoverageContext): boolean {
  const candidate = context.manifest.meetings.find(
    (meeting) =>
      meeting.transcriptId === id && meeting.opportunityIds.includes(context.row.opportunityId)
  );
  const raw = context.records.find(
    (value) => z.object({ transcriptId: z.unknown() }).safeParse(value).data?.transcriptId === id
  );
  if (candidate === undefined || raw === undefined) return false;
  try {
    const record = validateCandidateBody(context.manifest, raw);
    if (record.fullTranscript.trim().length === 0 || record.transcriptEmpty) return false;
    const emails = [
      record.organizerEmail,
      ...record.participants,
      ...record.meetingAttendees.map((person) => person.email),
    ].map((email) => email.toLowerCase());
    if (!emails.includes(String(request.participantEmail).toLowerCase())) return false;
  } catch {
    return false;
  }
  context.usableIds.add(id);
  return true;
}
function searchAttempts(input: unknown): BoundedSearchAttempt[] {
  return z.object({ attempts: z.array(boundedAttemptSchema) }).parse(input).attempts;
}
function planCovered(plan: RoleFirefliesSearchPlan, context: CoverageContext): boolean {
  if (plan.coverage.status === 'Complete') return true;
  if (plan.coverage.missingIdentityPaths.some((value) => value !== 'Current or prior CSM'))
    return false;
  const primary = context.inputs.collectionPlan.meetingRequests.filter(
    (request) =>
      request.executionTier === 'Primary' &&
      request.providerName === plan.primaryName &&
      request.opportunityIds.includes(context.row.opportunityId)
  );
  const attempts = searchAttempts(context.inputs.searchExecution);
  if (
    primary.length === 0 ||
    !primary.every((request) => {
      const attempt = attempts.find((value) => value.requestKey === request.requestKey);
      return attempt?.completed === true && attempt.paginationComplete && attempt.pages > 0;
    })
  )
    return false;
  return primary.some(
    (request) =>
      attempts
        .find((value) => value.requestKey === request.requestKey)
        ?.meetingIds.some((id) => usableBody(id, request, context)) === true
  );
}
function resolveRow(
  context: CoverageContext,
  resolutions: BoundedCoverageResolution[]
): BoundedRow {
  const { row, inputs, usableIds } = context;
  if (
    row.status !== 'Blocked' ||
    row.issues.length !== 1 ||
    row.issues[0]?.reason !== 'Incomplete provider identity coverage'
  )
    return row;
  const identity = inputs.collectionPlan.opportunityPlans.find(
    (plan) => plan.opportunityId === row.opportunityId
  )?.identityCoverage;
  if (
    identity === undefined ||
    identity.plans.length === 0 ||
    identity.missing.length !== 1 ||
    identity.missing[0] !== 'Current or prior CSM'
  )
    return row;
  if (!identity.plans.every((plan) => planCovered(plan, context))) return row;
  resolutions.push({
    opportunityId: row.opportunityId,
    reason: 'CSM fallback not required after usable primary coverage',
    usableMeetingIds: [...usableIds].sort(),
    originalIssues: row.issues,
  });
  return { ...row, status: 'Complete', issues: [] };
}
/** Resolve the existing conditional CSM exception from validated bodies; never rewrite saved inputs. */
export function resolveBoundedCoverage(
  manifest: FirefliesCandidateManifest,
  inputs: BoundedInputs,
  records: readonly unknown[]
): BoundedCoverage {
  const resolutions: BoundedCoverageResolution[] = [];
  const rows = manifest.rows.map((row) =>
    resolveRow({ manifest, inputs, records, row, usableIds: new Set() }, resolutions)
  );
  return { rows, resolutions };
}
