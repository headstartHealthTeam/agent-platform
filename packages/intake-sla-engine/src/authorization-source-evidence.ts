import {
  evidenceAuthorizationCoverage,
  resolvedEvidenceAuthorization,
} from './authorization-evidence-coverage.js';
import { resolvedAuthorizationEvents } from './authorization-evidence-resolved.js';
import { authorizationEvidenceContext } from './authorization-evidence-selection.js';
import type {
  AuthorizationEvidenceEvent,
  AuthorizationsEvidenceInput,
} from './authorization-evidence-types.js';
import {
  expiredAuthorizationEvent,
  unresolvedAuthorizationEvents,
} from './authorization-evidence-unresolved.js';

/** Existing workflow evidence adapter; this does not repair Salesforce or replace prerequisite selection. */
export function adaptAuthorizations(
  input: AuthorizationsEvidenceInput
): AuthorizationEvidenceEvent[] {
  const context = authorizationEvidenceContext(input);
  return context.selected.flatMap((record) => {
    const expired = expiredAuthorizationEvent(context, record);
    if (expired !== null) return expired;
    const coverage = evidenceAuthorizationCoverage(context.resolution, record);
    if (context.phase !== null) {
      const resolved = resolvedEvidenceAuthorization(record, context.phase, coverage);
      if (resolved !== null)
        return resolvedAuthorizationEvents(context, record, context.phase, resolved);
    }
    return unresolvedAuthorizationEvents(context, record);
  });
}
