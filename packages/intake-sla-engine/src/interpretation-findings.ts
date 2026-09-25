import type { EvidenceDate } from './evidence.js';
import { compactInterpretationText } from './interpretation-packet.js';

export interface TranscriptFindingInput {
  readonly matchedOpportunityId?: string | null | undefined;
  readonly synthesizedFact?: string | null | undefined;
  readonly gateImpact?: string | null | undefined;
  readonly substantive?: boolean | null | undefined;
  readonly relationship?: string | null | undefined;
  readonly supportSpan?: string | null | undefined;
  readonly actionOwner?: string | null | undefined;
  readonly actionType?: string | null | undefined;
  readonly recommendedAction?: string | null | undefined;
  readonly milestoneDate?: string | null | undefined;
  readonly followUpDate?: string | null | undefined;
  readonly category?: string | null | undefined;
  readonly issueKey?: string | null | undefined;
  readonly factType?: string | null | undefined;
  readonly milestoneKind?: string | null | undefined;
  readonly semanticsSupplied?: boolean | null | undefined;
}
export interface FindingContext {
  readonly segment?: string | null;
  readonly inputMatchQuality?: string | null;
  readonly eventDate?: EvidenceDate | null | undefined;
  readonly expectedOpportunityId?: string | null;
}
export interface ValidatedTranscriptFinding {
  readonly matchedOpportunityId: string | null;
  readonly synthesizedFact: string;
  readonly gateImpact: string;
  readonly eventDate: EvidenceDate | null | undefined;
  readonly matchQuality: string;
  readonly substantive: boolean;
  readonly relationship: string;
  readonly actionOwner: string;
  readonly actionType: string;
  readonly recommendedAction: string;
  readonly milestoneDate: string | null;
  readonly followUpDate: string | null;
  readonly milestoneKind: string | null;
  readonly semanticsSupplied: boolean;
  readonly supportSpan: string;
  readonly category: string | null;
  readonly issueKey: string | null;
  readonly factType: string | null;
}
const RELATIONSHIPS = new Set(['Supports', 'Conflicts', 'Neutral']);
const ACTION_TYPES = new Set([
  'Provider Outreach',
  'Family Outreach',
  'Insurance Follow-Up',
  'RBT Follow-Up',
  'Salesforce Update',
  'Monitor',
  'Close / Discharge',
  'No Action',
]);
const MATCH_QUALITIES = new Set(['Direct', 'Likely', 'Weak']);

function normalized(value?: string | null): string {
  return compactInterpretationText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function isoDateOrNull(value?: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf()) ? null : value;
}
function supported(finding: TranscriptFindingInput, segment?: string | null): boolean {
  const support = normalized(finding.supportSpan);
  return support.length >= 8 && normalized(segment).includes(support);
}
function validSemantics(finding: TranscriptFindingInput): boolean {
  const values = [finding.category, finding.issueKey, finding.factType];
  return (
    values.every((value) => value === undefined || value === null || value.trim().length > 0) &&
    [0, 3].includes(values.filter(Boolean).length)
  );
}
function validDateMeaning(finding: TranscriptFindingInput): boolean {
  return (
    [undefined, null, 'planned', 'observed'].includes(finding.milestoneKind) &&
    (!finding.milestoneKind || Boolean(isoDateOrNull(finding.milestoneDate)))
  );
}
function substantive(finding: TranscriptFindingInput, context: FindingContext): boolean {
  return (
    Boolean(finding.substantive) &&
    validSemantics(finding) &&
    validDateMeaning(finding) &&
    supported(finding, context.segment) &&
    (!finding.matchedOpportunityId ||
      finding.matchedOpportunityId === context.expectedOpportunityId) &&
    compactInterpretationText(finding.synthesizedFact).length >= 12
  );
}
function validatedFinding(
  finding: TranscriptFindingInput,
  context: FindingContext
): ValidatedTranscriptFinding {
  return {
    matchedOpportunityId: finding.matchedOpportunityId ?? context.expectedOpportunityId ?? null,
    synthesizedFact: compactInterpretationText(finding.synthesizedFact),
    gateImpact: compactInterpretationText(finding.gateImpact),
    eventDate: context.eventDate,
    matchQuality: MATCH_QUALITIES.has(context.inputMatchQuality ?? '')
      ? (context.inputMatchQuality ?? 'Weak')
      : 'Weak',
    substantive: substantive(finding, context),
    relationship: RELATIONSHIPS.has(finding.relationship ?? '')
      ? (finding.relationship ?? 'Neutral')
      : 'Neutral',
    actionOwner: compactInterpretationText(finding.actionOwner),
    actionType: ACTION_TYPES.has(finding.actionType ?? '')
      ? (finding.actionType ?? 'No Action')
      : 'No Action',
    recommendedAction: compactInterpretationText(finding.recommendedAction),
    milestoneDate: isoDateOrNull(finding.milestoneDate),
    followUpDate: isoDateOrNull(finding.followUpDate),
    milestoneKind: finding.milestoneKind ?? null,
    semanticsSupplied:
      finding.semanticsSupplied ??
      ['category', 'issueKey', 'factType'].every((key) => Object.hasOwn(finding, key)),
    supportSpan: compactInterpretationText(finding.supportSpan),
    category: compactInterpretationText(finding.category) || null,
    issueKey: compactInterpretationText(finding.issueKey) || null,
    factType: compactInterpretationText(finding.factType) || null,
  };
}
export function validateTranscriptFindings({
  findings = [],
  inputMatchQuality = 'Likely',
  ...context
}: FindingContext & {
  readonly findings?: readonly TranscriptFindingInput[];
}): ValidatedTranscriptFinding[] {
  return findings
    .map((finding) => validatedFinding(finding, { ...context, inputMatchQuality }))
    .filter((finding) => finding.substantive);
}
export interface AiOperationalFact {
  readonly type: 'ai-interpreted-conversation';
  readonly summary: string;
  readonly gateImpact: string;
  readonly owner: string;
  readonly actionType: string;
  readonly action: string;
  readonly milestoneDate: string | null;
  readonly followUpDate: string | null;
  readonly relevance: number;
  readonly relationship: string;
  readonly supportSpan: string;
  readonly aiInterpreted: true;
}
export function aiFindingAsOperationalFact(finding: ValidatedTranscriptFinding): AiOperationalFact {
  return {
    type: 'ai-interpreted-conversation',
    summary: finding.synthesizedFact,
    gateImpact: finding.gateImpact,
    owner: finding.actionOwner,
    actionType: finding.actionType,
    action: finding.recommendedAction,
    milestoneDate: finding.milestoneDate,
    followUpDate: finding.followUpDate,
    relevance: finding.relationship === 'Conflicts' ? 11 : 10,
    relationship: finding.relationship,
    supportSpan: finding.supportSpan,
    aiInterpreted: true,
  };
}
