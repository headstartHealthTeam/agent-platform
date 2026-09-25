import { z } from 'zod';

const reference = z.string().min(1).max(200);
const narrative = z.string().min(1).max(8000);
const scalar = z.union([z.string().max(8000), z.number(), z.boolean()]);
const evidenceReference = z.object({ id: reference, revision: reference }).strict();

export const credentialingInputSchema = z
  .object({
    schemaVersion: z.literal('0.1.0'),
    dataMode: z.literal('synthetic'),
    caseRevision: reference,
    workflowRevision: reference,
    routeRevision: reference,
    work: z
      .object({
        id: reference,
        providerId: reference,
        practiceId: reference,
        payer: reference,
        product: reference,
        jurisdiction: reference,
        requestType: z.enum(['initial-enrollment', 'group-add', 'renewal', 'maintenance']),
        locationIds: z.array(reference).min(1),
        period: reference,
        existingAffiliationIds: z.array(reference),
      })
      .strict(),
    facts: z.array(
      z
        .object({
          id: reference,
          key: reference,
          subjectId: reference,
          locationIds: z.array(reference),
          value: scalar.nullable(),
          disposition: z.enum([
            'documented',
            'declared',
            'verified',
            'unknown',
            'conflicting',
            'not-applicable',
          ]),
          evidence: z.array(evidenceReference),
        })
        .strict()
    ),
    evidence: z.array(
      z
        .object({
          id: reference,
          revision: reference,
          subjectId: reference,
          title: reference,
          retrieval: z.enum(['available', 'awaiting-file', 'missing', 'error']),
          validity: z.enum(['current', 'expired', 'unknown']),
          content: narrative.nullable(),
        })
        .strict()
    ),
    requirements: z
      .array(z.object({ id: reference, question: narrative, required: z.boolean() }).strict())
      .min(1),
    recordedMilestones: z.array(
      z.enum(['prepared', 'populated', 'submitted', 'approved', 'active', 'billing-verified'])
    ),
    execution: z
      .object({
        priorOutcome: z.enum(['none', 'confirmed', 'unknown']),
        stopRequested: z.boolean(),
        permittedActions: z.array(z.enum(['inspect', 'prepare'])),
      })
      .strict(),
  })
  .strict();

export const credentialingOutputSchema = z
  .object({
    schemaVersion: z.literal('0.2.0'),
    workId: reference,
    caseRevision: reference,
    workflowRevision: reference,
    routeRevision: reference,
    status: z.enum(['prepared-for-review', 'needs-information', 'blocked']),
    answers: z.array(
      z
        .object({
          requirementId: reference,
          value: scalar.nullable(),
          disposition: z.enum(['supported', 'unresolved', 'not-applicable']),
          factIds: z.array(reference),
          evidence: z.array(evidenceReference),
          explanation: narrative,
        })
        .strict()
    ),
    questions: z.array(
      z
        .object({
          id: reference,
          kind: z
            .enum(['evidence', 'access', 'reconciliation'])
            .describe(
              'evidence: unresolved evidence, mapping or readback discrepancy requiring H-02; access or reconciliation: authorized access recovery or uncertain-effect reconciliation requiring blocked status and H-03. Include both stops when both conditions exist.'
            ),
          question: narrative,
          evidenceIds: z.array(reference),
          nextActor: z.enum(['ops', 'provider', 'engineering']),
        })
        .strict()
    ),
    humanStops: z.array(z.enum(['H-01', 'H-02', 'H-03', 'H-04', 'H-05'])),
    handoff: narrative,
  })
  .strict();

export type CredentialingInput = z.infer<typeof credentialingInputSchema>;
export type CredentialingOutput = z.infer<typeof credentialingOutputSchema>;
