import { isoDate, nextBusinessDay } from './dates.js';
import { categoryForGate } from './gate-context.js';
import {
  evidenceOwner,
  firstEvidenceText,
  latestEvidenceDate,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { structuredEvidenceEvent, type StructuredEvidenceEvent } from './structured-evidence.js';

export interface AlohaAppointment {
  readonly appointmentId?: string | null;
  readonly id?: string | null;
  readonly serviceDate?: string | null;
  readonly appointmentDate?: string | null;
  readonly status?: string | null;
  readonly qualifyingAssessment?: boolean | null;
  readonly qualifyingTreatment?: boolean | null;
  readonly lastModifiedDate?: string | null;
  readonly updatedAt?: string | null;
  readonly createdDate?: string | null;
  readonly CreatedDate?: string | null;
}
export interface AlohaEvidenceInput extends SourceEvidenceContext {
  readonly appointments?: readonly AlohaAppointment[] | null;
}
const FIRST_SERVICE_GATE = 'First 97153 occurred; Opportunity admission transition remains';
interface AppointmentContext {
  readonly appointment: AlohaAppointment;
  readonly input: AlohaEvidenceInput;
  readonly serviceDate: string;
  readonly category: string;
  readonly assessment: boolean;
}
function alohaNarrative(
  assessment: boolean,
  completed: boolean,
  date: string | null,
  owner: string
): Pick<StructuredEvidenceEvent, 'text' | 'gateImpact' | 'recommendedAction'> {
  const text = assessment
    ? completed
      ? `Aloha confirms the initial assessment occurred on ${String(date)}.`
      : `Aloha schedules the initial assessment for ${String(date)}.`
    : completed
      ? `Aloha confirms the first 97153 service occurred on ${String(date)}; the Opportunity still requires the corresponding admission transition.`
      : `Aloha schedules the first 97153 service for ${String(date)}.`;
  const gateImpact = assessment
    ? completed
      ? 'Structured IA completion is confirmed'
      : `Initial assessment is scheduled for ${String(date)}`
    : completed
      ? FIRST_SERVICE_GATE
      : `First 97153 service is scheduled for ${String(date)}`;
  const recommendedAction = assessment
    ? completed
      ? `${owner} to verify the Opportunity reflects the completed IA and the next treatment-plan stage.`
      : `${owner} to monitor the ${String(date)} IA and verify completion in Aloha.`
    : completed
      ? `${owner} to verify the automatic 97153 milestone and admission transition completed in Salesforce.`
      : `${owner} to monitor the ${String(date)} start and confirm the completed appointment updates Salesforce.`;
  return { text, gateImpact, recommendedAction };
}
function alohaEvent({
  appointment,
  input,
  serviceDate,
  category,
  assessment,
}: AppointmentContext): StructuredEvidenceEvent {
  const completed = /complete/i.test(appointment.status ?? 'Active');
  const date = isoDate(serviceDate);
  const owner = evidenceOwner(input.profile);
  const evidenceDate = completed
    ? serviceDate
    : (latestEvidenceDate(
        appointment.lastModifiedDate,
        appointment.updatedAt,
        appointment.createdDate,
        appointment.CreatedDate
      ) ?? input.asOf);
  return structuredEvidenceEvent({
    opportunityId: input.profile.opportunityId,
    source: 'Aloha',
    sourceRecordId: requiredEvidenceValue(
      firstEvidenceText(appointment.appointmentId, appointment.id),
      'sourceRecordId'
    ),
    eventDate: evidenceDate,
    category,
    ...alohaNarrative(assessment, completed, date, owner),
    actionOwner: owner,
    actionType: completed ? 'Salesforce Update' : 'Monitor',
    processRelevance: 10,
    milestoneDate: date,
    followUpDate: date,
  });
}
export function adaptAlohaAppointments(input: AlohaEvidenceInput): StructuredEvidenceEvent[] {
  const category = categoryForGate(input.gate);
  const events: StructuredEvidenceEvent[] = [];
  for (const appointment of input.appointments ?? []) {
    const serviceDate = firstEvidenceText(appointment.serviceDate, appointment.appointmentDate);
    if (serviceDate === undefined) continue;
    const assessment = category === 'intakeScheduling' && appointment.qualifyingAssessment === true;
    const treatment = category === 'rbt' && appointment.qualifyingTreatment === true;
    if (assessment || treatment)
      events.push(alohaEvent({ appointment, input, serviceDate, category, assessment }));
  }
  return events;
}
export interface ClaimEvidenceRecord {
  readonly id?: string | null;
  readonly Id?: string | null;
  readonly procedureCode?: string | number | null;
  readonly cptCode?: string | number | null;
  readonly serviceCode?: string | number | null;
  readonly CPT_Code__c?: string | number | null;
  readonly serviceDate?: string | null;
  readonly dateOfService?: string | null;
  readonly Service_Date__c?: string | null;
  readonly status?: string | null;
  readonly claimStatus?: string | null;
}
export interface ClaimsEvidenceInput extends SourceEvidenceContext {
  readonly records?: readonly ClaimEvidenceRecord[] | null;
}
function claimEvent(
  record: ClaimEvidenceRecord,
  input: ClaimsEvidenceInput
): StructuredEvidenceEvent[] {
  const code =
    [record.procedureCode, record.cptCode, record.serviceCode, record.CPT_Code__c].find((value) =>
      Boolean(value)
    ) ?? '';
  const serviceDate = firstEvidenceText(
    record.serviceDate,
    record.dateOfService,
    record.Service_Date__c
  );
  const status = firstEvidenceText(record.status, record.claimStatus) ?? '';
  if (String(code) !== '97153' || serviceDate === undefined || /void|reject|deny/i.test(status))
    return [];
  const owner = evidenceOwner(input.profile);
  return [
    structuredEvidenceEvent({
      opportunityId: input.profile.opportunityId,
      source: 'Claims',
      sourceRecordId: requiredEvidenceValue(
        firstEvidenceText(record.id, record.Id, `claim:${serviceDate}`),
        'sourceRecordId'
      ),
      eventDate: serviceDate,
      category: 'rbt',
      text: `A claim records 97153 service on ${String(isoDate(serviceDate))}, confirming direct-care treatment occurred.`,
      gateImpact: FIRST_SERVICE_GATE,
      actionOwner: owner,
      actionType: 'Salesforce Update',
      recommendedAction: `${owner} to verify Salesforce reflects the first 97153 service and admission transition.`,
      processRelevance: 10,
      milestoneDate: isoDate(serviceDate),
      followUpDate: nextBusinessDay(input.asOf),
    }),
  ];
}
export function adaptClaims(input: ClaimsEvidenceInput): StructuredEvidenceEvent[] {
  if (categoryForGate(input.gate) !== 'rbt') return [];
  return (input.records ?? []).flatMap((record) => claimEvent(record, input));
}
