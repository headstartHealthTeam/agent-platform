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

function schemaIssueDetail(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `; expected ${issue.expected}`;
    case 'too_small':
      return `; minimum ${String(issue.minimum)}`;
    case 'too_big':
      return `; maximum ${String(issue.maximum)}`;
    case 'invalid_value':
      return '; use an allowed value from the published schema';
    case 'unrecognized_keys':
      return '; remove fields not declared in the published schema';
    case 'custom':
    case 'invalid_format':
    case 'not_multiple_of':
    case 'invalid_union':
    case 'invalid_key':
    case 'invalid_element':
      return '';
  }
}

/** Explain constraints, never echo supplied values, arbitrary keys or raw Zod messages. */
function schemaIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue): string[] => {
    if (issue.code === 'invalid_union') {
      // Prefer a version-matching branch; legacy alternatives must not obscure the real defect.
      const candidates = issue.errors.filter(
        (branch) =>
          !branch.some(
            (entry) => entry.code === 'invalid_value' && entry.path.at(-1) === 'schemaVersion'
          )
      );
      const closest = candidates.sort((a, b) => a.length - b.length)[0];
      return closest
        ? schemaIssues(closest)
        : ['schemaVersion: unsupported schema version; read the published input/proposal schemas'];
    }
    const path =
      issue.path
        .map((part) =>
          typeof part === 'number'
            ? String(part)
            : /^[A-Za-z][A-Za-z0-9_]{0,80}$/u.test(String(part))
              ? String(part)
              : '[field]'
        )
        .join('.') || 'root';
    return [`${path}: ${issue.code}${schemaIssueDetail(issue)}`];
  });
}

function parseArtifact<T>(schema: z.ZodType<T>, json: string, name: string): T {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ArtifactValidationError([
      `${name}: invalid JSON; provide the complete serialized artifact`,
    ]);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = schemaIssues(parsed.error.issues);
    const selected = issues.slice(0, 50).map((issue) => `${name}.${issue}`);
    if (issues.length > 50)
      selected.push(`${name}: additional schema issues omitted; correct these and validate again`);
    throw new ArtifactValidationError(selected);
  }
  return parsed.data;
}

/** Canonical validation on trusted application compute, not a model-issued attestation. */
export const validateReviewArtifacts = (request: unknown): ReviewArtifactValidation => {
  const { inputJson, proposalJson } = requestSchema.parse(request);
  if ([inputJson, proposalJson].some((value) => Buffer.byteLength(value) > artifactByteLimit)) {
    throw new ArtifactValidationError(['Each serialized artifact must be at most 1 MiB.']);
  }
  const input = parseArtifact(credentialingArtifactInputSchema, inputJson, 'input');
  const proposal = parseArtifact(credentialingArtifactOutputSchema, proposalJson, 'proposal');
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
