import { z } from 'zod';

import sourceContract from './contracts/source-contract.json' with { type: 'json' };
import stageContract from './contracts/stage-contract.json' with { type: 'json' };

const stageSchema = z
  .object({
    order: z.number(),
    stage: z.string(),
    position: z.string(),
    unresolvedGate: z.string(),
    defaultOwner: z.string(),
    slaDays: z.number(),
    completionSignals: z.array(z.string()),
    nextStages: z.array(z.string()),
    aliases: z.array(z.string()).optional(),
    prerequisite: z.string().optional(),
    entryDateSignals: z.array(z.string()).optional(),
    entryDateRule: z.string().optional(),
  })
  .strict();
export type StageDefinition = z.infer<typeof stageSchema>;
export const stageContractSchema = z
  .object({
    version: z.string(),
    timezone: z.string(),
    excludedStages: z.array(z.string()),
    terminalStages: z.array(z.string()),
    stages: z.array(stageSchema),
  })
  .strict();
export type StageContract = z.infer<typeof stageContractSchema>;
const sourceContractSchema = z
  .object({
    version: z.string(),
    statuses: z.array(z.string()),
    matchQualities: z.array(z.string()),
    contributions: z.array(z.string()),
    supportingOnlySources: z.array(z.string()),
    nonBlockingEnrichmentSources: z.array(z.string()),
    targetedSlackChannels: z.record(
      z.string(),
      z.object({ name: z.string(), id: z.string(), purpose: z.string() })
    ),
    collectionModes: z.record(
      z.string(),
      z.object({
        description: z.string(),
        alwaysSearchedOperationalSources: z.array(z.string()),
        escalationOnlySources: z.array(z.string()),
      })
    ),
    noteModes: z.record(z.string(), z.string()),
    providerIdentitySources: z.array(z.string()),
    sources: z.array(z.string()),
    approvedPhoneLines: z.record(z.string(), z.string()),
  })
  .strict();
export const STAGE_CONTRACT = stageContractSchema.parse(stageContract);
export const SOURCE_CONTRACT = sourceContractSchema.parse(sourceContract);
const supportingOnlySources = new Set(SOURCE_CONTRACT.supportingOnlySources);

function normalizeDash(value = ''): string {
  return value.replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}
const stageIndex = new Map<string, StageDefinition>();
for (const contract of STAGE_CONTRACT.stages) {
  for (const name of [contract.stage, ...(contract.aliases ?? [])]) {
    stageIndex.set(normalizeDash(name).toLowerCase(), contract);
  }
}

export function getStageContract(stage = ''): StageDefinition | null {
  return stageIndex.get(normalizeDash(stage).toLowerCase()) ?? null;
}
export function getStageOrder(stage = ''): number | null {
  return getStageContract(stage)?.order ?? null;
}
export function isExcludedStage(stage = ''): boolean {
  const normalized = normalizeDash(stage).toLowerCase();
  return STAGE_CONTRACT.excludedStages.some(
    (candidate) => normalizeDash(candidate).toLowerCase() === normalized
  );
}

export interface SlaDisposition {
  readonly Reason_for_Delay__c?: string | null | undefined;
  readonly reasonForDelay?: string | null | undefined;
  readonly Reason_for_Delay_Notes__c?: string | null | undefined;
  readonly reasonForDelayNotes?: string | null | undefined;
}
export interface OpportunityDisposition {
  readonly StageName?: string | null | undefined;
  readonly stage?: string | null | undefined;
  readonly Current_SLA__r?: SlaDisposition | null | undefined;
  readonly currentSla?: SlaDisposition | null | undefined;
  readonly Close_Suggestion__c?: string | null | undefined;
  readonly closeSuggestion?: string | null | undefined;
}

export function isExcludedOpportunity(opportunity: OpportunityDisposition = {}): boolean {
  if (isExcludedStage(opportunity.StageName ?? opportunity.stage ?? '')) return true;
  const sla = opportunity.Current_SLA__r ?? opportunity.currentSla ?? {};
  const dispositionText = [
    sla.Reason_for_Delay__c,
    sla.reasonForDelay,
    sla.Reason_for_Delay_Notes__c,
    sla.reasonForDelayNotes,
    opportunity.Close_Suggestion__c,
    opportunity.closeSuggestion,
  ]
    .filter(Boolean)
    .join(' ');
  return /\b(?:pending|awaiting)\s+discharge\b|\bclosed?\s+not\s+admitted\b/i.test(dispositionText);
}

export function isSupportingOnlySource(source?: string | null): boolean {
  return source !== undefined && source !== null && supportingOnlySources.has(source);
}
export function isSupportingOnlyEvidence(
  eventOrSource?:
    | string
    | { readonly supportingOnly?: boolean | undefined; readonly source?: string | undefined }
    | null
): boolean {
  if (typeof eventOrSource === 'string') return isSupportingOnlySource(eventOrSource);
  return Boolean(eventOrSource?.supportingOnly) || isSupportingOnlySource(eventOrSource?.source);
}

export function validateStageContract(contract: StageContract = STAGE_CONTRACT): string[] {
  const errors: string[] = [];
  const orders = new Set<number>();
  for (const stage of contract.stages) {
    if (orders.has(stage.order)) errors.push(`Duplicate stage order ${String(stage.order)}`);
    orders.add(stage.order);
    for (const [field, value] of Object.entries({
      stage: stage.stage,
      position: stage.position,
      unresolvedGate: stage.unresolvedGate,
      defaultOwner: stage.defaultOwner,
    })) {
      if (!value) errors.push(`${stage.stage} missing ${field}`);
    }
  }
  return errors;
}

export function assertContractFingerprint(actual?: string | null): {
  readonly publishable: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly reason?: string;
} {
  const expected = STAGE_CONTRACT.version;
  if (actual !== expected)
    return {
      publishable: false,
      expected,
      actual: actual ?? 'Missing',
      reason: 'Production automation fingerprint differs from the approved stage contract.',
    };
  return { publishable: true, expected, actual };
}
