import { conciseFact } from './narrative-text.js';
import type { NarrativePacket } from './narrative-types.js';
import { dateValue, humanDate } from './recommendation-date.js';
import { asSentence } from './recommendation-text.js';

function completedPrerequisiteSentence(packet: NarrativePacket, context: string): string | null {
  const completed = [
    ...(packet.evidenceTimeline ?? []),
    ...(packet.priorContext ?? []),
    ...(packet.story?.timeline ?? []),
  ]
    .filter((event) => event.factType === 'family-document-completed')
    .sort((left, right) => dateValue(right.date) - dateValue(left.date))[0];
  if (!completed) return null;
  const hasItems = Boolean(completed.requestedInformation);
  const items = hasItems ? completed.requestedInformation : 'the recorded intake prerequisites';
  const lead = `${String(humanDate(completed.date))}: Salesforce shows ${String(items)} complete, but `;
  if (/ia approved|initial assessment|assessment occurrence/.test(context))
    return `${lead}no scheduled or completed IA date is documented.`;
  if (/97151 started|treatment.?plan|clinical quality/.test(context))
    return `${lead}the current treatment-plan milestone and submission timing are not documented.`;
  return null;
}

function passedMilestoneSentence(context: string): string | null {
  const start = /planned first 97153 date of (\d{4}-\d{2}-\d{2}) passed/i.exec(context);
  if (start)
    return `The planned ${String(humanDate(start[1]))} first 97153 date has passed without a confirmed service; the actual start or replacement date must be verified.`;
  const assessment = /planned (?:initial assessment|ia) date of (\d{4}-\d{2}-\d{2}) passed/i.exec(
    context
  );
  if (assessment)
    return `The planned ${String(humanDate(assessment[1]))} initial-assessment date has passed without completion evidence; the actual occurrence or replacement date must be verified.`;
  return null;
}

export function latestUpdateSentence(packet: NarrativePacket): string {
  if (packet.newestUpdate)
    return `${String(humanDate(packet.newestUpdate.date))}: ${asSentence(conciseFact(packet.newestUpdate.fact))}`;
  const provider = packet.provider ? ` from ${packet.provider}` : '';
  const since = humanDate(packet.stageEntryDate ?? packet.slaCreatedDate ?? packet.storyStartDate);
  const sinceText = since ? ` since ${since}` : '';
  const context =
    `${packet.stage} ${String(packet.processPosition)} ${String(packet.unresolvedGate)}`.toLowerCase();
  const prerequisite = completedPrerequisiteSentence(packet, context);
  if (prerequisite) return prerequisite;
  const passed = passedMilestoneSentence(context);
  if (passed) return passed;
  if (/97151 started|treatment.?plan|clinical quality/.test(context))
    return `No substantive treatment-plan update was found${sinceText}${provider}; the provider's current drafting status and submission date are unknown.`;
  if (/ia approved|initial assessment|assessment occurrence/.test(context))
    return `No substantive initial-assessment update was found${sinceText}${provider}; no scheduled or completed IA date is documented.`;
  if (/ta approved|rbt|97153|staff/.test(context))
    return `No substantive staffing or treatment-start update was found${sinceText}${provider}; no confirmed RBT or first 97153 date is documented.`;
  if (/insurance verification|\bvob\b|eligibility/.test(context))
    return `No substantive insurance update was found${sinceText}; VOB, eligibility, and required intake documents are not confirmed complete.`;
  return `No substantive update was found${sinceText} for the current stage.`;
}
