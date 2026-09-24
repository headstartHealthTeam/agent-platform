import { deniedReviewDetails } from './narrative-denial.js';
import { conciseFact } from './narrative-text.js';
import type { NarrativeDenialContext, NarrativePacket } from './narrative-types.js';
import { humanDate } from './recommendation-date.js';
import {
  asSentence,
  cleanTerminalPunctuation,
  inlineFact,
  shortenSentence,
  truncate,
  withdrawnDenialClause,
} from './recommendation-text.js';

function secondDenialSummary(
  packet: NarrativePacket,
  denial: NarrativeDenialContext,
  date: string | null,
  phase: string
): string | null {
  const review = deniedReviewDetails(
    `${packet.newestUpdate?.fact ?? ''} ${denial.event?.fact ?? ''}`
  );
  if (!review.deniedAgain) return null;
  const decision = humanDate(denial.event?.date);
  const later = Boolean(decision && date && decision !== date);
  const state = later
    ? `${phase} remains denied after the ${String(decision)} ${review.kind} decision`
    : `${phase} was denied again after ${review.kind}`;
  return shortenSentence(
    `${String(date)}: ${state} because ${denial.reason}${review.newAuthorizationRequired ? '; any further request requires a new prior authorization' : '; a new authorization submission remains unconfirmed'}.`,
    254
  );
}

function progressSummary(
  packet: NarrativePacket,
  denial: NarrativeDenialContext,
  date: string | null,
  phase: string
): string | null {
  const types = [
    'auth-corrections-complete',
    'auth-resubmission-signature',
    'auth-denial-corrections',
    'auth-resubmitted-pending',
    'auth-appeal',
    'auth-overlap-remediation',
    'auth-state-fair-hearing',
    'family-document-update',
  ];
  const newest = packet.newestUpdate;
  if (!newest || !types.includes(newest.factType ?? '')) return null;
  const progress = conciseFact(newest.fact);
  if (!progress) return null;
  if (newest.factType === 'auth-overlap-remediation')
    return shortenSentence(
      `${String(date)}: After ${phase} denial for overlapping services, the prior authorization was reportedly cleared, but termination documentation is missing and ${phase} resubmission is unconfirmed.`,
      254
    );
  if (newest.factType === 'family-document-update')
    return shortenSentence(
      `${String(date)}: After ${phase} denial because ${denial.reason}, ${inlineFact(progress)}.`,
      254
    );
  const lifecycle =
    denial.lifecycle === 'Withdrawn'
      ? `${phase} was withdrawn because ${denial.reason}`
      : `${phase} remains denied because ${denial.reason}`;
  return truncate(`${date ? `${date}: ` : ''}${lifecycle}. ${asSentence(progress)}`, 254);
}

function lifecycleSummary(
  packet: NarrativePacket,
  denial: NarrativeDenialContext,
  date: string | null,
  phase: string
): string {
  if (denial.lifecycle === 'Withdrawn') return withdrawnDenialClause(phase, denial.reason);
  const decision = humanDate(
    denial.decisionDate ?? denial.decisionEvent?.date ?? denial.event?.date
  );
  const later = Boolean(
    packet.newestUpdate?.factType === 'auth-denied' && date && decision && date !== decision
  );
  const state = later
    ? `${phase} remained denied after the ${String(decision)} payer decision`
    : `${phase} was denied`;
  return `${state} because ${denial.reason}${denial.appealKind ? `; ${denial.appealKind} is pending` : ''}`;
}

export function denialShortSummary(
  packet: NarrativePacket,
  denial: NarrativeDenialContext
): string {
  const phase = /^IA\b/i.test(packet.stage) ? 'IA' : 'TA';
  const date = humanDate(packet.newestUpdate?.date ?? denial.event?.date);
  const second = secondDenialSummary(packet, denial, date, phase);
  if (second) return second;
  const progress = progressSummary(packet, denial, date, phase);
  if (progress) return progress;
  const action = denial.overlap
    ? 'Intake must confirm the prior authorization is terminated so Insurance Ops can request reprocessing'
    : packet.action.text
      ? cleanTerminalPunctuation(packet.action.text)
      : "Insurance Ops must document the payer's next action and follow-up date";
  return truncate(
    `${date ? `${date}: ` : ''}${lifecycleSummary(packet, denial, date, phase)}. ${action}.`,
    254
  );
}
