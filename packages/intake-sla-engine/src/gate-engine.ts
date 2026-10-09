import { resolveAuthorizationGate } from './authorization-gate.js';
import type { AuthorizationGate, AuthorizationRecord } from './authorization-types.js';
import { getStageContract, isExcludedStage } from './contracts.js';
import type { IaOccurrence, IaOccurrenceInput } from './ia-occurrence-types.js';
import { resolveIaOccurrence } from './ia-occurrence.js';

const IA_OCCURRENCE_STAGES = new Set([
  'IA Approved - Pending Scheduling',
  'IC Scheduled - Pending Start',
  'IC Scheduled – Pending Start',
  'IC Completed - Pending Scheduling',
  'IC Completed – Pending Scheduling',
  'IA Scheduled',
]);
const TREATMENT_AUTHORIZATION_STAGES = new Set([
  'TA Requested',
  'TA Approved - Pending Scheduling',
  'First Day of 97153 Scheduled',
]);

export interface GateInput extends IaOccurrenceInput {
  readonly stage: string;
  readonly authorizations?: readonly AuthorizationRecord[];
}
export interface ExcludedGate {
  readonly excluded: true;
  readonly stage: string;
  readonly reason: string;
}
export interface ActiveGate {
  readonly excluded: false;
  readonly stage: string;
  readonly processPosition: string;
  readonly unresolvedGate: string;
  readonly confidence: 'Low' | 'Medium' | 'High';
  readonly readyToCopy: 'Yes' | 'Review' | 'Blocked';
  readonly conflicts: readonly string[];
  readonly owner?: string;
  readonly authorization?: AuthorizationGate;
  readonly occurrence?: IaOccurrence;
}
export type ResolvedGate = ExcludedGate | ActiveGate;

function authorizationFor(input: GateInput, phase: string): AuthorizationGate {
  return resolveAuthorizationGate({
    phase,
    authorizations: input.authorizations ?? [],
    ...(input.asOf === undefined ? {} : { asOf: input.asOf }),
  });
}

function authorizationBlock(
  stage: string,
  authorization: AuthorizationGate,
  position: string
): ActiveGate {
  return {
    excluded: false,
    stage,
    processPosition: position,
    unresolvedGate: authorization.reason,
    authorization,
    confidence: authorization.confidence,
    readyToCopy: authorization.conflict ? 'Review' : 'Yes',
    conflicts: authorization.conflict ? [authorization.reason] : [],
    owner: 'Insurance Ops',
  };
}

export function resolveGate(input: GateInput): ResolvedGate {
  const { stage } = input;
  if (isExcludedStage(stage))
    return { excluded: true, stage, reason: 'Pending Discharge is excluded by policy.' };
  const contract = getStageContract(stage);
  if (contract === null)
    return {
      excluded: false,
      stage,
      processPosition: 'Unknown',
      unresolvedGate: 'Stage is not in the approved contract',
      confidence: 'Low',
      readyToCopy: 'Blocked',
      conflicts: ['Unknown stage'],
    };
  if (stage === 'IA Requested' || IA_OCCURRENCE_STAGES.has(stage)) {
    const authorization = authorizationFor(input, 'Initial');
    if (!authorization.satisfied)
      return authorizationBlock(stage, authorization, 'Initial authorization');
    if (IA_OCCURRENCE_STAGES.has(stage)) {
      const occurrence = resolveIaOccurrence(input);
      return {
        excluded: false,
        stage,
        processPosition: contract.position,
        unresolvedGate: occurrence.reason,
        authorization,
        occurrence,
        confidence: occurrence.evidenceQuality === 'Missing' ? 'Low' : 'High',
        readyToCopy: occurrence.readyToCopy,
        conflicts: [],
        owner: occurrence.owner,
      };
    }
  }
  if (TREATMENT_AUTHORIZATION_STAGES.has(stage)) {
    const authorization = authorizationFor(input, 'Treatment');
    if (!authorization.satisfied)
      return authorizationBlock(stage, authorization, 'Treatment authorization');
  }
  return {
    excluded: false,
    stage,
    processPosition: contract.position,
    unresolvedGate: contract.unresolvedGate,
    confidence: 'Medium',
    readyToCopy: 'Review',
    conflicts: [],
    owner: contract.defaultOwner,
  };
}
