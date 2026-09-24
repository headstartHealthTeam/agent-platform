import { isoDate } from './dates.js';
import { rbtCurrentState } from './narrative-state.js';
import { conciseFact, inlineClause } from './narrative-text.js';
import type { NarrativePacket } from './narrative-types.js';
import {
  assignedRbtName,
  candidateStepSentence,
  selectedRbtCandidate,
} from './recommendation-candidate.js';
import { humanDate } from './recommendation-date.js';
import { capitalize, truncate } from './recommendation-text.js';

export function pausedStaffingShortSummary(packet: NarrativePacket): string | null {
  const detail = packet.structuredGateDetail;
  if (
    !/ta approved/i.test(packet.stage) ||
    detail?.factType !== 'rbt-recruiting' ||
    !/paused|on hold/i.test(detail.fact)
  )
    return null;
  const date = humanDate(packet.newestUpdate?.date ?? detail.date);
  const inactive =
    packet.newestUpdate?.factType === 'rbt-lost' && packet.newestUpdate.candidateName
      ? `${packet.newestUpdate.candidateName} left the active candidate path. `
      : '';
  return truncate(
    `${date ? `${date}: ` : ''}${inactive}The RBT request remains paused with no confirmed assignment or first 97153 date. RBT Team must document why recruiting is paused and confirm the next staffing path.`,
    254
  );
}

function conversationSummary(packet: NarrativePacket, assigned: string | null): string | null {
  const newest = packet.newestUpdate;
  if (
    !newest ||
    ![
      'treatment-start-planned',
      'treatment-start-conditional',
      'treatment-start-coordination',
      'treatment-ready-to-schedule',
      'provider-unresponsive',
      'provider-viability',
    ].includes(newest.factType ?? '')
  )
    return null;
  const date = humanDate(newest.date);
  const fact = inlineClause(conciseFact(newest.fact));
  const action = inlineClause(
    [packet.action.text].find(Boolean) ?? 'the responsible owner must confirm the first 97153 plan'
  );
  return truncate(
    `${date ? `${date}: ` : ''}${assigned ? `${assigned} is assigned. ` : ''}${capitalize(fact)}. ${capitalize(action)}.`,
    254
  );
}

function namedCandidateSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (newest?.factType !== 'rbt-candidate' || !newest.candidateName) return null;
  const date = humanDate(newest.date);
  const step = candidateStepSentence(newest);
  const milestone = packet.futureMilestones?.find((event) =>
    /first 97153|start/i.test(`${event.fact} ${event.gateImpact ?? ''}`)
  );
  const planned = humanDate(milestone?.milestoneDate);
  return truncate(
    `${date ? `${date}: ` : ''}${newest.candidateName} ${step}. ${planned ? `The family tentatively requested ${planned}, but staffing and the first 97153 remain unconfirmed.` : 'Staffing and the first 97153 remain unconfirmed.'}`,
    254
  );
}

function assignedSummary(packet: NarrativePacket, assigned: string): string {
  const assignedDate = humanDate(packet.structuredGateDetail?.date);
  const date = humanDate(packet.newestUpdate?.date ?? packet.structuredGateDetail?.date);
  const planned = humanDate(packet.structuredGateDetail?.milestoneDate);
  const plannedIso = isoDate(packet.structuredGateDetail?.milestoneDate);
  const asOf = isoDate(packet.asOf ?? new Date().toISOString());
  const passed = plannedIso !== null && asOf !== null && plannedIso < asOf;
  const timing = assignedDate && assignedDate !== date ? ` on ${assignedDate}` : '';
  const status = planned
    ? passed
      ? ` The planned ${planned} start passed without a confirmed first 97153.`
      : ` The first 97153 is planned for ${planned} but is not yet recorded in Salesforce.`
    : ' The first 97153 date is not yet recorded in Salesforce.';
  const owner = [packet.action.owner].find(Boolean) ?? 'The CSM';
  const action = passed
    ? `${owner} must verify the actual start or replacement date.`
    : plannedIso
      ? `${owner} must ensure the appointment is entered and monitor completion.`
      : `${owner} must confirm the start date.`;
  return truncate(
    `${date ? `${date}: ` : ''}${assigned} was assigned${timing}; TA is approved.${status} ${action}`,
    254
  );
}

function selectedCandidateSummary(packet: NarrativePacket): string | null {
  const detail = packet.structuredGateDetail;
  const candidate = selectedRbtCandidate(detail);
  if (!candidate || !detail) return null;
  const candidateDate = humanDate(detail.date);
  const date = humanDate(packet.newestUpdate?.date ?? detail.date);
  const planned = humanDate(detail.milestoneDate);
  const step = detail.candidateStep ?? '';
  const state = /hired/i.test(step)
    ? 'is hired and proposed to this case'
    : /matched|accepted/i.test(step)
      ? 'is matched to this case'
      : 'is selected in the candidate pipeline';
  return truncate(
    `${date ? `${date}: ` : ''}${rbtCurrentState(packet)} ${candidate} ${state}${candidateDate && candidateDate !== date ? ` as of ${candidateDate}` : ''}${planned ? ` with an earliest start of ${planned}` : ''}; assignment and first 97153 remain unconfirmed.`,
    254
  );
}

function structuredCandidateSummary(packet: NarrativePacket): string | null {
  const detail = packet.structuredGateDetail;
  if (!detail?.candidateName || !['rbt-candidate', 'rbt-lost'].includes(detail.factType ?? ''))
    return null;
  const date = humanDate(packet.newestUpdate?.date ?? detail.date);
  const candidateDate = humanDate(detail.date);
  const state =
    detail.factType === 'rbt-lost'
      ? `${detail.candidateName} left the active candidate path${candidateDate ? ` on ${candidateDate}` : ''}`
      : `${detail.candidateName} ${candidateStepSentence(detail)}${candidateDate && candidateDate !== date ? ` as of ${candidateDate}` : ''}`;
  return truncate(
    `${date ? `${date}: ` : ''}${rbtCurrentState(packet)} ${state}; assignment and first 97153 remain unconfirmed.`,
    254
  );
}

export function staffingShortSummary(packet: NarrativePacket): string | null {
  if (!/ta approved/i.test(packet.stage)) return null;
  const assigned = assignedRbtName(packet.structuredGateDetail);
  const conversation = conversationSummary(packet, assigned);
  if (conversation) return conversation;
  const candidate = namedCandidateSummary(packet);
  if (candidate) return candidate;
  if (assigned) return assignedSummary(packet, assigned);
  return selectedCandidateSummary(packet) ?? structuredCandidateSummary(packet);
}
