import { isoDate } from './dates.js';
import { categoryForGate } from './gate-context.js';
import {
  evidenceOwner,
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import {
  structuredEvidenceEvent,
  type StructuredEvidenceEvent,
  type StructuredEvidenceInput,
} from './structured-evidence.js';

type MilestoneField =
  | 'Vineland_Status__c'
  | 'Vineland_Filed_Timestamp__c'
  | 'Vineland_Completed_Timestamp__c'
  | 'BASC_Status__c'
  | 'BASC_Filed_Timestamp__c'
  | 'BASC_Completed_Timestamp__c'
  | 'Intake_Packet_Status__c'
  | 'Intake_Packet_Completed_Timestamp__c'
  | 'IA_Completed_Date__c'
  | 'iaCompletedDate'
  | 'IA_Scheduled_For__c'
  | 'iaScheduledFor'
  | 'IA_Scheduled_Timestamp__c'
  | 'IA_Scheduled_On__c'
  | 'iaScheduledOn'
  | 'stageEntryDate'
  | 'LastModifiedDate'
  | 'First_day_of_Treatment__c'
  | 'firstDayOfTreatment'
  | 'X97153_Scheduled_For__c'
  | 'first97153ScheduledFor'
  | 'X53_Provider_Confirmed_First_Day_TS__c';
export type OpportunityMilestoneRecord = Readonly<
  Partial<Record<MilestoneField, string | null | undefined>>
>;
export interface OpportunityMilestonesInput extends SourceEvidenceContext {
  readonly opportunity: OpportunityMilestoneRecord;
}
interface Context extends OpportunityMilestonesInput {
  readonly category: string;
}
function event(
  context: Context,
  input: Omit<
    StructuredEvidenceInput,
    'opportunityId' | 'source' | 'category' | 'sourceRecordId' | 'actionOwner'
  > & { readonly sourceRecordId?: string }
): StructuredEvidenceEvent {
  return structuredEvidenceEvent({
    opportunityId: context.profile.opportunityId,
    source: 'Salesforce Opportunity / SLA',
    sourceRecordId: context.profile.opportunityId,
    category: context.category,
    actionOwner: evidenceOwner(context.profile),
    ...input,
  });
}
function prerequisites(context: Context): StructuredEvidenceEvent[] {
  const { opportunity: opp, category, profile } = context;
  const completed = [
    {
      label: 'the Vineland assessment',
      status: opp.Vineland_Status__c,
      date: firstEvidenceText(opp.Vineland_Filed_Timestamp__c, opp.Vineland_Completed_Timestamp__c),
    },
    {
      label: 'the BASC assessment',
      status: opp.BASC_Status__c,
      date: firstEvidenceText(opp.BASC_Filed_Timestamp__c, opp.BASC_Completed_Timestamp__c),
    },
    {
      label: 'the intake packet',
      status: opp.Intake_Packet_Status__c,
      date: opp.Intake_Packet_Completed_Timestamp__c,
    },
  ].filter(
    (item) => /filed|complete|completed|received/i.test(item.status ?? '') && Boolean(item.date)
  );
  if (completed.length === 0) return [];
  const date = requiredEvidenceValue(
    latestEvidenceDate(...completed.map((item) => item.date)),
    'eventDate'
  );
  const labels = completed.map((item) => item.label);
  const readable =
    labels.length === 1
      ? String(labels[0])
      : `${labels.slice(0, -1).join(', ')}, and ${String(labels.at(-1))}`;
  const csm = evidenceOwner(profile);
  return [
    event(context, {
      sourceRecordId: `${profile.opportunityId}:intake-prerequisites`,
      eventDate: date,
      text: `Salesforce confirms ${readable} ${labels.length === 1 ? 'is' : 'are'} complete as of ${String(isoDate(date))}.`,
      actionType: 'Monitor',
      recommendedAction:
        category === 'intakeScheduling'
          ? `${csm} to confirm the initial-assessment date now that the recorded intake prerequisites are complete.`
          : `${csm} to confirm the provider has the completed prerequisites and document the current treatment-plan milestone.`,
      processRelevance: 10,
      factType: 'family-document-completed',
      requestedInformation: readable,
      issueKey: 'required-documentation',
    }),
  ];
}
function assessment(context: Context): StructuredEvidenceEvent[] {
  const { opportunity: opp, profile, asOf } = context;
  const completed = firstEvidenceText(opp.IA_Completed_Date__c, opp.iaCompletedDate);
  const scheduled = firstEvidenceText(opp.IA_Scheduled_For__c, opp.iaScheduledFor);
  if (completed === undefined && scheduled === undefined) return [];
  const csm = evidenceOwner(profile);
  if (completed !== undefined)
    return [
      event(context, {
        eventDate: completed,
        text: `Salesforce records the 97151 Started Date as ${String(isoDate(completed))}; this date alone does not establish whole-assessment completion.`,
        gateImpact: 'Recorded assessment start milestone; verify remaining session evidence',
        actionType: 'Monitor',
        recommendedAction: `${csm} to verify the remaining assessment session plan and current workflow position; do not infer a stage error from the start date alone.`,
        processRelevance: 11,
        factType: 'ia-start-date-recorded',
      }),
    ];
  const date = isoDate(scheduled);
  return [
    event(context, {
      eventDate: requiredEvidenceValue(
        firstEvidenceText(
          opp.IA_Scheduled_Timestamp__c,
          opp.IA_Scheduled_On__c,
          opp.iaScheduledOn,
          opp.stageEntryDate,
          opp.LastModifiedDate,
          asOf
        ),
        'eventDate'
      ),
      text: `Salesforce schedules the initial assessment for ${String(date)}.`,
      gateImpact: `Initial assessment is scheduled for ${String(date)}`,
      actionType: 'Monitor',
      recommendedAction: `${csm} to monitor the ${String(date)} IA and verify completion.`,
      processRelevance: 11,
      milestoneDate: date,
      followUpDate: date,
    }),
  ];
}
function treatment(context: Context): StructuredEvidenceEvent[] {
  const { opportunity: opp, profile, asOf } = context;
  const completed = firstEvidenceText(opp.First_day_of_Treatment__c, opp.firstDayOfTreatment);
  const scheduled = firstEvidenceText(opp.X97153_Scheduled_For__c, opp.first97153ScheduledFor);
  if (completed === undefined && scheduled === undefined) return [];
  const csm = evidenceOwner(profile);
  if (completed !== undefined)
    return [
      event(context, {
        eventDate: completed,
        text: `Salesforce confirms the first 97153 service occurred on ${String(isoDate(completed))}.`,
        gateImpact: 'First 97153 occurred; Opportunity admission transition remains',
        actionType: 'Salesforce Update',
        recommendedAction: `${csm} to verify the Opportunity reflects the completed first 97153 service and admission transition.`,
        processRelevance: 11,
      }),
    ];
  const date = isoDate(scheduled);
  return [
    event(context, {
      eventDate: requiredEvidenceValue(
        firstEvidenceText(
          opp.X53_Provider_Confirmed_First_Day_TS__c,
          opp.stageEntryDate,
          opp.LastModifiedDate,
          asOf
        ),
        'eventDate'
      ),
      text: `Salesforce schedules the first 97153 service for ${String(date)}.`,
      gateImpact: `First 97153 service is scheduled for ${String(date)}`,
      actionType: 'Monitor',
      recommendedAction: `${csm} to monitor the ${String(date)} start and verify the completed service updates Salesforce.`,
      processRelevance: 11,
      milestoneDate: date,
      followUpDate: date,
    }),
  ];
}
/** Preserve recorded milestone meanings; a 97151 start date is not whole-assessment completion. */
export function adaptOpportunityMilestones(
  input: OpportunityMilestonesInput
): StructuredEvidenceEvent[] {
  const category = categoryForGate(input.gate);
  const context = { ...input, category };
  const events = ['intakeScheduling', 'treatmentPlan'].includes(category)
    ? prerequisites(context)
    : [];
  if (category === 'intakeScheduling') events.push(...assessment(context));
  if (category === 'rbt') events.push(...treatment(context));
  return events;
}
