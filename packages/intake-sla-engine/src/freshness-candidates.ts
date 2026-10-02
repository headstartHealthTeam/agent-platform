import type { DateValue } from './dates.js';
import type { FreshnessCandidateSummary, FreshnessFamily } from './freshness-candidate-types.js';
import type { FreshnessInput } from './freshness-source-types.js';
import { freshnessText, freshnessTimestamp } from './freshness-values.js';
import type { OperationalFact } from './operational-fact-context.js';
import { firstEvidenceText } from './source-evidence-context.js';

export type FreshnessFact = {
  readonly [Key in keyof Omit<OperationalFact, 'owner' | 'actionType' | 'action'>]?:
    OperationalFact[Key] | undefined;
} & {
  readonly type: string;
  readonly summary: string;
  readonly owner?: string | null | undefined;
  readonly actionType?: string | null | undefined;
  readonly action?: string | null | undefined;
  readonly milestoneKind?: string | null | undefined;
  readonly interpretationProvenance?: unknown;
  readonly relationship?: string | undefined;
  readonly supportSpan?: string | null | undefined;
  readonly aiInterpreted?: boolean;
};
export interface FreshnessCandidate extends FreshnessCandidateSummary {
  readonly at: string;
  readonly time: number;
  readonly sourceRecordId: string | null;
  readonly sourceQuality: string;
  readonly matchScore: number | null;
  readonly matchReasons: readonly string[];
  readonly assumedIdentityMatch: boolean;
  readonly assumedIdentityNote: string;
  readonly matchedAs: string;
  readonly substantive: true;
  operationalFacts: readonly FreshnessFact[] | null;
  readonly direction: string;
  readonly line: string;
  readonly candidateName: string | null;
  readonly candidateStep: string | null;
  readonly candidateActive: boolean | null;
}
export type FreshnessCandidateInput = {
  readonly at: DateValue;
  readonly source: string;
  readonly summary: string | undefined;
} & {
  readonly [
    Key in keyof Omit<FreshnessCandidate, 'at' | 'time' | 'source' | 'summary' | 'substantive'>
  ]?: FreshnessCandidate[Key] | undefined;
};
export interface FreshnessContext {
  readonly input: FreshnessInput;
  readonly asOf: DateValue;
  readonly family: FreshnessFamily;
  readonly relevant: RegExp;
  readonly candidates: FreshnessCandidate[];
}
export function freshnessStageFamily(input: FreshnessInput): FreshnessFamily {
  if (input.authorizationGate?.required && !input.authorizationGate.satisfied) return 'insurance';
  const stage = firstEvidenceText(input.opp.StageName, input.opp.Current_SLA__r?.Stage__c) ?? '';
  if (['Insurance Verification', 'IA Requested', 'TA Requested'].includes(stage))
    return 'insurance';
  if (/97153|First Day|TA Approved - Pending Scheduling/i.test(stage)) return 'rbt';
  if (/Treatment Plan|97151/i.test(stage)) return 'treatmentPlan';
  return 'intakeScheduling';
}
export function freshnessFamilyTerms(family: FreshnessFamily): RegExp {
  if (family === 'insurance')
    return /insurance|authorization|\bauth\b|payer|denial|denied|card|medicaid|tricare|cob|coordination of benefits/i;
  if (family === 'rbt')
    return /\brbt\b|staffing|candidate|technician|interview|offer|hired|start date|first day/i;
  if (family === 'treatmentPlan') return /treatment plan|\btp\b|signature|97151|clinical review/i;
  return /schedule|appointment|assessment|97151|availability|available|contact|reach|call|respond|response|unresponsive|initial assessment|form|packet|next steps|family|provider|aloha/i;
}
export function addFreshnessCandidate(
  candidates: FreshnessCandidate[],
  input: FreshnessCandidateInput
): void {
  const time = freshnessTimestamp(input.at);
  if (time === null || !freshnessText(input.summary)) return;
  candidates.push({
    at: new Date(time).toISOString(),
    time,
    source: input.source,
    summary: freshnessText(input.summary),
    kind: input.kind ?? 'record',
    sourceRecordId: input.sourceRecordId === undefined ? '' : input.sourceRecordId,
    matchQuality: input.matchQuality ?? 'Direct',
    sourceQuality: input.sourceQuality ?? 'Direct',
    matchScore: input.matchScore ?? null,
    matchReasons: input.matchReasons ?? [],
    assumedIdentityMatch: input.assumedIdentityMatch ?? false,
    assumedIdentityNote: input.assumedIdentityNote ?? '',
    matchedAs: input.matchedAs ?? '',
    substantive: true,
    operationalFacts: input.operationalFacts ?? null,
    direction: input.direction ?? '',
    line: input.line ?? '',
    candidateName: input.candidateName ?? null,
    candidateStep: input.candidateStep ?? null,
    candidateActive: input.candidateActive ?? null,
  });
}
export function latestFreshnessRecordDate(values: readonly DateValue[]): DateValue {
  const valid = values
    .map((value) => ({ value, time: freshnessTimestamp(value) }))
    .filter((item): item is { value: DateValue; time: number } => item.time !== null);
  valid.sort((a, b) => b.time - a.time);
  return valid[0]?.value ?? '';
}
