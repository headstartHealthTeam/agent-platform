import type { PreparationInput, PreparationOutput } from './preparation-contracts.js';
import { coversScope, currentEvidence } from './preparation-snapshot.js';

export const validatePreparationProposal = (
  input: PreparationInput,
  output: PreparationOutput
): string[] => {
  const issues = [
    ...validateCoverage(input.attachmentRequirements, output.attachments),
    ...validateCoverage(input.protectedActionRequirements, output.protectedActions),
  ];
  for (const answer of output.answers) issues.push(...validateAnswerScope(input, answer));
  for (const attachment of output.attachments)
    issues.push(...validateAttachment(input, attachment));
  const unresolved = [...output.attachments, ...output.protectedActions].some(
    (item) => item.disposition === 'unresolved'
  );
  if (
    unresolved &&
    (!output.humanStops.includes('H-02') || output.status === 'prepared-for-review')
  ) {
    issues.push(
      'Unresolved attachments or protected-action routing require an H-02 handoff, not readiness.'
    );
  }
  return issues;
};

const validateCoverage = (
  requirements: { id: string }[],
  proposals: { requirementId: string }[]
): string[] => {
  const ids = proposals.map((item) => item.requirementId);
  if (
    new Set(ids).size !== ids.length ||
    ids.length !== requirements.length ||
    requirements.some((item) => !ids.includes(item.id))
  )
    return ['Missing, unknown or duplicate preparation disposition.'];
  return [];
};

const validateAnswerScope = (
  input: PreparationInput,
  answer: PreparationOutput['answers'][number]
): string[] => {
  const requirement = input.requirements.find((item) => item.id === answer.requirementId);
  if (!requirement) return []; // The shared validator reports unknown requirements.
  const facts = input.facts.filter((item) => answer.factIds.includes(item.id));
  const issues: string[] = [];
  if (facts.some((item) => !coversScope(item, requirement.scope)))
    issues.push(`Answer uses another record or subject: ${requirement.id}`);
  if (answer.disposition !== 'supported') {
    if (answer.basis !== null) issues.push(`Unresolved answer carries a basis: ${requirement.id}`);
    return issues;
  }
  if (answer.basis === null || !currentEvidence(input, answer.evidence, requirement.scope)) {
    issues.push(`Answer lacks scoped current evidence or basis: ${requirement.id}`);
  }
  if (
    facts.some((item) => ['unknown', 'conflicting', 'not-applicable'].includes(item.disposition))
  ) {
    issues.push(`Unresolved fact promoted to an answer: ${requirement.id}`);
  }
  const qualified = facts.some((item) => item.disposition === 'proxy')
    ? 'proxy'
    : facts.some((item) => item.disposition === 'operator-selected')
      ? 'operator-selected'
      : null;
  if (qualified !== null && answer.basis !== qualified)
    issues.push(`Qualified fact promoted to certainty: ${requirement.id}`);
  if (
    answer.basis === 'verified' &&
    (facts.length === 0 || facts.some((item) => item.disposition !== 'verified'))
  ) {
    issues.push(`Answer cannot claim verification: ${requirement.id}`);
  }
  return issues;
};

const validateAttachment = (
  input: PreparationInput,
  attachment: PreparationOutput['attachments'][number]
): string[] => {
  const requirement = input.attachmentRequirements.find(
    (item) => item.id === attachment.requirementId
  );
  if (!requirement) return [];
  if (attachment.disposition !== 'proposed') {
    return attachment.artifact === null
      ? []
      : [`Unresolved attachment selects a file: ${requirement.id}`];
  }
  const ref = attachment.artifact;
  const artifact = input.artifacts.find(
    (item) => item.id === ref?.id && item.revision === ref.revision && item.digest === ref.digest
  );
  if (
    !artifact ||
    !coversScope(artifact.scope, requirement.scope) ||
    !requirement.acceptedMediaTypes.includes(artifact.mediaType) ||
    !artifactChainIsCurrent(input, artifact.id)
  )
    return [`Unavailable, stale or mis-scoped attachment: ${requirement.id}`];
  return [];
};

const artifactChainIsCurrent = (input: PreparationInput, origin: string): boolean => {
  const pending = [origin];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    const artifact = input.artifacts.find((item) => item.id === id);
    if (!artifact) return false;
    if (visited.has(artifact.id)) continue;
    visited.add(artifact.id);
    if (!currentEvidence(input, artifact.evidence, artifact.scope)) return false;
    if (artifact.lineage.kind === 'converted')
      pending.push(...artifact.lineage.sources.map((item) => item.id));
  }
  return true;
};
