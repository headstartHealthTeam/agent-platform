import { slackDisplayText, slackDisplayTimestamp } from '@headstart-health/slack-data';

import { interpretConversation } from './conversation-interpretation.js';
import { normalizedSlackEvidence as normalize } from './slack-evidence-anchors.js';
import { slackTargetSegment } from './slack-evidence-segments.js';
import type { SlackEvidenceEvent, SlackSegmentInput } from './slack-evidence-types.js';

function holdDate(value: string): string | null {
  const lines = value.replace(/\r/g, '').split('\n');
  for (let factLine = 0; factLine < lines.length; factLine++) {
    if (!/\b(?:on hold|pause|paused|hold off)\b/i.test(slackDisplayText(lines.at(factLine))))
      continue;
    for (let index = factLine; index >= 0; index--) {
      const date = slackDisplayTimestamp(lines.at(index));
      if (date) return date;
    }
  }
  return null;
}
export function interpretSlackSegment(input: SlackSegmentInput): SlackEvidenceEvent[] {
  const {
    rawValue,
    profile,
    gate,
    asOf,
    sourceRecordId,
    eventDate,
    channel,
    author,
    threadScoped = false,
  } = input;
  const segment = slackTargetSegment(rawValue, profile, threadScoped);
  if (!segment.text || !eventDate) return [];
  const cleaned = slackDisplayText(segment.text);
  const normalized = normalize(cleaned);
  if (
    !normalized.includes(normalize(profile.opportunityName)) &&
    !normalized.includes(normalize(profile.opportunityId)) &&
    !segment.assumedIdentityMatch
  )
    return [];
  const events = interpretConversation({
    opportunityId: profile.opportunityId,
    source: 'Slack',
    sourceRecordId,
    eventDate,
    text: cleaned,
    rawText: cleaned,
    matchQuality: segment.quality,
    gate,
    asOf,
    matchedIdentities: [
      {
        opportunityId: profile.opportunityId,
        opportunityName: profile.opportunityName,
        channel,
        author,
        assumedIdentityMatch: Boolean(segment.assumedIdentityMatch),
        assumedIdentityNote: segment.assumedIdentityNote ?? '',
        matchedAs: segment.matchedAs ?? '',
        matchScore: segment.score ?? null,
      },
    ],
    assumedIdentityMatch: Boolean(segment.assumedIdentityMatch),
    assumedIdentityNote: segment.assumedIdentityNote ?? '',
    matchedAs: segment.matchedAs ?? '',
  });
  return events.map((event) => {
    const historicalHold =
      event.factType === 'provider-hold' || event.factType === 'paired-hold'
        ? holdDate(segment.text)
        : null;
    const dated = historicalHold ? { ...event, eventDate: historicalHold } : event;
    return event.factType === 'auth-denial-reason' || event.factType === 'auth-denied'
      ? { ...dated, supportingOnly: true }
      : dated;
  });
}
