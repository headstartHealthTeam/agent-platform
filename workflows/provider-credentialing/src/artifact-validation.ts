import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  credentialingArtifactInputSchema,
  credentialingArtifactOutputSchema,
  type ArtifactInput,
  type ArtifactOutput,
} from './preparation-contracts.js';
import { reviewFingerprint, validateProposal } from './review.js';

const requestSchema = z.object({ inputJson: z.string(), proposalJson: z.string() }).strict();
export const artifactByteLimit = 1_048_576;

export interface ReviewArtifactValidation {
  protocol: 'credentialing-validation/v1';
  dataMode: ArtifactInput['dataMode'];
  workId: string;
  work: Omit<ArtifactInput['work'], 'id'>;
  caseRevision: string;
  workflowRevision: string;
  routeRevision: string;
  inputSchemaVersion: ArtifactInput['schemaVersion'];
  proposalSchemaVersion: ArtifactOutput['schemaVersion'];
  inputFingerprint: string;
  proposalFingerprint: string;
  reviewFingerprint: string;
  readiness: ArtifactOutput['status'];
}

export type ArtifactValidationReply =
  | { ok: true; value: ReviewArtifactValidation }
  | { ok: false; code: 'invalid-artifacts'; issues: string[] };

class ArtifactValidationError extends Error {
  constructor(readonly issues: string[]) {
    super('Artifact validation failed');
  }
}

/** Canonical validation on trusted application compute, not a model-issued attestation. */
export const validateReviewArtifacts = (request: unknown): ReviewArtifactValidation => {
  const { inputJson, proposalJson } = requestSchema.parse(request);
  if ([inputJson, proposalJson].some((value) => Buffer.byteLength(value) > artifactByteLimit)) {
    throw new ArtifactValidationError(['Each serialized artifact must be at most 1 MiB.']);
  }
  const input = credentialingArtifactInputSchema.parse(JSON.parse(inputJson));
  const proposal = credentialingArtifactOutputSchema.parse(JSON.parse(proposalJson));
  const issues = validateProposal(input, proposal);
  if (issues.length) throw new ArtifactValidationError(issues);
  const fingerprint = reviewFingerprint(input, proposal);
  const { id: workId, ...work } = input.work;
  return {
    protocol: 'credentialing-validation/v1' as const,
    dataMode: input.dataMode,
    workId,
    work,
    caseRevision: input.caseRevision,
    workflowRevision: input.workflowRevision,
    routeRevision: input.routeRevision,
    inputSchemaVersion: input.schemaVersion,
    proposalSchemaVersion: proposal.schemaVersion,
    inputFingerprint: `sha256:${createHash('sha256').update(inputJson).digest('hex')}`,
    proposalFingerprint: `sha256:${createHash('sha256').update(proposalJson).digest('hex')}`,
    reviewFingerprint: `sha256:${fingerprint}`,
    readiness: proposal.status,
  };
};

/** Actionable validation feedback goes to the authorized agent, not the public activity/log feed. */
export const artifactValidationReply = (request: unknown): ArtifactValidationReply => {
  try {
    return { ok: true as const, value: validateReviewArtifacts(request) };
  } catch (error) {
    const issues =
      error instanceof ArtifactValidationError
        ? error.issues
        : error instanceof z.ZodError
          ? error.issues.map(
              (issue) => `${issue.path.map(String).join('.') || 'root'}: ${issue.code}`
            )
          : ['Artifacts must be valid JSON matching the published input and proposal schemas.'];
    return { ok: false as const, code: 'invalid-artifacts' as const, issues };
  }
};
