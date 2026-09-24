import { normalizeOperationalText } from './conversation-text.js';
import type { DateValue } from './dates.js';
import { createEvidenceEvent } from './evidence.js';
import type { EvidenceDate, EvidenceEvent } from './evidence.js';
import { categoryForGate } from './gate-context.js';
import type { GateContext } from './gate-context.js';
import type { DatedOperationalFact, OperationalSourceContext } from './operational-fact-context.js';
import { extractOperationalFacts } from './operational-facts.js';

export interface ConversationIdentity {
  readonly opportunityId?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
}
export interface ConversationInterpretationInput<
  Identity extends ConversationIdentity = ConversationIdentity,
> {
  readonly opportunityId: string;
  readonly source: string;
  readonly sourceRecordId: string;
  readonly eventDate: EvidenceDate;
  readonly text: string;
  readonly rawText?: string | null | undefined;
  readonly matchQuality: string;
  readonly gate?: GateContext | null | undefined;
  readonly asOf?: DateValue;
  readonly matchedIdentities?: readonly Identity[] | undefined;
  readonly assumedIdentityMatch?: boolean | undefined;
  readonly assumedIdentityNote?: string | undefined;
  readonly matchedAs?: string | undefined;
  readonly context?: OperationalSourceContext | undefined;
}
export type ConversationEvidenceEvent<
  Identity extends ConversationIdentity = ConversationIdentity,
> = Omit<EvidenceEvent, 'matchedIdentities'> & {
  readonly matchedIdentities: readonly Identity[];
  readonly assumedIdentityMatch: boolean;
  readonly assumedIdentityNote: string;
  readonly matchedAs: string;
  readonly kind: string | null | undefined;
  readonly plannedDate: string | null | undefined;
  readonly denialReason: string | null | undefined;
  readonly appealKind: string | null | undefined;
  readonly requestedInformation: string | null | undefined;
  readonly specificityMissing: boolean | undefined;
  readonly candidateStep: string | null | undefined;
};

function projectFact<Identity extends ConversationIdentity>(
  input: ConversationInterpretationInput<Identity>,
  fact: DatedOperationalFact,
  index: number,
  count: number,
  category: string
): ConversationEvidenceEvent<Identity> {
  const {
    opportunityId,
    source,
    sourceRecordId,
    eventDate,
    text,
    rawText = text,
    matchQuality,
    matchedIdentities = [],
    assumedIdentityMatch = false,
    assumedIdentityNote = '',
    matchedAs = '',
  } = input;
  return createEvidenceEvent({
    opportunityId,
    source,
    sourceRecordId: count === 1 ? sourceRecordId : `${sourceRecordId}:${String(index + 1)}`,
    eventDate,
    category: fact.category ?? category,
    text: fact.summary,
    rawText,
    matchedIdentities,
    assumedIdentityMatch,
    assumedIdentityNote,
    matchedAs,
    matchQuality,
    substantive: true,
    relationship: 'Supports',
    processRelevance: fact.relevance,
    factType: fact.type,
    issueKey: fact.issueKey,
    gateImpact: fact.gateImpact,
    actionOwner: fact.owner,
    actionType: fact.actionType,
    recommendedAction: fact.action,
    milestoneDate: fact.milestoneDate,
    followUpDate: fact.followUpDate,
    kind: fact.kind,
    plannedDate: fact.plannedDate,
    denialReason: fact.denialReason,
    appealKind: fact.appealKind,
    requestedInformation: fact.requestedInformation,
    specificityMissing: fact.specificityMissing,
    candidateStep: fact.candidateStep,
  });
}
export function interpretConversation<Identity extends ConversationIdentity>(
  input: ConversationInterpretationInput<Identity>
): ConversationEvidenceEvent<Identity>[] {
  const {
    opportunityId,
    text,
    eventDate,
    gate,
    asOf,
    matchedIdentities = [],
    context = {},
  } = input;
  const category = categoryForGate(gate);
  const facts = extractOperationalFacts({
    text,
    category,
    eventDate,
    asOf,
    context: {
      ...context,
      opportunityName:
        context.opportunityName ??
        matchedIdentities.find((identity) => identity.opportunityId === opportunityId)
          ?.opportunityName,
      processPosition: context.processPosition ?? gate?.processPosition,
    },
  });
  return facts.map((fact, index) => projectFact(input, fact, index, facts.length, category));
}
export function isAutomatedCommunication(text = ''): boolean {
  const value = normalizeOperationalText(text);
  return [
    'see where you are in the process',
    'intake timeline',
    'reply stop to opt out',
    'welcome to headstart health',
    'you can reach me at',
    'as a reminder we sent out',
    'reminder to complete the new client onboarding packet',
  ].some((phrase) => value.includes(phrase));
}
