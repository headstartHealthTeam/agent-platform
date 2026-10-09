import { z } from 'zod';

import { TRANSCRIPT_INTERPRETATION_SCHEMA } from './interpretation-contract.js';

const requiredFields = [
  ...TRANSCRIPT_INTERPRETATION_SCHEMA.properties.findings.items.required,
].sort();
const relationships = new Set(['Supports', 'Conflicts', 'Neutral']);
const actionTypes = new Set([
  'Provider Outreach',
  'Family Outreach',
  'Insurance Follow-Up',
  'RBT Follow-Up',
  'Salesforce Update',
  'Monitor',
  'Close / Discharge',
  'No Action',
]);
const semantic = z
  .string()
  .refine((value) => value.trim().length > 0)
  .nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const findingTypes = z
  .object({
    matchedOpportunityId: z.unknown(),
    synthesizedFact: z.string(),
    gateImpact: z.string(),
    substantive: z.boolean(),
    supportSpan: z.string(),
    actionOwner: z.string(),
    recommendedAction: z.string(),
    relationship: z.string().refine((value) => relationships.has(value)),
    actionType: z.string().refine((value) => actionTypes.has(value)),
    milestoneKind: z.enum(['planned', 'observed']).nullable(),
    category: semantic,
    issueKey: semantic,
    factType: semantic,
    milestoneDate: date,
    followUpDate: date,
  })
  .refine(
    (value) =>
      [0, 3].includes([value.category, value.issueKey, value.factType].filter(Boolean).length) &&
      (value.milestoneKind === null || value.milestoneDate !== null)
  );
export type PrecomputedFinding = z.infer<typeof findingTypes> & {
  matchedOpportunityId: string | null;
};
export interface PrecomputedCandidate {
  readonly findings: readonly PrecomputedFinding[];
}
export interface CandidateTarget {
  readonly sourceRecordId: string;
  readonly opportunityId: string;
}
export function assertInterpretationCandidate(
  interpretation: unknown,
  envelope: CandidateTarget
): asserts interpretation is PrecomputedCandidate {
  const parsed = z.object({ findings: z.array(z.unknown()) }).safeParse(interpretation);
  if (!parsed.success)
    throw new Error(`Current-run precomputed findings are missing for ${envelope.sourceRecordId}`);
  if (parsed.data.findings.length > 6)
    throw new Error(
      `Current-run precomputed finding count is invalid for ${envelope.sourceRecordId}`
    );
  for (const finding of parsed.data.findings) {
    const record = z.record(z.string(), z.unknown()).safeParse(finding);
    const keys = record.success ? Object.keys(record.data).sort() : [];
    if (
      keys.length !== requiredFields.length ||
      keys.some((key, index) => key !== requiredFields.at(index))
    )
      throw new Error(
        `Current-run precomputed finding schema is invalid for ${envelope.sourceRecordId}`
      );
    const typed = findingTypes.safeParse(finding);
    if (!typed.success)
      throw new Error(
        `Current-run precomputed finding types are invalid for ${envelope.sourceRecordId}`
      );
    if (
      typed.data.matchedOpportunityId !== null &&
      typed.data.matchedOpportunityId !== envelope.opportunityId
    )
      throw new Error(
        `Current-run precomputed finding targets another Opportunity for ${envelope.sourceRecordId}`
      );
  }
}
