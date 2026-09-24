import { interpretConversation } from './conversation-interpretation.js';
import type {
  ConversationIdentity,
  ConversationInterpretationInput,
} from './conversation-interpretation.js';
import type { EvidenceDate, EvidenceEvent } from './evidence.js';
import { categoryForGate } from './gate-context.js';
import type { GateContext } from './gate-context.js';
import { firstEvidenceText } from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import { datedTaskLines } from './source-task-dates.js';
import type { DatedTaskLine } from './source-task-dates.js';

export interface OpportunityNoteRecord {
  readonly Current_SLA__c?: string | null | undefined;
  readonly Current_SLA__r?:
    | {
        readonly Reason_for_Delay__c?: string | null | undefined;
        readonly Reason_for_Delay_Notes__c?: string | null | undefined;
        readonly Reason_for_Delay_Notes_Last_Updated__c?: string | null | undefined;
        readonly LastModifiedDate?: string | null | undefined;
      }
    | null
    | undefined;
  readonly SLA_Reason_for_Delay_Notes_Last_Updated__c?: string | null | undefined;
  readonly Intake_Notes__c?: string | null | undefined;
  readonly Intake_Notes_Last_Updated__c?: string | null | undefined;
  readonly On_Hold_Notes__c?: string | null | undefined;
  readonly On_Hold_Notes_Last_Updated__c?: string | null | undefined;
  readonly On_Hold_Start_Date__c?: string | null | undefined;
  readonly LastModifiedDate?: string | null | undefined;
  readonly CreatedDate?: string | null | undefined;
}
export interface OpportunityNoteProfile {
  readonly opportunityId: string;
  readonly opportunityName?: string | null | undefined;
  readonly stageEntryDate?: string | null | undefined;
}
export interface OpportunityNoteAdjudicationInput extends ConversationInterpretationInput<
  ConversationIdentity & { readonly matchQuality: string }
> {
  readonly noteRecordId: string;
  readonly rawText: string;
  readonly stageEntryDate: string | null;
  readonly gate: GateContext;
}
export interface OpportunityNotesInput {
  readonly opportunity: OpportunityNoteRecord;
  readonly profile: OpportunityNoteProfile;
  readonly gate: GateContext;
  readonly asOf: EvidenceDate;
  readonly adjudicateNote?:
    | ((input: OpportunityNoteAdjudicationInput) => readonly EvidenceEvent[] | null | undefined)
    | undefined;
}
interface SourceNote {
  readonly id: string;
  readonly text: string | null | undefined;
  readonly date: string | null | undefined;
}
function slaNoteContext(reason: string, gate: GateContext): string {
  const category = categoryForGate(gate);
  if (/treatment plan|drafting\s*tp|clinical review/i.test(reason) || category === 'treatmentPlan')
    return 'Treatment plan update';
  if (/authorization|insurance|payer|denial/i.test(reason) || category === 'insurance')
    return 'Authorization update';
  if (/rbt|staff|97153/i.test(reason) || category === 'rbt')
    return 'Staffing and scheduling update';
  if (/assessment|\bia\b|97151/i.test(reason) || category === 'intakeScheduling')
    return 'Initial-assessment update';
  return '';
}
function noteSets(input: OpportunityNotesInput, context: string, reason: string): SourceNote[] {
  const { opportunity, profile } = input;
  const slaNotes = sourceHtmlText(opportunity.Current_SLA__r?.Reason_for_Delay_Notes__c);
  const reasonOnlyEvidence = !slaNotes && /^family unresponsive$/i.test(reason) ? reason : '';
  return [
    {
      id: firstEvidenceText(opportunity.Current_SLA__c) ?? `${profile.opportunityId}:sla-note`,
      text: [context, firstEvidenceText(slaNotes, reasonOnlyEvidence)].filter(Boolean).join(': '),
      date: firstEvidenceText(
        opportunity.Current_SLA__r?.Reason_for_Delay_Notes_Last_Updated__c,
        opportunity.SLA_Reason_for_Delay_Notes_Last_Updated__c,
        opportunity.Current_SLA__r?.LastModifiedDate
      ),
    },
    {
      id: `${profile.opportunityId}:intake-note`,
      text: opportunity.Intake_Notes__c,
      date: firstEvidenceText(
        opportunity.Intake_Notes_Last_Updated__c,
        opportunity.LastModifiedDate
      ),
    },
    {
      id: `${profile.opportunityId}:on-hold-note`,
      text: opportunity.On_Hold_Notes__c,
      date: firstEvidenceText(
        opportunity.On_Hold_Notes_Last_Updated__c,
        opportunity.On_Hold_Start_Date__c,
        opportunity.LastModifiedDate
      ),
    },
  ].filter((note) => Boolean(sourceHtmlText(note.text)));
}
function noteLineInput(
  input: OpportunityNotesInput,
  note: SourceNote,
  row: DatedTaskLine,
  index: number,
  context: string,
  reason: string
): OpportunityNoteAdjudicationInput {
  const { opportunity, profile, gate, asOf } = input;
  const currentSla = note.id === opportunity.Current_SLA__c;
  const contextualText =
    currentSla && context && !row.text.toLowerCase().startsWith(context.toLowerCase())
      ? `${context}: ${row.text}`
      : row.text;
  return {
    opportunityId: profile.opportunityId,
    source: 'SLA / Intake / On-Hold Notes',
    sourceRecordId: `${note.id}:${String(index + 1)}`,
    eventDate: row.eventDate,
    text: contextualText,
    rawText: row.text,
    matchQuality: 'Direct',
    gate,
    asOf,
    matchedIdentities: [
      {
        opportunityId: profile.opportunityId,
        opportunityName: profile.opportunityName,
        matchQuality: 'Direct',
      },
    ],
    context: { noteType: currentSla ? 'sla' : 'salesforce-note', slaReason: reason },
    noteRecordId: note.id,
    stageEntryDate: profile.stageEntryDate ?? null,
  };
}
export function adaptOpportunityNotes(input: OpportunityNotesInput): EvidenceEvent[] {
  const { opportunity, gate, asOf, adjudicateNote } = input;
  const reason = sourceHtmlText(opportunity.Current_SLA__r?.Reason_for_Delay__c);
  const context = slaNoteContext(reason, gate);
  return noteSets(input, context, reason).flatMap((note) => {
    const rows = datedTaskLines(
      {
        Description: note.text,
        CreatedDate: firstEvidenceText(note.date, opportunity.CreatedDate) ?? asOf,
        LastModifiedDate: firstEvidenceText(note.date, opportunity.LastModifiedDate) ?? asOf,
      },
      asOf
    );
    return rows.flatMap((row, index) => {
      const candidate = noteLineInput(input, note, row, index, context, reason);
      return adjudicateNote?.(candidate) ?? interpretConversation(candidate);
    });
  });
}
