import { isSupportingOnlyEvidence } from './contracts.js';
import { isoDate } from './dates.js';
import { approvedEvidence, evidenceSpecificity } from './evidence.js';
import type { EvidenceEvent } from './evidence.js';

export interface GateContext {
  readonly excluded?: boolean | null | undefined;
  readonly gateCategory?: string | null | undefined;
  readonly unresolvedGate?: string | null | undefined;
  readonly processPosition?: string | null | undefined;
  readonly owner?: string | null | undefined;
  readonly confidence?: string | null | undefined;
}
export interface GateOpportunity {
  readonly csm?: string | null;
  readonly stageEntryDate?: string | null | undefined;
}
export interface GateRefinement {
  readonly gateCategory: string;
  readonly unresolvedGate: string | null | undefined;
  readonly contextualBlocker: string;
  readonly contextualEvidenceId: string;
  readonly owner: string | null | undefined;
  readonly recommendedAction: string | null;
  readonly recommendedActionType: string | null;
  readonly recommendedFollowUpDate: string | null;
  readonly confidence: string | null | undefined;
}
type ContextualEvidence = EvidenceEvent & { readonly gateImpact: string };

export function categoryForGate(gate?: GateContext | null): string {
  if (gate?.gateCategory) return gate.gateCategory;
  for (const value of [
    (gate?.unresolvedGate ?? '').toLowerCase(),
    (gate?.processPosition ?? '').toLowerCase(),
  ]) {
    if (/treatment.?plan|clinical quality|signature/.test(value)) return 'treatmentPlan';
    if (/rbt|97153|staff|direct-care|treatment start/.test(value)) return 'rbt';
    if (/authorization|payer|insurance|vob|eligibility/.test(value)) return 'insurance';
    if (/assessment|initial consultation|\bia\b/.test(value)) return 'intakeScheduling';
  }
  return 'other';
}

export function isVobRelevantGate(gate?: GateContext | null): boolean {
  const position = (gate?.processPosition ?? '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const unresolved = (gate?.unresolvedGate ?? '').toLowerCase();
  return (
    position === 'insurance verification' ||
    /complete vob|insurance verification|verify (?:benefits|eligibility)/.test(unresolved)
  );
}

function ownerName(
  owner: string | null | undefined,
  opportunity: GateOpportunity
): string | null | undefined {
  if (owner !== 'CSM') return owner;
  return [opportunity.csm].find(Boolean) ?? 'CSM';
}

function canDriveAuthorizationGate(event: EvidenceEvent): boolean {
  return (
    ['Authorization', 'Authorization Review', 'VOB'].includes(event.source) ||
    event.actionOwner === 'Insurance Ops' ||
    event.actionType === 'Insurance Follow-Up'
  );
}

function contextualEvidence(
  events: readonly EvidenceEvent[],
  category: string,
  authorizationGate: boolean,
  opportunity: GateOpportunity
): ContextualEvidence[] {
  const stageEntry = opportunity.stageEntryDate
    ? new Date(opportunity.stageEntryDate).valueOf()
    : null;
  return approvedEvidence(events).filter(
    (event): event is ContextualEvidence =>
      !isSupportingOnlyEvidence(event) &&
      event.category === category &&
      Boolean(event.gateImpact) &&
      event.processRelevance >= 7 &&
      (!authorizationGate || canDriveAuthorizationGate(event)) &&
      (!stageEntry ||
        new Date(event.eventDate).valueOf() >= stageEntry ||
        (authorizationGate &&
          ['Authorization', 'Authorization Review', 'VOB'].includes(event.source)))
  );
}

function compareContext(left: EvidenceEvent, right: EvidenceEvent): number {
  return (
    new Date(isoDate(right.eventDate) ?? 0).valueOf() -
      new Date(isoDate(left.eventDate) ?? 0).valueOf() ||
    right.processRelevance - left.processRelevance ||
    evidenceSpecificity(right) - evidenceSpecificity(left) ||
    new Date(right.eventDate).valueOf() - new Date(left.eventDate).valueOf()
  );
}

export function refineGateWithEvidence<T extends GateContext>(
  gate: T,
  events: readonly EvidenceEvent[],
  opportunity: GateOpportunity = {}
): T | (Omit<T, keyof GateRefinement> & GateRefinement) {
  if (gate.excluded) return gate;
  const category = categoryForGate(gate);
  const authorizationGate = ['Initial authorization', 'Treatment authorization'].includes(
    gate.processPosition ?? ''
  );
  const contextual = contextualEvidence(events, category, authorizationGate, opportunity);
  const best = (authorizationGate ? contextual : [...contextual].sort(compareContext))[0];
  if (best === undefined) return gate;
  return {
    ...gate,
    gateCategory: category,
    unresolvedGate: authorizationGate ? gate.unresolvedGate : best.gateImpact,
    contextualBlocker: best.gateImpact,
    contextualEvidenceId: `${best.source}:${best.sourceRecordId}`,
    owner: ownerName(best.actionOwner ?? gate.owner, opportunity),
    recommendedAction: best.recommendedAction ?? null,
    recommendedActionType: best.actionType ?? null,
    recommendedFollowUpDate: best.followUpDate ?? best.milestoneDate ?? null,
    confidence:
      best.matchQuality === 'Direct' && best.processRelevance >= 9 ? 'High' : gate.confidence,
  };
}
