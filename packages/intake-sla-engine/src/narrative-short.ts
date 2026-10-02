import { shortConflictSummary } from './narrative-conflict.js';
import { denialReasonContext } from './narrative-denial.js';
import { latestUpdateSentence } from './narrative-latest.js';
import type { NarrativePacket } from './narrative-types.js';
import { shortenSentence } from './recommendation-text.js';
import { denialShortSummary } from './short-denial.js';
import {
  carriedRequirementShortSummary,
  diagnosticShortSummary,
  missingAuthorizationShortSummary,
  requiredDocumentShortSummary,
} from './short-documents.js';
import { clearedAuthorizationShortSummary, familyShortSummary } from './short-family.js';
import { assessmentPlanShortSummary, remainingMilestoneShortSummary } from './short-milestones.js';
import { portalRevisionShortSummary, specialShortSummary } from './short-special.js';
import { pausedStaffingShortSummary, staffingShortSummary } from './short-staffing.js';

export function shortHumanSummary(packet: NarrativePacket): string {
  const special = specialShortSummary(packet);
  if (special) return special;
  const conflict = shortConflictSummary(packet);
  if (
    conflict &&
    ['initial-authorization', 'treatment-authorization'].includes(
      packet.story?.currentGateIssueKey ?? ''
    )
  )
    return conflict;
  const portal = portalRevisionShortSummary(packet);
  if (portal) return portal;
  const denial = denialReasonContext(packet);
  if (denial) return denialShortSummary(packet, denial);
  // Preserve source rule order; a later rule must not run after a summary has been selected.
  const rules = [
    carriedRequirementShortSummary,
    missingAuthorizationShortSummary,
    diagnosticShortSummary,
    requiredDocumentShortSummary,
    familyShortSummary,
    clearedAuthorizationShortSummary,
    pausedStaffingShortSummary,
    staffingShortSummary,
    assessmentPlanShortSummary,
    remainingMilestoneShortSummary,
  ];
  for (const rule of rules) {
    const summary = rule(packet);
    if (summary) return summary;
  }
  const update = latestUpdateSentence(packet);
  return update.length <= 254 ? update : shortenSentence(update, 254);
}
