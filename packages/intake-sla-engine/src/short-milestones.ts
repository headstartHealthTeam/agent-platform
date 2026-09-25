import { futureMilestoneLabels } from './narrative-future.js';
import type { NarrativePacket } from './narrative-types.js';
import { requiredItemFromEvent } from './recommendation-candidate.js';
import { humanDate } from './recommendation-date.js';
import { requiredItemIsPlural, shortenSentence, truncate } from './recommendation-text.js';

export function assessmentPlanShortSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (
    !/IA Approved|IA Scheduled|IC Completed/i.test(String(packet.stage)) ||
    !newest ||
    !(
      newest.factType === 'ia-planned' ||
      /assessment or intake appointment was reported scheduled/i.test(newest.fact)
    ) ||
    !packet.futureMilestones?.length
  )
    return null;
  const dates = futureMilestoneLabels(packet);
  if (!dates.length) return null;
  const date = String(humanDate(newest.date));
  const required = requiredItemFromEvent(packet.outstandingRequiredDocument);
  if (required) {
    const plural = requiredItemIsPlural(required);
    return shortenSentence(
      `${date}: The IA is planned for ${String(dates[0])}, but ${required} ${plural ? 'remain' : 'remains'} outstanding. Intake must obtain and validate ${plural ? 'them' : 'it'} before the assessment can proceed.`,
      254
    );
  }
  return shortenSentence(
    `${date}: The IA is scheduled for ${String(dates[0])}${dates[1] ? `, with remaining assessment work planned for ${dates[1]}` : ''}; completion is not yet confirmed.`,
    254
  );
}

export function remainingMilestoneShortSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (!newest) return null;
  const date = String(humanDate(newest.date));
  if (newest.factType === 'tp-ready' && !packet.structuredGateDetail)
    return truncate(
      `${date}: The provider reports the treatment plan is complete, but no Clinical Quality record or Headstart-review submission date is recorded.`,
      254
    );
  if (
    newest.factType === 'required-document' &&
    /required intake or payer document|required document remains|outstanding required documentation/i.test(
      newest.fact
    )
  ) {
    const prior = (packet.evidenceTimeline ?? []).find(
      (event) =>
        event.id !== newest.id &&
        event.factType === 'required-document' &&
        Boolean(event.requestedInformation)
    );
    if (prior)
      return truncate(
        `${date}: Required documentation is still outstanding; the last identified item was ${String(prior.requestedInformation)} on ${String(humanDate(prior.date))}, with no confirmation it was resolved.`,
        254
      );
  }
  if (
    (newest.factType === 'tp-clinical-review' ||
      /treatment plan remains in clinical review/i.test(newest.fact)) &&
    packet.structuredGateDetail?.factType === 'tp-revisions'
  )
    return truncate(
      `${date}: The treatment plan remains in Clinical Quality review. Review began and edits were returned on ${String(humanDate(packet.structuredGateDetail.date))}; provider resubmission is not recorded.`,
      254
    );
  return null;
}
