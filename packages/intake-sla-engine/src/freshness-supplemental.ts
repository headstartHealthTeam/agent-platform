import { isAdministrativeOnly } from './freshness-administrative.js';
import { addFreshnessCandidate, type FreshnessContext } from './freshness-candidates.js';
import type { FreshnessSupplemental } from './freshness-source-types.js';
import { freshnessText, freshnessTimestamp } from './freshness-values.js';
import { evaluateConversationMatch } from './search-pathway-match.js';
import { firstEvidenceDate, firstEvidenceText } from './source-evidence-context.js';

function supplementalEventDate(event: FreshnessSupplemental): string {
  if (!/search/i.test(freshnessText(event.category)))
    return (
      firstEvidenceText(event.date, event.eventDate, event.createdAt, event.modifiedTime) ?? ''
    );
  const embedded = [
    ...freshnessText(event.text).matchAll(
      /\b(20\d{2}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}|))|)/g
    ),
  ]
    .map((match) => `${match[1] ?? ''}T${match[2] ?? '12:00:00'}Z`)
    .filter((value) => freshnessTimestamp(value) !== null)
    .sort((a, b) => (freshnessTimestamp(b) ?? 0) - (freshnessTimestamp(a) ?? 0));
  return embedded[0] ?? '';
}
function collectSupplemental(
  context: FreshnessContext,
  source: string,
  records: readonly FreshnessSupplemental[]
): void {
  for (const record of records) {
    const body = freshnessText(
      firstEvidenceText(record.text, record.summary, record.name, record.title)
    );
    if (
      !body ||
      record.substantive === false ||
      !context.relevant.test(body) ||
      isAdministrativeOnly(body)
    )
      continue;
    const match = evaluateConversationMatch({
      text: body,
      metadata: [record.category, ...(record.matchedEntities ?? [])].filter(Boolean).join(' '),
      opportunityId: context.input.opp.Id,
      linkedOpportunityId: record.opportunityId,
      identity: context.input.identity ?? {},
    });
    if (!match.matched) continue;
    addFreshnessCandidate(context.candidates, {
      at: supplementalEventDate(record),
      source,
      sourceRecordId: firstEvidenceText(record.sourceId, record.id, record.fileId) ?? '',
      summary: body,
      kind: /search/i.test(freshnessText(record.category)) ? 'search-bundle' : 'discussion',
      matchQuality: record.quality === 'Weak' ? 'Weak' : match.quality,
      sourceQuality: record.quality === 'Weak' ? 'Weak' : match.quality,
      matchScore: match.score,
      matchReasons: match.reasons,
    });
  }
}
export function collectSupplementalFreshness(context: FreshnessContext): void {
  for (const record of context.input.linkedBillingClaims ?? [])
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceDate(
        record.evidenceDate,
        record.createdDate,
        record.CreatedDate,
        record.completedDate,
        record.Completed_Date__c
      ),
      source: 'Linked Billing / Claims',
      sourceRecordId: firstEvidenceText(record.id, record.Id, record.billingClaimId) ?? '',
      summary: [
        firstEvidenceText(record.billingCode) ?? record.Billing_Code__c,
        firstEvidenceText(record.serviceName, record.Service_Name__c),
        firstEvidenceText(record.status, record.Appointment_Status__c),
        record.summary,
        firstEvidenceText(record.provider, record.Rendering_Provider__c),
        firstEvidenceText(record.serviceDate, record.Appt_Date__c),
      ]
        .filter(Boolean)
        .join('; '),
      kind: 'record',
    });
  collectSupplemental(context, 'Gmail', context.input.gmail ?? []);
  collectSupplemental(context, 'Linked Files', context.input.linkedFiles ?? []);
}
