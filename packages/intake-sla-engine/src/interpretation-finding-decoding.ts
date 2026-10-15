import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import type { TranscriptFindingInput } from './interpretation-findings.js';

const text = z.string().nullish();
const finding = z.looseObject({
  matchedOpportunityId: text,
  synthesizedFact: text,
  gateImpact: text,
  substantive: z.boolean().nullish(),
  relationship: text,
  supportSpan: text,
  actionOwner: text,
  actionType: text,
  recommendedAction: text,
  milestoneDate: text,
  followUpDate: text,
  category: text,
  issueKey: text,
  factType: text,
  milestoneKind: text,
  semanticsSupplied: z.boolean().nullish(),
});
/** Only called for an admitted, exactly bound saved record; unused findings remain raw. */
export function decodeSuppliedTranscriptFindings(
  value: unknown
): readonly TranscriptFindingInput[] {
  const parsed = z
    .array(preserveCollectionRecord(finding))
    .safeParse(value === undefined ? [] : value);
  if (!parsed.success) throw new Error('Invalid consumed transcript findings');
  return parsed.data;
}
