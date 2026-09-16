import { createHash } from 'node:crypto';

import {
  credentialingArtifactInputSchema,
  credentialingArtifactOutputSchema,
  type ArtifactInput,
  type ArtifactOutput,
} from './preparation-contracts.js';
import { validatePreparationProposal } from './preparation-review.js';
import { unique, validateSnapshot } from './snapshot.js';

export const validateProposal = (input: ArtifactInput, output: ArtifactOutput): string[] => {
  const issues = validateSnapshot(input);
  if (input.schemaVersion === '0.2.0' && output.schemaVersion === '0.3.0') {
    issues.push(...validatePreparationProposal(input, output));
  } else if (input.schemaVersion !== '0.1.0' || output.schemaVersion !== '0.2.0') {
    issues.push('Unsupported input/proposal schema-version pair.');
  }
  if (
    output.workId !== input.work.id ||
    output.caseRevision !== input.caseRevision ||
    output.workflowRevision !== input.workflowRevision ||
    output.routeRevision !== input.routeRevision
  ) {
    issues.push('Proposal does not match the current work and revisions.');
  }
  if (
    !unique(output.answers.map((answer) => answer.requirementId)) ||
    !unique(output.questions.map((question) => question.id))
  ) {
    issues.push('Ambiguous duplicate identifiers.');
  }
  for (const requirement of input.requirements) {
    if (!output.answers.some((answer) => answer.requirementId === requirement.id)) {
      issues.push(`Missing disposition: ${requirement.id}`);
    }
  }
  for (const answer of output.answers) {
    issues.push(...validateAnswer(input, answer));
  }
  for (const question of output.questions) {
    if (question.evidenceIds.some((id) => !input.evidence.some((item) => item.id === id))) {
      issues.push(`Unknown question evidence: ${question.id}`);
    }
  }
  issues.push(...validateStops(input, output));
  return issues;
};

const validateStops = (input: ArtifactInput, output: ArtifactOutput): string[] => {
  const issues: string[] = [];
  const evidenceException =
    output.answers.some((answer) => answer.disposition === 'unresolved') ||
    output.questions.some((question) => question.kind === 'evidence');
  if (
    output.status === 'prepared-for-review' &&
    (evidenceException || output.questions.length > 0)
  ) {
    issues.push('Unresolved preparation cannot be presented as ready for review.');
  }
  if (!['H-01', 'H-04', 'H-05'].every((stop) => output.humanStops.some((item) => item === stop))) {
    issues.push('Pre-population, final readback and protected human actions remain required.');
  }
  if (evidenceException && !output.humanStops.includes('H-02')) {
    issues.push('Unresolved evidence requires an exception handoff.');
  }
  if (
    input.execution.priorOutcome === 'unknown' &&
    (!output.humanStops.includes('H-03') || output.status !== 'blocked')
  ) {
    issues.push('Unknown prior effect requires reconciliation.');
  }
  if (
    output.questions.some((question) => question.kind !== 'evidence') &&
    (!output.humanStops.includes('H-03') || output.status !== 'blocked')
  ) {
    issues.push('Access or reconciliation questions require a blocked H-03 handoff.');
  }
  if (input.execution.stopRequested && output.status !== 'blocked') {
    issues.push('Stop requested: no continued execution or readiness claim.');
  }
  if (!input.execution.permittedActions.includes('prepare') && output.status !== 'blocked') {
    issues.push('Preparation is not permitted by the supplied synthetic scope.');
  }
  return issues;
};

const validateAnswer = (
  input: ArtifactInput,
  answer: ArtifactOutput['answers'][number]
): string[] => {
  const issues: string[] = [];
  if (!input.requirements.some((item) => item.id === answer.requirementId)) {
    issues.push(`Unknown requirement: ${answer.requirementId}`);
  }
  if (answer.factIds.some((id) => !input.facts.some((fact) => fact.id === id))) {
    issues.push(`Unknown fact: ${answer.requirementId}`);
  }
  if (
    answer.disposition === 'supported' &&
    (answer.value === null || answer.evidence.length === 0)
  ) {
    issues.push(`Unsupported answer: ${answer.requirementId}`);
  }
  if (answer.disposition !== 'supported' && answer.value !== null) {
    issues.push(`Unresolved or inapplicable answer carries a value: ${answer.requirementId}`);
  }
  for (const ref of answer.evidence) {
    const item = input.evidence.find(
      (candidate) => candidate.id === ref.id && candidate.revision === ref.revision
    );
    if (
      !item ||
      (answer.disposition === 'supported' &&
        (item.retrieval !== 'available' || item.validity !== 'current'))
    ) {
      issues.push(`Unavailable, stale or unknown evidence: ${ref.id}`);
    }
  }
  return issues;
};

/** Content binding only: does not issue approval, enforce a lease or authorize an external action. */
export const reviewFingerprint = (inputValue: unknown, outputValue: unknown): string => {
  const input = credentialingArtifactInputSchema.parse(inputValue);
  const output = credentialingArtifactOutputSchema.parse(outputValue);
  const issues = validateProposal(input, output);
  if (issues.length > 0) {
    throw new Error(issues.join(' '));
  }
  return createHash('sha256').update(JSON.stringify({ input, output })).digest('hex');
};
