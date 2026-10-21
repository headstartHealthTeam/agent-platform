import { z } from 'zod';

const reference = z.string().min(1).max(200);
const evidenceReference = z.object({ id: reference, revision: reference }).strict();
const shortText = z.string().trim().min(1).max(300);

/** Optional on historical packages; canonical instructions require it for new Ops handoffs. */
export const opsQuestionSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    knownContext: z.array(
      z.object({ text: shortText, evidence: z.array(evidenceReference).min(1) }).strict()
    ),
    requestedItems: z.array(shortText).min(1).max(12),
    requirements: z.array(
      z
        .object({
          kind: z.enum(['answer', 'attachment', 'protected-action']),
          id: reference,
        })
        .strict()
    ),
  })
  .strict();

export const opsReviewSchema = z
  .object({
    summary: shortText,
    findings: z
      .array(z.object({ text: shortText, evidence: z.array(evidenceReference).min(1) }).strict())
      .max(8),
    nextStep: shortText,
    investigation: z.array(
      z
        .object({
          source: evidenceReference,
          discoveredFrom: evidenceReference.nullable(),
          outcome: z.enum(['inspected', 'unavailable', 'not-relevant']),
          detail: shortText,
        })
        .strict()
    ),
  })
  .strict();
