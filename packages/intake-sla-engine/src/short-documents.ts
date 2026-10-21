import {
  carriedSpecificRequirement,
  complementaryAuthorizationProgress,
} from './narrative-evidence.js';
import { conciseFact } from './narrative-text.js';
import type { NarrativePacket } from './narrative-types.js';
import { requiredItemFromEvent } from './recommendation-candidate.js';
import { humanDate } from './recommendation-date.js';
import {
  asSentence,
  capitalize,
  requiredItemIsPlural,
  shortenSentence,
  truncate,
} from './recommendation-text.js';

export function carriedRequirementShortSummary(packet: NarrativePacket): string | null {
  const progress = complementaryAuthorizationProgress(packet);
  if (progress)
    return shortenSentence(
      `${String(humanDate(progress.date))}: ${asSentence(conciseFact(progress.fact))}`,
      254
    );
  const carried = carriedSpecificRequirement(packet);
  if (!carried) return null;
  const prefix =
    packet.newestUpdate?.factType === 'auth-additional-info'
      ? 'The payer still requires'
      : 'The required item remains';
  return truncate(
    `${String(humanDate(packet.newestUpdate?.date))}: ${prefix} ${String(carried.requestedInformation)}; no confirmation shows the requirement was resolved or submitted.`,
    254
  );
}

export function missingAuthorizationShortSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (
    !/authorization not found|no current (?:initial|treatment) authorization/i.test(
      packet.unresolvedGate ?? ''
    ) ||
    !newest ||
    !['required-document', 'family-document-update'].includes(newest.factType ?? '')
  )
    return null;
  const item = requiredItemFromEvent(newest);
  if (!item) return null;
  const phase = /^IA\b/i.test(String(packet.stage)) ? 'initial' : 'treatment';
  const plural = requiredItemIsPlural(item);
  return shortenSentence(
    `${String(humanDate(newest.date))}: ${capitalize(item)} ${plural ? 'remain' : 'remains'} outstanding, and no current ${phase} authorization is on file. Intake must complete ${plural ? 'the documents' : 'the document'} before the payer path can be established.`,
    254
  );
}

export function diagnosticShortSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (
    newest?.factType !== 'family-document-update' ||
    !/diagnostic evaluation|diagnostic report/i.test(newest.fact)
  )
    return null;
  const denial = (packet.story?.timeline ?? []).find(
    (event) =>
      Boolean(event.denialReason) &&
      /authorization|payer/i.test(`${event.issueKey ?? ''} ${event.fact}`)
  );
  if (!denial) return null;
  return shortenSentence(
    `${String(humanDate(newest.date))}: After the payer denied the prior request because ${String(denial.denialReason)}, the family began obtaining a new diagnostic evaluation; the updated report has not been received.`,
    254
  );
}

export function requiredDocumentShortSummary(packet: NarrativePacket): string | null {
  const newest = packet.newestUpdate;
  if (newest?.factType !== 'required-document') return null;
  const item = requiredItemFromEvent(newest);
  const date = String(humanDate(newest.date));
  if (item && /IA Approved|IA Scheduled|IC Completed/i.test(String(packet.stage)))
    return truncate(
      `${date}: ${capitalize(item)} remains outstanding; the initial assessment cannot be scheduled or confirmed complete until Intake obtains and validates it.`,
      254
    );
  if (item && /97151 Started|Treatment Plan/i.test(String(packet.stage)))
    return truncate(
      `${date}: ${capitalize(item)} remains outstanding; treatment-plan work cannot advance until Intake obtains and validates it.`,
      254
    );
  return null;
}
