import { extractDenialReason } from './denial-reason.js';
import { complementaryAuthorizationProgress } from './narrative-evidence.js';
import { processPositionSentence } from './narrative-process.js';
import { nextStepSentence, sourceUpdateLead } from './narrative-state.js';
import { conciseFact } from './narrative-text.js';
import type { NarrativeDenialContext, NarrativeFact, NarrativePacket } from './narrative-types.js';
import { dateValue, humanDate } from './recommendation-date.js';
import { asInlineSentence, withdrawnDenialClause } from './recommendation-text.js';

const DENIAL_REASON = 'auth-denial-reason';
const AUTHORIZATION = 'Authorization';
const DENIED = 'auth-denied';

export function denialReasonContext(packet: NarrativePacket): NarrativeDenialContext | null {
  const authorization = packet.authorization ?? {};
  const gateText = `${String(packet.stage)} ${String(packet.processPosition)} ${String(packet.unresolvedGate)} ${packet.newestUpdate?.fact ?? ''} ${authorization.state ?? ''}`;
  const withdrawn = /\bwithdrawn\b/i.test(gateText);
  const activeDenial =
    /\bden(?:ied|ial)\b/i.test(gateText) ||
    withdrawn ||
    (authorization.denialOccurred &&
      /appeal|peer review|partial approval/i.test(authorization.state ?? ''));
  if (!/^(?:IA|TA)\b/i.test(String(packet.stage)) || !activeDenial) return null;
  const candidates = [
    packet.structuredGateDetail,
    packet.authoritativeEvidence,
    ...(packet.evidenceTimeline ?? []),
    ...(packet.supportingContext ?? []),
    ...(packet.story?.timeline ?? []),
  ].filter(
    (event): event is NarrativeFact =>
      Boolean(event) &&
      event?.factType === DENIAL_REASON &&
      Boolean(event.denialReason) &&
      ['Direct', 'Likely'].includes(event.matchQuality ?? '')
  );
  const selected =
    candidates.find((event) => event.source === AUTHORIZATION) ??
    candidates.find((event) => event.source === 'Slack') ??
    candidates[0];
  const decision =
    [
      packet.structuredGateDetail,
      packet.authoritativeEvidence,
      ...(packet.evidenceTimeline ?? []),
      ...(packet.story?.timeline ?? []),
    ]
      .filter(
        (event): event is NarrativeFact =>
          Boolean(event) &&
          [DENIED, DENIAL_REASON].includes(event?.factType ?? '') &&
          ['Direct', 'Likely'].includes(event?.matchQuality ?? '')
      )
      .sort(
        (left, right) =>
          Number(right.source === AUTHORIZATION) - Number(left.source === AUTHORIZATION) ||
          dateValue(right.date) - dateValue(left.date)
      )[0] ?? selected;
  const authorizationReason = extractDenialReason(
    `Denied because ${[authorization.denialExplanation, authorization.denialReason].find(Boolean) ?? ''}`
  );
  const reason = [selected?.denialReason, authorizationReason].find(Boolean);
  if (!reason) return null;
  return {
    reason,
    event: selected,
    decisionEvent: decision,
    decisionDate: decision?.date ?? selected?.date ?? null,
    appealKind: [authorization.appealKind, selected?.appealKind].find(Boolean) ?? null,
    overlap:
      /overlapping or duplicate services|overlapping authorization|active authorization.*different provider/i.test(
        reason
      ),
    lifecycle: withdrawn ? 'Withdrawn' : 'Denied',
  };
}

export function secondDenialAfterReviewEvent(packet: NarrativePacket): NarrativeFact | null {
  const priorities = new Map([
    [AUTHORIZATION, 6],
    ['Authorization Review', 5],
    ['SLA / Intake / On-Hold Notes', 5],
    ['Tasks / Task Chatter', 4],
    ['Calls / Texts', 4],
    ['Portal', 3],
    ['Slack', 2],
    ['Fireflies', 2],
  ]);
  return (
    [
      packet.newestUpdate,
      packet.structuredGateDetail,
      packet.authoritativeEvidence,
      ...(packet.evidenceTimeline ?? []),
      ...(packet.supportingContext ?? []),
      ...(packet.story?.timeline ?? []),
    ]
      .filter(
        (event): event is NarrativeFact =>
          Boolean(event) &&
          ['Direct', 'Likely'].includes(event?.matchQuality ?? '') &&
          /denied.*again after (?:reconsideration|appeal|peer review)/i.test(event?.fact ?? '')
      )
      .sort(
        (left, right) =>
          (priorities.get(right.source ?? '') ?? 1) - (priorities.get(left.source ?? '') ?? 1) ||
          dateValue(right.date) - dateValue(left.date)
      )[0] ?? null
  );
}

export function deniedReviewDetails(text: string): {
  readonly deniedAgain: boolean;
  readonly kind: string;
  readonly newAuthorizationRequired: boolean;
} {
  return {
    deniedAgain: /denied.*again after (?:reconsideration|appeal|peer review)/i.test(text),
    kind:
      /denied.*again after (reconsideration|appeal|peer review)/i.exec(text)?.[1]?.toLowerCase() ??
      'review',
    newAuthorizationRequired: /new prior authorization/i.test(text),
  };
}

function denialState(
  packet: NarrativePacket,
  denial: NarrativeDenialContext,
  deniedAgain: boolean,
  review: ReturnType<typeof deniedReviewDetails>,
  appeal: string | null
): string {
  const phase = /^IA\b/i.test(String(packet.stage)) ? 'IA' : 'TA';
  if (denial.lifecycle === 'Withdrawn') return withdrawnDenialClause(phase, denial.reason);
  if (deniedAgain)
    return `${phase} was denied again after ${review.kind} because ${denial.reason}${review.newAuthorizationRequired ? '; any further request requires a new prior authorization' : '; a new authorization submission remains unconfirmed'}`;
  const state = /partial(?:ly)?\s*approv/i.test(packet.authorization?.state ?? '')
    ? 'was partially approved; the payer denied the remaining scope because'
    : 'was denied because';
  return `${phase} ${state} ${denial.reason}${appeal ? `; ${appeal} is pending` : ''}`;
}

function denialProgressSentence(
  packet: NarrativePacket,
  denial: NarrativeDenialContext
): string | null {
  const newest = packet.newestUpdate;
  const types = new Set([
    'auth-corrections-complete',
    'auth-resubmitted-pending',
    'auth-appeal',
    'auth-overlap-family-outreach',
    'auth-prior-service-termination',
    'auth-denial-corrections',
    'auth-resubmission-signature',
    'auth-date-correction',
    'auth-overlap-remediation',
    'family-document-update',
    DENIAL_REASON,
    'auth-state-fair-hearing',
  ]);
  return newest && newest.id !== denial.event?.id && types.has(newest.factType ?? '')
    ? `${sourceUpdateLead({ asOf: packet.asOf, newestUpdate: newest })} ${asInlineSentence(conciseFact(newest.fact))}`
    : null;
}

function unresolvedDenialOutcome(deniedAgain: boolean, appeal: string | null): string {
  if (deniedAgain)
    return 'No corrected plan or new authorization submission is documented after the second denial.';
  return appeal
    ? `No later ${appeal} outcome or final payer determination is documented.`
    : 'No later correction, resubmission, or payer determination is documented.';
}

export function denialOperationalSummary(
  packet: NarrativePacket,
  denial: NarrativeDenialContext
): string {
  const denialDate = humanDate(
    denial.decisionDate ??
      denial.decisionEvent?.date ??
      denial.event?.date ??
      packet.newestUpdate?.date
  );
  const second = secondDenialAfterReviewEvent(packet);
  const review = deniedReviewDetails(
    `${packet.newestUpdate?.fact ?? ''} ${second?.fact ?? ''} ${denial.event?.fact ?? ''}`
  );
  const deniedAgain = Boolean(second) || review.deniedAgain;
  const secondDate = humanDate(second?.date ?? denial.event?.date);
  const hearing =
    packet.newestUpdate?.factType === 'auth-state-fair-hearing' ||
    /state[- ]fair hearing/i.test(packet.newestUpdate?.fact ?? '');
  const appeal = hearing ? null : denial.appealKind;
  const state = denialState(packet, denial, deniedAgain, review, appeal);
  const newest = packet.newestUpdate;
  const confirmation =
    deniedAgain && newest && newest.id !== denial.event?.id && newest.factType === DENIED
      ? `${sourceUpdateLead({ asOf: packet.asOf, newestUpdate: newest })} no new authorization submission was confirmed after the second denial.`
      : null;
  const progress = denialProgressSentence(packet, denial);
  const complementary = complementaryAuthorizationProgress(packet);
  const complementarySentence = complementary
    ? `The same-day provider update adds that ${asInlineSentence(conciseFact(complementary.fact))}`
    : null;
  const conflict = packet.conflicts.some((value) =>
    /later source reports .*pending|record still says pending|review is .*pending/i.test(value)
  )
    ? 'A later record still says pending, so Insurance Ops must reconcile the controlling payer status before the SLA is finalized.'
    : null;
  const unresolved =
    !progress && !complementarySentence && !conflict
      ? unresolvedDenialOutcome(deniedAgain, appeal)
      : null;
  const date = deniedAgain && secondDate ? secondDate : denialDate;
  return [
    processPositionSentence(packet),
    `${date ? `On ${date}, ` : ''}${state}.`,
    confirmation,
    progress,
    complementarySentence,
    conflict,
    unresolved,
    nextStepSentence(packet),
  ]
    .filter(Boolean)
    .join(' ');
}
