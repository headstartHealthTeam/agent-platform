import { activeCarryForwardSentence } from './narrative-carry.js';
import { denialOperationalSummary, denialReasonContext } from './narrative-denial.js';
import {
  carriedSpecificRequirement,
  complementaryAuthorizationProgress,
} from './narrative-evidence.js';
import { futureMilestoneSentence } from './narrative-future.js';
import { gateSentence } from './narrative-gate.js';
import { futureCycleContextSentence, resolvedProgressSentence } from './narrative-history.js';
import { latestUpdateSentence } from './narrative-latest.js';
import { specialOperationalSummary } from './narrative-operational-special.js';
import { processPositionSentence } from './narrative-process.js';
import { materialAuthorizationScopeSentence } from './narrative-scope.js';
import {
  freshnessSentence,
  missingCompletionConfirmationSentence,
  nextStepSentence,
  sourceUpdateLead,
  structuredDetailSentence,
} from './narrative-state.js';
import {
  conciseFact,
  factSubsumesBlocker,
  humanizeConflict,
  inlineClause,
} from './narrative-text.js';
import type { NarrativePacket } from './narrative-types.js';
import { asInlineSentence, asSentence } from './recommendation-text.js';

function narrativeBlocker(packet: NarrativePacket): string | null {
  const blocker = gateSentence(packet);
  if (!blocker || packet.newestUpdate?.factType === 'tp-ready') return null;
  if (
    packet.story?.currentGateIssueKey === 'required-documentation' &&
    ['required-document', 'family-document-update'].includes(packet.newestUpdate?.factType ?? '')
  )
    return null;
  if (packet.newestUpdate?.fact && factSubsumesBlocker(packet.newestUpdate.fact, blocker))
    return null;
  if (
    /first 97153|direct-care service/i.test(blocker) &&
    /first 97153|direct-care service|no candidate assignment|no .*start date/i.test(
      `${packet.newestUpdate?.fact ?? ''} ${packet.structuredGateDetail?.fact ?? ''}`
    )
  )
    return null;
  if (
    packet.futureMilestones?.length &&
    /initial assessment.*(?:not yet confirmed|completion)/i.test(blocker) &&
    /initial assessment|\bIA\b/i.test(packet.futureMilestones.map((event) => event.fact).join(' '))
  )
    return null;
  if (!packet.newestUpdate && /^The planned\b/i.test(latestUpdateSentence(packet))) return null;
  if (
    packet.newestUpdate &&
    /payer submission is not yet confirmed/i.test(packet.newestUpdate.fact) &&
    /payer submission is not yet confirmed/i.test(blocker)
  )
    return null;
  return blocker;
}

function latestSentence(packet: NarrativePacket): string {
  const newest = packet.newestUpdate;
  if (!newest) return latestUpdateSentence(packet);
  const carried = carriedSpecificRequirement(packet);
  const lead = sourceUpdateLead({ asOf: packet.asOf, newestUpdate: newest });
  if (carried)
    return `${lead} ${newest.factType === 'auth-additional-info' ? 'the payer still requires' : 'the required item remains'} ${String(carried.requestedInformation)}; no confirmation shows the requirement was resolved or submitted.`;
  return `${lead} ${asInlineSentence(conciseFact(newest.fact))}`;
}

type Entry = readonly [string, string | null];

function currentEntries(packet: NarrativePacket): Entry[] {
  const future =
    packet.futureMilestones?.[0]?.id === packet.newestUpdate?.id
      ? null
      : futureMilestoneSentence(packet);
  const blocker = narrativeBlocker(packet);
  const scope = materialAuthorizationScopeSentence(packet);
  const progress = complementaryAuthorizationProgress(packet);
  const progressSentence = progress
    ? `A same-day provider update adds that ${asInlineSentence(conciseFact(progress.fact))}`
    : null;
  // The specialized denial path is handled before this branch, as in the approved renderer.
  return [
    ['stage', processPositionSentence(packet)],
    ['latest', latestSentence(packet)],
    ['progress', progressSentence],
    ['structured', structuredDetailSentence(packet)],
    ['completion', missingCompletionConfirmationSentence(packet)],
    ['future', future],
    ['scope', scope ? `${scope}.` : null],
    ['denial', null],
    ['carry', activeCarryForwardSentence(packet)],
    ['blocker', blocker ? asSentence(blocker) : null],
  ];
}

function conflictSentence(packet: NarrativePacket, context: string): string | null {
  const conflicts = packet.conflicts
    .filter(
      (conflict) =>
        !/^(?:true|false)$/i.test(conflict.trim()) &&
        !/stage-relevant operational update|unresolved gate is described in the sla summary/i.test(
          conflict
        )
    )
    .map((conflict) => humanizeConflict(conflict, context))
    .filter(Boolean);
  return conflicts.length ? `Sources disagree: ${conflicts.join('; ')}.` : null;
}

export function operationalSummary(packet: NarrativePacket): string {
  const special = specialOperationalSummary(packet);
  if (special) return special;
  const denial = denialReasonContext(packet);
  if (denial) return denialOperationalSummary(packet, denial);
  const entries = currentEntries(packet);
  const context = entries
    .map(([, sentence]) => sentence)
    .filter(Boolean)
    .join(' ');
  entries.push(
    ['conflict', conflictSentence(packet, context)],
    ['action', nextStepSentence(packet)]
  );
  const core = entries.filter(([, sentence]) => Boolean(sentence));
  if (core.length < 4) {
    const freshness = freshnessSentence(packet);
    const actionIndex = core.findIndex(([key]) => key === 'action');
    if (freshness)
      core.splice(actionIndex >= 0 ? actionIndex : core.length, 0, ['freshness', freshness]);
  }
  // Retain every material current-state unit, including competing evidence; no sentence budget.
  const sentences = core.map(([, sentence]) => asSentence(inlineClause(sentence)));
  const history = [
    packet.delayHistory ? null : resolvedProgressSentence(packet),
    futureCycleContextSentence(packet),
  ].filter(Boolean);
  return [sentences[0], ...history, ...sentences.slice(1)].join(' ');
}
