import { isoDate } from './dates.js';
import type { EvidenceDate } from './evidence.js';
import { categoryForGate, type GateContext } from './gate-context.js';
import type { SourceAuthorizationRecord } from './source-authorization-types.js';
import {
  evidenceOwner,
  requiredEvidenceValue,
  type SourceEvidenceContext,
} from './source-evidence-context.js';
import { sourceHtmlText } from './source-html-text.js';
import { structuredEvidenceEvent, type StructuredEvidenceEvent } from './structured-evidence.js';

type PortalAuthField =
  | 'opportunityId'
  | 'clientOpportunityId'
  | 'authType'
  | 'type'
  | 'Authorization_Type__c'
  | 'status'
  | 'Auth_Status__c'
  | 'submittedAt'
  | 'createdAt'
  | 'Portal_Submission_Date__c'
  | 'updatedAt'
  | 'comments'
  | 'Notes__c';
export type PortalAuthorizationEvidenceRecord = Readonly<
  Partial<Record<PortalAuthField, string | null | undefined>>
> & {
  readonly requestNumber?: string | number | null | undefined;
  readonly friendlyId?: string | number | null | undefined;
  readonly Id?: string | number | null | undefined;
};
export interface PortalAuthorizationEvidenceInput extends Omit<
  SourceEvidenceContext,
  'gate' | 'asOf'
> {
  readonly asOf?: EvidenceDate | null;
  readonly records?: readonly PortalAuthorizationEvidenceRecord[] | null;
  readonly salesforceAuthorizationRecords?: readonly SourceAuthorizationRecord[] | null;
  readonly clinicalQualityRecords?: readonly unknown[] | null;
  readonly gate?: (GateContext & { readonly stage?: string | null }) | null;
}
function submittedAt(record: PortalAuthorizationEvidenceRecord): string | null | undefined {
  return record.submittedAt ?? record.createdAt ?? record.Portal_Submission_Date__c;
}
function selectedRecords(
  input: PortalAuthorizationEvidenceInput
): PortalAuthorizationEvidenceRecord[] {
  const cutoff = new Date(input.asOf ?? Date.now()).valueOf();
  return (input.records ?? [])
    .filter((record) => {
      const opportunityId = record.opportunityId ?? record.clientOpportunityId;
      const requestType = record.authType ?? record.type ?? record.Authorization_Type__c;
      const status = record.status ?? record.Auth_Status__c ?? '';
      const date = submittedAt(record);
      return (
        (!opportunityId || opportunityId === input.profile.opportunityId) &&
        /^(?:treatment|treatment auth request|treatment authorization)$/i.test(
          (requestType ?? '').trim()
        ) &&
        Boolean(date) &&
        !/cancel|withdraw|void|duplicate/i.test(status) &&
        new Date(date ?? '').valueOf() <= cutoff
      );
    })
    .sort(
      (left, right) =>
        new Date(submittedAt(right) ?? '').valueOf() - new Date(submittedAt(left) ?? '').valueOf()
    );
}
interface PortalContext {
  readonly input: PortalAuthorizationEvidenceInput;
  readonly record: PortalAuthorizationEvidenceRecord;
  readonly date: string;
  readonly status: string;
  readonly number: string;
  readonly comments: string;
}
type PortalNarrative = Readonly<
  Record<
    | 'text'
    | 'gateImpact'
    | 'actionOwner'
    | 'actionType'
    | 'recommendedAction'
    | 'factType'
    | 'eventDate',
    string
  >
>;
function portalNarrative({
  input,
  record,
  date,
  status,
  number,
  comments,
}: PortalContext): PortalNarrative {
  if (status === 'ACTION_REQUIRED')
    return {
      eventDate: requiredEvidenceValue(record.updatedAt ?? date, 'eventDate'),
      text: comments
        ? `Portal Treatment Authorization request ${number} requires action after provider submission; the portal documents a requested correction or missing item.`
        : `Portal Treatment Authorization request ${number} requires action after provider submission, but the requested correction or missing item is not stated in the list view.`,
      gateImpact:
        'Provider treatment plan was submitted, but portal-request corrections remain before Clinical Quality can advance',
      actionOwner: evidenceOwner(input.profile),
      actionType: 'Provider Outreach',
      recommendedAction: `${evidenceOwner(input.profile)} to review Portal Treatment Authorization request ${number}, coordinate the requested correction with the provider, and confirm resubmission.`,
      factType: 'tp-portal-action-required',
    };
  if (!['REVIEWING', 'IN_PROGRESS'].includes(status))
    return {
      eventDate: requiredEvidenceValue(record.updatedAt ?? date, 'eventDate'),
      text: `Portal Treatment Authorization request ${number} was submitted on ${date} and is ${status.toLowerCase().replace(/_/g, ' ')}; Salesforce has not yet recorded the corresponding downstream treatment-plan workflow state.`,
      gateImpact:
        'Portal authorization progress and Salesforce treatment-plan records require reconciliation',
      actionOwner: 'Insurance Ops',
      actionType: 'Salesforce Update',
      recommendedAction:
        'Insurance Ops to reconcile the portal request with Salesforce, create or update the required records, and move the Opportunity to the correct stage.',
      factType: 'tp-portal-salesforce-state-mismatch',
    };
  return {
    eventDate: date,
    text: `The provider submitted Portal Treatment Authorization request ${number} on ${date}. No Salesforce Treatment Authorization or Clinical Quality record exists yet, so Insurance Ops must create the downstream records and move the Opportunity to Treatment Plan In-review.`,
    gateImpact:
      'Provider treatment plan received; Salesforce Treatment Authorization and Clinical Quality record creation and stage advancement remain',
    actionOwner: 'Insurance Ops',
    actionType: 'Salesforce Update',
    recommendedAction:
      'Insurance Ops to create the Salesforce Treatment Authorization and Clinical Quality records and move the Opportunity to Treatment Plan In-review.',
    factType: 'tp-portal-submitted-awaiting-clinical-quality',
  };
}
/** Project existing portal progress without treating provider submission as payer submission. */
export function adaptPortalTreatmentAuthorizationRequests(
  input: PortalAuthorizationEvidenceInput
): StructuredEvidenceEvent[] {
  const stage = (input.profile.stage ?? input.gate?.stage ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !/^97151 started\b/.test(stage) ||
    categoryForGate(input.gate) !== 'treatmentPlan' ||
    (input.clinicalQualityRecords ?? []).length > 0
  )
    return [];
  const record = selectedRecords(input)[0];
  if (record === undefined) return [];
  const payerSubmission = (input.salesforceAuthorizationRecords ?? []).some(
    (authorization) =>
      /^(?:treatment auth request|treatment authorization)$/i.test(
        (authorization.Authorization_Type__c ?? '').trim()
      ) &&
      (Boolean(authorization.Treatment_Auth_Submission_Date__c) ||
        Boolean(authorization.Master_Submission_Date__c))
  );
  if (payerSubmission) return [];
  const date = requiredEvidenceValue(isoDate(submittedAt(record)), 'eventDate');
  const status = (record.status ?? record.Auth_Status__c ?? 'REVIEWING')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  const number = String(record.requestNumber ?? record.friendlyId ?? record.Id ?? 'unknown');
  const comments = sourceHtmlText(record.comments ?? record.Notes__c ?? '');
  return [
    structuredEvidenceEvent({
      opportunityId: input.profile.opportunityId,
      source: 'Portal Auth Request',
      sourceRecordId: number,
      category: 'treatmentPlan',
      ...portalNarrative({ input, record, date, status, number, comments }),
      processRelevance: 14,
      issueKey: 'clinical-review',
      rawText: comments || null,
    }),
  ];
}
