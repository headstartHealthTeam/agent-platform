import { z } from 'zod';

import { credentialingInputSchema, credentialingOutputSchema } from './contracts.js';

const reference = z.string().min(1).max(200);
const narrative = z.string().min(1).max(8000);
const revision = z.object({ id: reference, revision: reference }).strict();
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const artifactReference = revision.extend({ digest });
// Use Zod's calendar-aware patterns in both consumers; the shared JSON Schema loader has no format plugin.
const date = z.string().regex(z.regexes.date);
const period = z.object({ start: date.nullable(), end: date.nullable() }).strict();
const scope = z
  .object({
    subjectId: reference,
    locationIds: z.array(reference),
    recordId: reference.nullable(),
  })
  .strict();
const destination = z.object({ system: reference, section: reference, field: reference }).strict();
const disposition = z.enum([
  'documented',
  'declared',
  'verified',
  'operator-selected',
  'proxy',
  'unknown',
  'conflicting',
  'not-applicable',
]);

/** Rich preparation contracts. Legacy schemas remain unchanged for historical artifacts. */
export const preparationInputSchema = credentialingInputSchema.extend({
  schemaVersion: z.literal('0.2.0'),
  relatedParties: z.array(
    z
      .object({
        id: reference,
        kind: z.enum(['person', 'organization']),
        roles: z
          .array(
            z.enum([
              'owner',
              'managing-employee',
              'employer',
              'institution',
              'authorized-representative',
            ])
          )
          .min(1),
        evidence: z.array(revision).min(1),
      })
      .strict()
  ),
  records: z.array(
    z
      .object({
        id: reference,
        kind: z.enum([
          'address',
          'education',
          'employment',
          'ownership',
          'management',
          'license',
          'coverage',
        ]),
        subjectId: reference,
        relatedPartyId: reference.nullable(),
        locationIds: z.array(reference),
        period: period.nullable(),
        addressRole: z.enum(['service', 'pay-to', 'mail-to']).nullable(),
      })
      .strict()
  ),
  facts: z.array(
    credentialingInputSchema.shape.facts.element.extend({
      recordId: reference.nullable(),
      disposition,
      qualification: narrative.nullable(),
    })
  ),
  evidence: z.array(
    credentialingInputSchema.shape.evidence.element.extend({
      locationIds: z.array(reference),
      recordId: reference.nullable(),
      observedAt: z.string().regex(z.regexes.datetime({})),
      source: z.object({ system: reference, recordId: reference, version: reference }).strict(),
    })
  ),
  requirements: z
    .array(
      credentialingInputSchema.shape.requirements.element.extend({
        scope,
        destination,
      })
    )
    .min(1),
  artifacts: z.array(
    z
      .object({
        id: reference,
        revision: reference,
        digest,
        mediaType: reference,
        scope,
        evidence: z.array(revision).min(1),
        lineage: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('source') }).strict(),
          z
            .object({
              kind: z.literal('converted'),
              sources: z.array(artifactReference).min(1),
              transformation: revision,
            })
            .strict(),
        ]),
      })
      .strict()
  ),
  attachmentRequirements: z.array(
    z
      .object({
        id: reference,
        question: narrative,
        required: z.boolean(),
        scope,
        destination,
        acceptedMediaTypes: z.array(reference).min(1),
      })
      .strict()
  ),
  protectedActionRequirements: z.array(
    z
      .object({
        id: reference,
        action: z.enum(['signature', 'attestation', 'declaration', 'submission']),
        actorSubjectId: reference,
        actorRole: reference,
        destination,
        attachmentRequirementIds: z.array(reference),
        blocksRequirementIds: z.array(reference),
      })
      .strict()
  ),
});

export const preparationOutputSchema = credentialingOutputSchema.extend({
  schemaVersion: z.literal('0.3.0'),
  answers: z.array(
    credentialingOutputSchema.shape.answers.element.extend({
      basis: z
        .enum(['documented', 'declared', 'verified', 'operator-selected', 'proxy', 'inferred'])
        .nullable(),
    })
  ),
  attachments: z.array(
    z
      .object({
        requirementId: reference,
        disposition: z.enum(['proposed', 'unresolved', 'not-applicable']),
        artifact: artifactReference.nullable(),
        explanation: narrative,
      })
      .strict()
  ),
  protectedActions: z.array(
    z
      .object({
        requirementId: reference,
        disposition: z.enum(['human-required', 'unresolved']),
        explanation: narrative,
      })
      .strict()
  ),
});

export const credentialingArtifactInputSchema = z.union([
  credentialingInputSchema,
  preparationInputSchema,
]);
export const credentialingArtifactOutputSchema = z.union([
  credentialingOutputSchema,
  preparationOutputSchema,
]);
export type PreparationInput = z.infer<typeof preparationInputSchema>;
export type PreparationOutput = z.infer<typeof preparationOutputSchema>;
export type ArtifactInput = z.infer<typeof credentialingArtifactInputSchema>;
export type ArtifactOutput = z.infer<typeof credentialingArtifactOutputSchema>;
