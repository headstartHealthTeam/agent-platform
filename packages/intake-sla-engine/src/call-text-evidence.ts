import { interpretConversation, isAutomatedCommunication } from './conversation-interpretation.js';
import type { ConversationEvidenceEvent } from './conversation-interpretation.js';
import type { EvidenceDate } from './evidence.js';
import type { GateContext } from './gate-context.js';
import { firstEvidenceText } from './source-evidence-context.js';
import { assessTextMatch } from './text-match.js';
import type { TextMatchIdentity } from './text-match.js';

export interface CallTextRecord {
  readonly Id: string;
  readonly aircall__Opportunity__c?: string | null | undefined;
  readonly Opportunity__c?: string | null | undefined;
  readonly WhatId?: string | null | undefined;
  readonly WhoId?: string | null | undefined;
  readonly RelatedToId?: string | null | undefined;
  readonly Related_Record__c?: string | null | undefined;
  readonly Authorization__c?: string | null | undefined;
  readonly Lead__c?: string | null | undefined;
  readonly aircall__Number_Name__c?: string | null | undefined;
  readonly aircall__Number_name__c?: string | null | undefined;
  readonly aircall__Number__c?: string | null | undefined;
  readonly aircall__Phone_Number__c?: string | null | undefined;
  readonly Internal_Number__c?: string | null | undefined;
  readonly aircall__External_Number__c?: string | null | undefined;
  readonly aircall__Phone_number__c?: string | null | undefined;
  readonly Provider_Name__c?: string | null | undefined;
  readonly Practice_Name__c?: string | null | undefined;
  readonly Authorization_Number__c?: string | null | undefined;
  readonly Payer__c?: string | null | undefined;
  readonly Subject?: string | null | undefined;
  readonly Headstart_Full_Transcript__c?: string | null | undefined;
  readonly aircall__Message_Content__c?: string | null | undefined;
  readonly aircall__Call_summary__c?: string | null | undefined;
  readonly aircall__Call_Start_Date_Time__c?: string | null | undefined;
  readonly CreatedDate?: string | null | undefined;
  readonly aircall__SMS_Direction__c?: string | null | undefined;
  readonly aircall__Call_Type__c?: string | null | undefined;
  readonly CallType?: string | null | undefined;
}
export interface CallsAndTextsInput {
  readonly records?: readonly CallTextRecord[] | null | undefined;
  readonly profile: TextMatchIdentity & { readonly slaId?: string | null | undefined };
  readonly gate?: GateContext | null | undefined;
  readonly asOf: EvidenceDate;
}
export interface CallTextIdentity {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly line: string;
  readonly sourceType: string;
  readonly matchQuality: string;
}
const APPROVED_LINES = new Set([
  'intake',
  'insurance ops other',
  'insurance ops vob',
  'customer success',
  'scheduling pilot',
  'rbt',
]);
const APPROVED_LINE_NUMBERS = new Set([
  '4783476197',
  '7372370310',
  '7372048734',
  '4152869208',
  '2197773755',
  '2294896491',
]);
interface CallContent {
  readonly text: string;
  readonly sourceType: string;
}
function callContent(record: CallTextRecord): CallContent | null {
  if (record.Headstart_Full_Transcript__c)
    return { text: record.Headstart_Full_Transcript__c, sourceType: 'Transcript' };
  if (record.aircall__Message_Content__c)
    return { text: record.aircall__Message_Content__c, sourceType: 'SMS' };
  if (record.aircall__Call_summary__c)
    return { text: record.aircall__Call_summary__c, sourceType: 'Call Summary' };
  return null;
}
function linkedIds(record: CallTextRecord): (string | null | undefined)[] {
  return [
    record.aircall__Opportunity__c,
    record.Opportunity__c,
    record.WhatId,
    record.WhoId,
    record.RelatedToId,
    record.Related_Record__c,
    record.Authorization__c,
    record.Lead__c,
  ].filter(Boolean);
}
function sourceContext(record: CallTextRecord): string {
  return [
    record.aircall__Number_Name__c,
    record.aircall__Number_name__c,
    record.aircall__External_Number__c,
    record.aircall__Phone_number__c,
    record.Provider_Name__c,
    record.Practice_Name__c,
    record.Authorization_Number__c,
    record.Payer__c,
    record.Subject,
  ]
    .filter(Boolean)
    .join(' ');
}
function admittedCall(record: CallTextRecord, opportunityId: string, lineName: string): boolean {
  const linked =
    firstEvidenceText(record.aircall__Opportunity__c, record.Opportunity__c) ??
    ((record.WhatId ?? '').startsWith('006') ? record.WhatId : null);
  if (linked && linked !== opportunityId) return false;
  const line = lineName.toLowerCase();
  const number = (
    firstEvidenceText(
      record.aircall__Number__c,
      record.aircall__Phone_Number__c,
      record.Internal_Number__c
    ) ?? ''
  )
    .replace(/\D/g, '')
    .slice(-10);
  return !line || APPROVED_LINES.has(line) || APPROVED_LINE_NUMBERS.has(number);
}
function callQuality(
  record: CallTextRecord,
  content: CallContent,
  input: CallsAndTextsInput
): string {
  const { profile } = input;
  const ids = new Set(
    [...(profile.salesforceRecordIds ?? []), profile.opportunityId, profile.slaId].filter(Boolean)
  );
  const quality = linkedIds(record).some((id) => ids.has(id))
    ? 'Direct'
    : assessTextMatch({
        text: content.text,
        sourceContext: sourceContext(record),
        identity: profile,
        stage: profile.stage,
      }).quality;
  return content.sourceType === 'Call Summary' && quality === 'Direct' ? 'Likely' : quality;
}
export function adaptCallsAndTexts(
  input: CallsAndTextsInput
): ConversationEvidenceEvent<CallTextIdentity>[] {
  const { profile, gate, asOf } = input;
  return (input.records ?? []).flatMap((record) => {
    const lineName = record.aircall__Number_Name__c ?? record.aircall__Number_name__c ?? '';
    if (!admittedCall(record, profile.opportunityId, lineName)) return [];
    const content = callContent(record);
    if (
      content === null ||
      (content.sourceType === 'SMS' && isAutomatedCommunication(content.text))
    )
      return [];
    const matchQuality = callQuality(record, content, input);
    return interpretConversation({
      opportunityId: profile.opportunityId,
      source: 'Calls / Texts',
      sourceRecordId: record.Id,
      eventDate:
        firstEvidenceText(record.aircall__Call_Start_Date_Time__c, record.CreatedDate) ?? asOf,
      text: content.text,
      rawText: content.text,
      matchQuality,
      gate,
      asOf,
      matchedIdentities: [
        {
          opportunityId: profile.opportunityId,
          opportunityName: profile.opportunityName,
          line: lineName,
          sourceType: content.sourceType,
          matchQuality,
        },
      ],
      context: {
        direction:
          firstEvidenceText(
            record.aircall__SMS_Direction__c,
            record.aircall__Call_Type__c,
            record.CallType
          ) ?? '',
        line: lineName,
        sourceType: content.sourceType,
      },
    });
  });
}
