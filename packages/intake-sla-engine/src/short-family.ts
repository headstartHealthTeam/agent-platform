import { categoryForGate } from './gate-context.js';
import type { NarrativePacket } from './narrative-types.js';
import { dateValue, humanDate } from './recommendation-date.js';
import { truncate } from './recommendation-text.js';

export function familyShortSummary(packet: NarrativePacket): string | null {
  if (packet.story?.currentGateIssueKey !== 'family-availability') return null;
  const family = [...(packet.story.timeline ?? [])]
    .filter(
      (event) =>
        event.issueKey === 'family-availability' &&
        ['Direct', 'Likely'].includes(event.matchQuality ?? '') &&
        event.substantive
    )
    .sort((left, right) => dateValue(right.eventDate) - dateValue(left.eventDate))[0];
  const date = humanDate(family?.eventDate ?? packet.newestUpdate?.date);
  const prefix = date ? `${date}: ` : '';
  const owner = packet.action.owner ?? packet.csm ?? 'CSM';
  if (packet.newestUpdate?.factType === 'family-unresponsive') {
    const coverage = /coverage is inactive/i.test(packet.newestUpdate.fact)
      ? ' and insurance coverage is inactive'
      : '';
    return truncate(
      `${prefix}The family remains unresponsive${coverage}, so the current intake and clinical milestone cannot advance. ${owner} must confirm continued interest${coverage ? ' and active coverage' : ''} before work resumes.`,
      254
    );
  }
  if (/97151 Started|Treatment Plan/i.test(packet.stage))
    return truncate(
      `${prefix}Family availability or custody constraints are preventing treatment-plan progress and the next clinical milestone. ${owner} must confirm whether intake can proceed on a workable schedule.`,
      254
    );
  if (/IA Approved|IA Scheduled|IC Completed/i.test(packet.stage))
    return truncate(
      `${prefix}Family availability or custody constraints are preventing a confirmed initial-assessment plan. ${owner} must confirm whether and when the IA can proceed.`,
      254
    );
  if (
    packet.structuredGateDetail?.factType === 'rbt-lost' &&
    /cancel(?:ed|led)|client fell through|no longer need hiring/i.test(
      packet.structuredGateDetail.fact
    )
  )
    return truncate(
      `${prefix}Family availability is preventing a workable service schedule, and the RBT request was canceled because the client fell through. ${owner} must confirm whether services will proceed before staffing restarts.`,
      254
    );
  return truncate(
    `${prefix}Family availability or custody constraints are preventing a workable service schedule; RBT staffing and the first 97153 remain unconfirmed. ${owner} must confirm whether services can proceed.`,
    254
  );
}

export function clearedAuthorizationShortSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (
    !newest ||
    !['auth-approved', 'auth-no-auth-needed'].includes(newest.factType ?? '') ||
    ['initial-authorization', 'treatment-authorization'].includes(
      packet.story?.currentGateIssueKey ?? ''
    )
  )
    return null;
  const date = String(humanDate(newest.date));
  const owner = [packet.action.owner, packet.csm].find(Boolean) ?? 'The CSM';
  const category = categoryForGate(packet);
  if (category === 'intakeScheduling')
    return truncate(
      `${date}: Initial authorization is cleared. No scheduled or completed IA date is documented; ${owner} must confirm the provider's IA plan and record the date.`,
      254
    );
  if (category === 'treatmentPlan')
    return truncate(
      `${date}: The initial-authorization prerequisite is cleared, but no current treatment-plan milestone is documented. ${owner} must confirm the plan status and submission timing.`,
      254
    );
  if (category === 'rbt')
    return truncate(
      `${date}: Treatment authorization is cleared, but staffing and the first 97153 date are not confirmed. ${owner} must confirm RBT coverage and the agreed start date.`,
      254
    );
  return null;
}
