import {
  authorizationEvidenceIdentity,
  authorizationNoteLines,
} from './authorization-evidence-common.js';
import {
  evidenceCoverageLabel,
  unresolvedCoverageAction,
  unresolvedCoverageText,
} from './authorization-evidence-coverage.js';
import type {
  AuthorizationEvidenceContext,
  AuthorizationEvidenceEvent,
  AuthorizationEvidenceIdentity,
  AuthorizationEvidenceRecord,
  ResolvedAuthorizationEvidence,
} from './authorization-evidence-types.js';
import { interpretConversation } from './conversation-interpretation.js';
import { isoDate } from './dates.js';
import { createEvidenceEvent } from './evidence.js';
import { firstEvidenceText, requiredEvidenceValue } from './source-evidence-context.js';
import type { DatedTaskLine } from './source-task-dates.js';

interface ResolutionContext {
  readonly context: AuthorizationEvidenceContext;
  readonly record: AuthorizationEvidenceRecord;
  readonly phase: string;
  readonly state: ResolvedAuthorizationEvidence;
  readonly overall: boolean;
  readonly unresolved: string | null;
  readonly label: string;
  readonly payer: string | null | undefined;
  readonly date: string | null;
}
type ResolvedEvent = Omit<AuthorizationEvidenceEvent, 'matchedIdentities'> & {
  readonly matchedIdentities: readonly AuthorizationEvidenceIdentity[];
};
function resolutionNarrative(
  input: ResolutionContext
): Pick<
  AuthorizationEvidenceEvent,
  'text' | 'gateImpact' | 'actionOwner' | 'actionType' | 'recommendedAction'
> {
  const { context, phase, state, overall, unresolved, label, payer, date } = input;
  if (overall)
    return {
      text:
        context.resolution?.coverages?.length === 1
          ? state.text
          : `All current ${phase.toLowerCase()} authorization prerequisites were satisfied as of ${String(isoDate(state.approvalDate))}.`,
      gateImpact: `${phase} authorization prerequisite is satisfied`,
      actionOwner: 'Insurance Ops',
      actionType: 'No Action',
      recommendedAction:
        'Insurance Ops: no payer follow-up is required for the satisfied authorization prerequisite.',
    };
  const resolvedText = state.noAuthNeeded
    ? `${firstEvidenceText(payer) ?? `The ${label} payer`} does not require prior authorization for ${label} ${phase.toLowerCase()} coverage`
    : `The ${label} ${phase.toLowerCase()} authorization${payer ? ` with ${payer}` : ''} was approved on ${String(date)}`;
  const action = unresolvedCoverageAction(context.resolution, phase);
  return {
    text: unresolved ? `${resolvedText}, but ${unresolved}.` : `${resolvedText}.`,
    gateImpact: `${phase} authorization remains unresolved across current insurance positions`,
    actionOwner: action.owner,
    actionType: action.type,
    recommendedAction: action.text,
  };
}
function resolvedEvent(input: ResolutionContext): ResolvedEvent {
  const { context, record, state, phase, overall } = input;
  const issueKey = phase === 'Initial' ? 'initial-authorization' : 'treatment-authorization';
  return createEvidenceEvent({
    opportunityId: context.input.profile.opportunityId,
    source: 'Authorization',
    sourceRecordId: record.Id,
    eventDate: requiredEvidenceValue(state.approvalDate, 'eventDate'),
    category: issueKey,
    issueKey,
    ...resolutionNarrative(input),
    rawText: null,
    matchedIdentities: authorizationEvidenceIdentity(record, context.input),
    matchQuality: 'Direct',
    substantive: true,
    relationship: 'Supports',
    processRelevance: context.insuranceGate ? 11 : 7,
    factType: overall ? state.factType : 'auth-coverage-satisfied',
    lifecycleRecordId: record.Id,
  });
}
function confirmationEvent(
  input: ResolutionContext,
  event: ResolvedEvent,
  note: DatedTaskLine,
  index: number
): AuthorizationEvidenceEvent {
  const { context, record, phase, overall, payer, label, date, unresolved, state } = input;
  const confirmationDate = String(isoDate(note.eventDate));
  const text = overall
    ? `The payer confirmed on ${confirmationDate} that the current ${phase.toLowerCase()} authorization was approved on ${String(date)}.`
    : `${firstEvidenceText(payer) ?? `The ${label} payer`} confirmed on ${confirmationDate} that the ${label} ${phase.toLowerCase()} authorization was approved on ${String(date)}, but ${String(unresolved)}.`;
  return createEvidenceEvent({
    opportunityId: context.input.profile.opportunityId,
    source: 'Authorization',
    sourceRecordId: `${record.Id}:note:${String(index + 1)}`,
    eventDate: note.eventDate,
    category: event.category,
    issueKey: event.issueKey,
    text,
    rawText: null,
    matchedIdentities: event.matchedIdentities,
    matchQuality: 'Direct',
    substantive: true,
    relationship: 'Supports',
    processRelevance: context.insuranceGate ? 11 : 7,
    factType: overall ? state.factType : 'auth-coverage-satisfied',
    gateImpact: event.gateImpact,
    actionOwner: event.actionOwner,
    actionType: event.actionType,
    recommendedAction: event.recommendedAction,
    lifecycleRecordId: record.Id,
  });
}
function postApprovalEvents(
  input: ResolutionContext,
  event: ResolvedEvent
): AuthorizationEvidenceEvent[] {
  const { context, record, state } = input;
  const approvalTime = new Date(
    state.approvalDate === null ? 0 : (state.approvalDate ?? NaN)
  ).valueOf();
  return authorizationNoteLines(record, context.input.asOf).flatMap((note, index) => {
    if (new Date(note.eventDate).valueOf() <= approvalTime) return [];
    const confirms =
      /\bapproved\b/i.test(note.text) &&
      !/not approved|denied|effective.{0,30}(?:correct|change)|start date.{0,30}(?:correct|change)|cannot.{0,30}(?:change|backdate)/i.test(
        note.text
      );
    if (confirms) return [confirmationEvent(input, event, note, index)];
    return interpretConversation({
      opportunityId: context.input.profile.opportunityId,
      source: 'Authorization',
      sourceRecordId: `${record.Id}:note:${String(index + 1)}`,
      eventDate: note.eventDate,
      text: `Authorization update: ${note.text}`,
      rawText: note.text,
      matchQuality: 'Direct',
      gate: context.interpretationGate,
      asOf: context.input.asOf,
      matchedIdentities: event.matchedIdentities,
    }).map((item) => ({
      ...item,
      lifecycleRecordId: record.Id,
      processRelevance: context.insuranceGate
        ? item.processRelevance
        : Math.min(item.processRelevance, 7),
    }));
  });
}
export function resolvedAuthorizationEvents(
  context: AuthorizationEvidenceContext,
  record: AuthorizationEvidenceRecord,
  phase: string,
  state: ResolvedAuthorizationEvidence
): AuthorizationEvidenceEvent[] {
  const satisfied = context.resolution?.satisfied === true;
  const overall = satisfied && record.Id === context.resolverId;
  if (satisfied && !overall) return [];
  const input: ResolutionContext = {
    context,
    record,
    phase,
    state,
    overall,
    unresolved: unresolvedCoverageText(context.resolution, phase),
    label: evidenceCoverageLabel(record),
    payer: record.Payor_Name__r?.Name ?? record.Payor_Name__c,
    date: isoDate(state.approvalDate),
  };
  const event = resolvedEvent(input);
  return [event, ...postApprovalEvents(input, event)];
}
