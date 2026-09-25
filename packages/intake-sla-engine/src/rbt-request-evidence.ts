import { isoDate, nextBusinessDay } from './dates.js';
import type { EvidenceDate } from './evidence.js';
import { categoryForGate } from './gate-context.js';
import {
  evidenceOwner,
  firstEvidenceDate,
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import { RBT_TEAM, RBT_FOLLOW_UP, staffingDisplayName } from './staffing-evidence-common.js';
import {
  structuredEvidenceEvent,
  type StructuredEvidenceEvent,
  type StructuredEvidenceInput,
} from './structured-evidence.js';

const PROVIDER_OUTREACH = 'Provider Outreach';

type RequestField =
  | 'Id'
  | 'Date_Closed__c'
  | 'RBT_Recruitment_Funnel__c'
  | 'Request_Cancellation_Reason__c'
  | 'RBT_Start_Date__c'
  | 'Est_Care_Start_Date__c'
  | 'Recruiting_Launched_Status__c'
  | 'LastModifiedDate'
  | 'CreatedDate'
  | 'RBT_Assigned__c';
export type RbtRequestEvidenceRecord = Readonly<
  Partial<Record<RequestField, string | null | undefined>>
> & {
  readonly RBT_Assigned__r?: { readonly Name?: string | null | undefined } | null | undefined;
  readonly Total_Screened_Candidates__c?: unknown;
  readonly Active_Candidates__c?: unknown;
  readonly Proposed_Candidates__c?: unknown;
  readonly Matched_Candidates__c?: unknown;
};
export interface RbtRequestEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly RbtRequestEvidenceRecord[] | null;
}
interface RequestState {
  readonly record: RbtRequestEvidenceRecord;
  readonly input: RbtRequestEvidenceInput;
  readonly assigned: string;
  readonly startDate: string | null;
  readonly status: string;
  readonly eventDate: EvidenceDate;
}
type RequestDecision = Omit<
  StructuredEvidenceInput,
  'opportunityId' | 'source' | 'sourceRecordId' | 'eventDate' | 'category'
>;
function requestState(
  record: RbtRequestEvidenceRecord,
  input: RbtRequestEvidenceInput
): RequestState {
  const rawStart = firstEvidenceText(record.RBT_Start_Date__c, record.Est_Care_Start_Date__c);
  return {
    record,
    input,
    assigned: staffingDisplayName(record.RBT_Assigned__r?.Name),
    startDate: rawStart && new Date(rawStart).getUTCFullYear() >= 2000 ? rawStart : null,
    status:
      firstEvidenceText(record.RBT_Recruitment_Funnel__c, record.Recruiting_Launched_Status__c) ??
      (record.Date_Closed__c ? 'Closed' : 'Open'),
    // A later automation-only modification must not refresh a closed staffing plan.
    eventDate:
      latestEvidenceDate(
        firstEvidenceText(record.Date_Closed__c, record.LastModifiedDate, record.CreatedDate)
      ) ?? input.asOf,
  };
}
function laterOpenRequest(
  state: RequestState,
  open: readonly RbtRequestEvidenceRecord[]
): RbtRequestEvidenceRecord | undefined {
  const { record } = state;
  if (!record.Date_Closed__c) return undefined;
  return open
    .filter(
      (candidate) =>
        new Date(candidate.CreatedDate ?? 0).valueOf() >
        new Date(record.Date_Closed__c ?? record.CreatedDate ?? 0).valueOf()
    )
    .sort(
      (left, right) =>
        new Date(right.CreatedDate ?? 0).valueOf() - new Date(left.CreatedDate ?? 0).valueOf()
    )[0];
}
function replacementEvent(
  state: RequestState,
  replacement: RbtRequestEvidenceRecord
): StructuredEvidenceEvent {
  const { record, input, assigned } = state;
  return structuredEvidenceEvent({
    opportunityId: input.profile.opportunityId,
    source: 'RBT Request',
    sourceRecordId: `${String(record.Id)}:${String(replacement.Id)}`,
    eventDate: firstEvidenceDate(replacement.CreatedDate, state.eventDate) ?? '',
    category: 'rbt',
    text: `The prior RBT assignment${assigned ? ` to ${assigned}` : ''} closed on ${String(isoDate(record.Date_Closed__c))}; a replacement request opened on ${String(isoDate(replacement.CreatedDate))} and has no confirmed assignment or first 97153 date.`,
    gateImpact: 'Prior RBT coverage was superseded; replacement staffing is required',
    actionOwner: RBT_TEAM,
    actionType: RBT_FOLLOW_UP,
    recommendedAction:
      'RBT Team to identify the leading replacement candidate, document the exact candidate step, and confirm the expected staffing date.',
    processRelevance: 11,
    factType: 'rbt-lost',
    candidateName: assigned || null,
    candidateActive: false,
  });
}
function plannedStart(state: RequestState): RequestDecision {
  const { assigned, input } = state;
  const date = isoDate(state.startDate);
  const cutoff = isoDate(input.asOf);
  const passed = date !== null && cutoff !== null && date < cutoff;
  const owner = evidenceOwner(input.profile);
  return {
    text: passed
      ? `${assigned ? `${assigned} was assigned with` : 'The RBT request recorded'} a planned care start of ${date}, but that date passed without confirmation of the first 97153 service.`
      : `${assigned ? `${assigned} is assigned and` : 'The RBT request'} records an expected care start of ${String(date)}, but no first 97153 appointment is recorded in Salesforce; it has not yet been entered in Aloha.`,
    gateImpact: passed
      ? `The planned ${date} start passed without confirmation`
      : `RBT coverage is identified with a planned start of ${String(date)}`,
    actionOwner: owner,
    actionType: passed ? PROVIDER_OUTREACH : 'Monitor',
    recommendedAction: passed
      ? `${owner} to confirm whether the planned ${date} start occurred and document the current staffing and first-service status.`
      : `${owner} to ensure the ${String(date)} first 97153 appointment is entered in Aloha, confirm it syncs to Salesforce, and verify completion after the service date.`,
    processRelevance: passed ? 9 : 10,
    milestoneDate: date,
    followUpDate: passed ? nextBusinessDay(input.asOf) : date,
    factType: 'treatment-start-planned',
    candidateName: assigned || null,
    candidateActive: assigned ? true : null,
  };
}
function assignedRequest(state: RequestState): RequestDecision {
  const owner = evidenceOwner(state.input.profile);
  return {
    text: `${state.assigned} is assigned on the RBT request, but no first 97153 date is recorded.`,
    gateImpact: 'RBT assigned; first 97153 scheduling remains unconfirmed',
    actionOwner: owner,
    actionType: PROVIDER_OUTREACH,
    recommendedAction: `${owner} to confirm the agreed first 97153 date with the provider and ensure the appointment is entered in Aloha and synced to Salesforce.`,
    processRelevance: 10,
    factType: 'rbt-assigned',
    candidateName: state.assigned,
    candidateActive: true,
  };
}
function canceledRequest(state: RequestState): RequestDecision {
  const reason = sourceHtmlText(state.record.Request_Cancellation_Reason__c ?? '');
  const restored =
    /can cover|coverage (?:is )?(?:available|confirmed|restored)|existing rbt|already staffed/i.test(
      reason
    );
  const owner = restored ? evidenceOwner(state.input.profile) : RBT_TEAM;
  return {
    text: restored
      ? 'The replacement RBT request was canceled because existing coverage can handle the shift; the first 97153 appointment still is not confirmed in Salesforce.'
      : `The RBT request is ${state.status.toLowerCase()}${reason ? ` because ${reason}` : ''}; no replacement coverage or start date is confirmed.`,
    gateImpact: restored
      ? 'RBT coverage is available; first 97153 scheduling remains unconfirmed'
      : 'RBT coverage fell through and restaffing is required',
    actionOwner: owner,
    actionType: restored ? PROVIDER_OUTREACH : RBT_FOLLOW_UP,
    recommendedAction: restored
      ? `${owner} to confirm the agreed first 97153 date and ensure the appointment is entered in Aloha and synced to Salesforce.`
      : 'RBT Team to confirm whether a replacement request is active and document the strongest candidate and expected staffing date.',
    processRelevance: restored ? 11 : 9,
    factType: restored ? 'rbt-assigned' : 'rbt-lost',
    rawText: reason || null,
  };
}
function candidateCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}
function replacesPriorAssignment(state: RequestState): boolean {
  const { record, input } = state;
  return (
    !record.Date_Closed__c &&
    (input.records ?? []).some(
      (candidate) =>
        candidate.Id !== record.Id &&
        Boolean(candidate.Date_Closed__c) &&
        (Boolean(candidate.RBT_Assigned__c) || Boolean(candidate.RBT_Assigned__r?.Name)) &&
        new Date(candidate.Date_Closed__c ?? '').valueOf() <=
          new Date(record.CreatedDate ?? record.LastModifiedDate ?? input.asOf).valueOf()
    )
  );
}
function recruitingRequest(state: RequestState): RequestDecision {
  const { record } = state;
  const counts: readonly (readonly [number | null, string])[] = [
    [candidateCount(record.Total_Screened_Candidates__c), 'screened'],
    [candidateCount(record.Active_Candidates__c), 'active'],
    [candidateCount(record.Proposed_Candidates__c), 'proposed'],
    [candidateCount(record.Matched_Candidates__c), 'matched'],
  ];
  const parts = counts.flatMap(([count, label]) =>
    count === null ? [] : [`${String(count)} ${label}`]
  );
  const hasProgress = counts.slice(1).reduce<number>((sum, [count]) => sum + (count ?? 0), 0) > 0;
  const summary = parts.length ? parts.join(', ') : 'candidate counts are not recorded';
  const label = replacesPriorAssignment(state) ? 'Replacement RBT recruiting' : 'RBT recruiting';
  const paused = /paused|on hold/i.test(state.status);
  return {
    text: paused
      ? `The RBT request is paused; ${summary}. No current assignment or start date is confirmed.`
      : `${label} is active; ${summary}. No candidate assignment or start date is confirmed.`,
    gateImpact: paused
      ? 'RBT recruiting is paused without confirmed staffing'
      : hasProgress
        ? 'RBT candidates are progressing but staffing is not confirmed'
        : 'RBT recruiting remains open with no confirmed candidate or start',
    actionOwner: RBT_TEAM,
    actionType: RBT_FOLLOW_UP,
    recommendedAction: paused
      ? 'RBT Team to document why the request is paused and either resume recruiting or confirm the current staffing path.'
      : hasProgress
        ? "RBT Team to confirm the leading candidate's next step, decision date, and expected start date."
        : 'RBT Team to document current sourcing progress and the next expected candidate milestone.',
    processRelevance: paused ? 11 : 10,
    factType: paused || !hasProgress ? 'rbt-recruiting' : 'rbt-candidate',
  };
}
function requestDecision(state: RequestState): RequestDecision {
  if (state.startDate) return plannedStart(state);
  if (state.assigned) return assignedRequest(state);
  if (
    /cancel|withdraw|declin/i.test(
      `${state.status} ${state.record.Request_Cancellation_Reason__c ?? ''}`
    )
  )
    return canceledRequest(state);
  return recruitingRequest(state);
}
export function adaptRbtRequests(input: RbtRequestEvidenceInput): StructuredEvidenceEvent[] {
  if (categoryForGate(input.gate) !== 'rbt') return [];
  const records = input.records ?? [];
  const open = records.filter(
    (record) =>
      !record.Date_Closed__c &&
      !/cancel|withdraw|declin/i.test(
        `${record.RBT_Recruitment_Funnel__c ?? ''} ${record.Request_Cancellation_Reason__c ?? ''}`
      )
  );
  return records.map((record) => {
    const state = requestState(record, input);
    const replacement = laterOpenRequest(state, open);
    if (replacement && (state.assigned || state.startDate))
      return replacementEvent(state, replacement);
    const decision = requestDecision(state);
    return structuredEvidenceEvent({
      opportunityId: input.profile.opportunityId,
      source: 'RBT Request',
      sourceRecordId: requiredEvidenceValue(record.Id, 'sourceRecordId'),
      eventDate: state.eventDate,
      category: 'rbt',
      ...decision,
    });
  });
}
