import { denialReasonContext } from './narrative-denial.js';
import { humanizeConflict } from './narrative-text.js';
import type { NarrativePacket } from './narrative-types.js';
import { humanDate } from './recommendation-date.js';
import { truncate, withdrawnDenialClause } from './recommendation-text.js';

export function shortConflictSummary(packet: NarrativePacket): string | null {
  const conflict = packet.conflicts.map(humanizeConflict).find(Boolean);
  if (!conflict) return null;
  const date = humanDate(packet.newestUpdate?.date);
  const prefix = date ? `${date}: ` : '';
  const authorization = denialReasonContext(packet);
  if (
    authorization &&
    /authorization remains pending|review is .*pending|later source reports .*pending/i.test(
      conflict
    )
  ) {
    const phase = /^IA\b/i.test(String(packet.stage)) ? 'IA' : 'TA';
    const state =
      authorization.lifecycle === 'Withdrawn'
        ? withdrawnDenialClause(phase, authorization.reason)
        : `${phase} was denied because ${authorization.reason}`;
    return truncate(
      `${prefix}${state}, but a later record still says pending. Insurance Ops must confirm the controlling payer status and next action.`,
      254
    );
  }
  if (
    /initial review is existing\s*\/\s*no auth needed\s*\/\s*active/i.test(conflict) &&
    /later source reports .*authorization remains pending/i.test(conflict)
  )
    return truncate(
      `${prefix}Initial authorization is pending, but Authorization Review says no initial authorization is needed and the record is active. Insurance Ops must reconcile the controlling status before IA.`,
      254
    );
  if (
    /treatment review is auth created\s*\/\s*approved\s*\/\s*active/i.test(conflict) &&
    /later source reports .*authorization remains pending/i.test(conflict)
  )
    return truncate(
      `${prefix}Treatment authorization is pending, but Authorization Review says it is approved and active. Insurance Ops must reconcile the controlling status before treatment starts.`,
      254
    );
  if (
    /(?:payer denied the authorization|authorization (?:is|was) denied)/i.test(conflict) &&
    /later source reports .*authorization remains pending/i.test(conflict)
  )
    return truncate(
      `${prefix}The authorization record is pending, but an earlier update says it was denied and no resubmission is documented. Insurance Ops must confirm the controlling payer status and next action.`,
      254
    );
  if (/current gate is resolved.*Opportunity remains in Insurance Verification/i.test(conflict))
    return truncate(
      `${prefix}VOB and eligibility are complete, but the Opportunity remains in Insurance Verification and no remaining prerequisite is documented. Insurance Ops must identify the unresolved readiness item.`,
      254
    );
  return truncate(
    `${prefix}Records conflict: ${conflict}. ${packet.action.owner ?? 'The responsible team'} must verify the controlling status before the SLA is updated.`,
    254
  );
}
