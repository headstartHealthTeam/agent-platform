import {
  corroboratedPortalRevisionDetail,
  corroboratedReportedSubmissionDate,
} from './narrative-evidence.js';
import { conciseRevisionTopics } from './narrative-text.js';
import type { NarrativePacket } from './narrative-types.js';
import { humanDate } from './recommendation-date.js';
import { requiredItemIsPlural, shortenSentence, truncate } from './recommendation-text.js';

export function specialShortSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (newest?.factType === 'tp-resubmitted-for-review')
    return `${String(humanDate(newest.date))}: The provider reports the corrected treatment plan was resubmitted for review. Clinical Quality receipt and the current review disposition need confirmation.`;
  if (newest?.factType === 'tp-portal-submitted-awaiting-clinical-quality') {
    const request = newest.sourceRecordId ? ` #${newest.sourceRecordId}` : '';
    return truncate(
      `${String(humanDate(newest.date))}: The provider submitted portal Treatment Authorization request${request}. Insurance Ops must create the Salesforce Authorization and Clinical Quality records and move the case to Treatment Plan In-review.`,
      254
    );
  }
  if (packet.startEvidenceConflict) {
    const reported = String(humanDate(packet.startEvidenceConflict.reportedDate));
    const planned = String(humanDate(packet.startEvidenceConflict.plannedDate));
    return truncate(
      `${reported}: The provider reported treatment started, but Salesforce and linked billing have no first 97153 and staffing records still show ${planned} as the planned start. The actual first-service date must be verified.`,
      254
    );
  }
  const conflict = packet.iaCompletionDocumentationConflict;
  if (!conflict) return null;
  const date = String(humanDate(newest?.date ?? conflict.reportedDate));
  const plural = requiredItemIsPlural(conflict.requiredItem);
  return shortenSentence(
    `${date}: The provider reported the IA occurred, but Salesforce has no completion date and ${String(conflict.requiredItem)} ${plural ? 'remain' : 'remains'} outstanding. ${String(packet.action.owner)} must verify both records.`,
    254
  );
}

export function portalRevisionShortSummary(packet: NarrativePacket): string | null {
  const revision = corroboratedPortalRevisionDetail(packet);
  const topics = conciseRevisionTopics(revision);
  if (!revision || !topics) return null;
  const owner = [packet.action.owner, packet.csm].find(Boolean) ?? 'CSM';
  const submission = corroboratedReportedSubmissionDate(packet);
  const submitted = Boolean(submission);
  const date = String(humanDate(packet.structuredGateDetail?.date));
  if (packet.newestUpdate?.factType === 'tp-clinical-review') {
    const update = String(humanDate(packet.newestUpdate.date ?? packet.structuredGateDetail?.date));
    return truncate(
      `${update}: Clinical Quality returned edits to ${topics}. The corrected plan is awaiting secondary review; the final disposition is not recorded. ${owner} must confirm the review outcome.`,
      254
    );
  }
  return truncate(
    submitted
      ? `${date}: Provider reported submitting the plan on ${String(humanDate(submission))}. Clinical Quality returned edits to ${topics}. No resubmission is recorded; ${owner} must confirm completion and re-review.`
      : `${date}: Clinical Quality returned the submitted treatment plan with edits to ${topics}. Resubmission is not recorded; ${owner} must confirm completion and re-review.`,
    254
  );
}
