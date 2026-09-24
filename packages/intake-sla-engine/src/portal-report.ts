import { portalReportMessages } from './portal-report-messages.js';
import type {
  ParsedPortalReport,
  PortalReportDedupedMessage,
  PortalReportInput,
  PortalReportSummary,
} from './portal-report-types.js';
import { firstEvidenceText } from './source-evidence-context.js';

const stageTerms = {
  insurance:
    /insurance|authorization|\bauth\b|payer|denial|denied|card|medicaid|tricare|cob|coordination of benefits/i,
  rbt: /\brbt\b|staffing|candidate|technician|interview|offer|hired|start date|first day/i,
  treatmentPlan: /treatment plan|\btp\b|signature|assessment|97151|clinical review/i,
  intakeScheduling:
    /schedule|appointment|availability|available|contact|reach|call|respond|response|unresponsive|intake|form|packet|next steps/i,
};
function stagePattern(stage: string): RegExp {
  if (['Insurance Verification', 'IA Requested', 'TA Requested'].includes(stage))
    return stageTerms.insurance;
  if (/97153|RBT|First Day|TA Approved - Pending Scheduling/i.test(stage)) return stageTerms.rbt;
  if (/Treatment Plan|97151/i.test(stage)) return stageTerms.treatmentPlan;
  return stageTerms.intakeScheduling;
}
function systemNoise(chat: PortalReportDedupedMessage): boolean {
  if (!chat.content) return true;
  if (
    /welcome! you've been matched with/i.test(chat.content) ||
    /headstart is here to help/i.test(chat.content)
  )
    return true;
  return (
    chat.content.length <= 12 &&
    /^(ok|okay|thanks|thank you|got it|yes|no|oka)[.! ]*$/i.test(chat.content)
  );
}
function resultText(
  deduped: readonly PortalReportDedupedMessage[],
  substantive: readonly PortalReportDedupedMessage[],
  actionableCount: number
): string {
  if (!deduped.length) return 'Searched: no client-linked portal chat found.';
  if (!substantive.length)
    return `Found ${String(deduped.length)} deduped client-linked message${deduped.length === 1 ? '' : 's'}; system or non-diagnostic only.`;
  const top = substantive
    .slice(0, 2)
    .map((chat) => `${chat.date || 'undated'}: ${chat.content}`)
    .join(' | ');
  const timing =
    actionableCount > 0
      ? 'Stage-relevant evidence found; freshness is evaluated from the message date.'
      : 'Historical/supporting context only; not promoted into blocker.';
  return `${timing} ${top}`;
}
export function parsePortalChats({
  opportunity,
  sla,
  responses = [],
}: PortalReportInput): ParsedPortalReport {
  const deduped = portalReportMessages(responses);
  const relevant = stagePattern(firstEvidenceText(opportunity?.StageName, sla?.Stage__c) ?? '');
  const substantive = deduped.filter((chat) => !systemNoise(chat));
  const actionable = substantive.filter((chat) => relevant.test(chat.content));
  const channelConflict = deduped.some((chat) => chat.channelConflict);
  const latestSubstantive = substantive[0];
  const latestRelevant = actionable[0];
  return {
    result: resultText(deduped, substantive, actionable.length),
    quality: actionable.length ? 'Likely' : deduped.length ? 'Weak' : 'Not found',
    promotableText: actionable.map((chat) => chat.content).join(' '),
    checked: true,
    messageCount: deduped.length,
    substantiveCount: substantive.length,
    actionableCount: actionable.length,
    latestSubstantiveAt: latestSubstantive?.date ?? '',
    latestSubstantiveText: latestSubstantive?.content ?? '',
    latestRelevantAt: latestRelevant?.date ?? '',
    latestRelevantText: latestRelevant?.content ?? '',
    channelAttributionReliable: !channelConflict,
    gap: channelConflict
      ? 'Portal messages were deduplicated across conflicting channel labels; channel attribution was ignored.'
      : '',
  };
}
export function noPortalData(): PortalReportSummary {
  return {
    result: 'Not checked: no portal enrichment input supplied to the sheet builder.',
    quality: 'Not checked',
    promotableText: '',
    checked: false,
    messageCount: 0,
    substantiveCount: 0,
    actionableCount: 0,
    channelAttributionReliable: false,
    gap: 'Portal chats not supplied to the local sheet builder',
  };
}
