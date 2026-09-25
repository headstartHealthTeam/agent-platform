import {
  evidenceAuthorizationCoverage,
  resolvedEvidenceAuthorization,
} from './authorization-evidence-coverage.js';
import { normalizeEvidenceAuthorization } from './authorization-evidence-normalize.js';
import type {
  AuthorizationEvidenceContext,
  AuthorizationEvidenceRecord,
  AuthorizationSelection,
  AuthorizationsEvidenceInput,
} from './authorization-evidence-types.js';
import { resolveAuthorizationGate } from './authorization-gate.js';
import { evidenceAuthorizationPhase } from './authorization-review-evidence.js';
import type { AuthorizationGate } from './authorization-types.js';
import type { EvidenceDate } from './evidence.js';
import { categoryForGate } from './gate-context.js';

function addCoverageIds(
  ids: Set<string | null | undefined>,
  resolution?: AuthorizationSelection | null
): void {
  for (const coverage of resolution?.coverages ?? []) {
    if (coverage.authorizationId) ids.add(coverage.authorizationId);
    if (coverage.blockingRecordId) ids.add(coverage.blockingRecordId);
    for (const id of coverage.records ?? []) ids.add(id);
  }
}
function currentIds(
  records: readonly AuthorizationEvidenceRecord[],
  phase: string | null,
  asOf: EvidenceDate
): Set<string | null | undefined> {
  if (!phase) return new Set();
  const resolution = resolveAuthorizationGate({
    phase,
    asOf,
    authorizations: records.map((record) => normalizeEvidenceAuthorization(record, asOf)),
  });
  const ids = new Set([resolution.authorizationId, resolution.blockingRecordId].filter(Boolean));
  addCoverageIds(ids, resolution);
  return ids;
}
function relevantRecord(
  record: AuthorizationEvidenceRecord,
  input: AuthorizationsEvidenceInput,
  phase: string | null,
  blocking: ReadonlySet<string | null | undefined>
): boolean {
  if (
    record.Client_Opportunity_Record__c !== input.profile.opportunityId ||
    /initial consultation/i.test(record.Authorization_Type__c ?? '')
  )
    return false;
  if (!phase) return true;
  if (phase === 'Initial') return record.Authorization_Type__c === 'Initial';
  return (
    record.Authorization_Type__c === 'Treatment' ||
    (record.Authorization_Type__c === 'Treatment Auth Request' &&
      (Boolean(record.Treatment_Auth_Submission_Date__c) || blocking.has(record.Id)))
  );
}
function overallResolver(
  selected: readonly AuthorizationEvidenceRecord[],
  phase: string | null,
  resolution: AuthorizationGate | null
): string | null | undefined {
  if (phase === null) return null;
  const candidates = selected
    .map((record) => ({ record, coverage: evidenceAuthorizationCoverage(resolution, record) }))
    .filter(({ coverage }) => coverage?.satisfied)
    .sort(
      (left, right) =>
        new Date(
          resolvedEvidenceAuthorization(right.record, phase, right.coverage)?.approvalDate ?? 0
        ).valueOf() -
        new Date(
          resolvedEvidenceAuthorization(left.record, phase, left.coverage)?.approvalDate ?? 0
        ).valueOf()
    );
  return resolution?.satisfied ? candidates[0]?.record.Id : null;
}
export function authorizationEvidenceContext(
  input: AuthorizationsEvidenceInput
): AuthorizationEvidenceContext {
  const { gate, asOf } = input;
  const insuranceGate = categoryForGate(gate) === 'insurance';
  const phase = evidenceAuthorizationPhase(gate);
  const interpretationGate = insuranceGate
    ? gate
    : {
        ...gate,
        gateCategory: 'insurance',
        processPosition: `${phase ?? 'Current'} authorization context`,
        unresolvedGate: `Review the current ${(phase ?? 'authorization').toLowerCase()} authorization state`,
      };
  const blocking = new Set(
    [
      gate?.authorization?.authorizationId,
      gate?.authorization?.blockingRecordId,
      gate?.authorizationId,
      gate?.blockingRecordId,
    ].filter(Boolean)
  );
  // The approved source filters request rows before adding per-coverage IDs.
  const linked = (input.records ?? []).filter((record) =>
    relevantRecord(record, input, phase, blocking)
  );
  addCoverageIds(blocking, gate?.authorization);
  const current = blocking.size > 0 ? blocking : currentIds(linked, phase, asOf);
  const selected = current.size > 0 ? linked.filter((record) => current.has(record.Id)) : linked;
  const resolution = phase
    ? resolveAuthorizationGate({
        phase,
        asOf,
        authorizations: linked.map((record) => normalizeEvidenceAuthorization(record, asOf)),
      })
    : null;
  return {
    input,
    phase,
    insuranceGate,
    interpretationGate,
    selected,
    resolution,
    resolverId: overallResolver(selected, phase, resolution),
    noCurrentAuthorization: Boolean(phase) && resolution?.state === 'Missing' && current.size === 0,
  };
}
