import type { PreparationInput } from './preparation-contracts.js';

type Scope = PreparationInput['requirements'][number]['scope'];
interface EvidenceRef {
  id: string;
  revision: string;
}

export const preparationSubjects = (input: PreparationInput): string[] => [
  input.work.providerId,
  input.work.practiceId,
  ...input.relatedParties.map((party) => party.id),
];

/** Empty locations means case-wide, never permission to discover other work. */
export const coversScope = (source: Scope, target: Scope): boolean =>
  source.subjectId === target.subjectId &&
  (source.recordId === null || source.recordId === target.recordId) &&
  (source.locationIds.length === 0 ||
    (target.locationIds.length > 0 &&
      target.locationIds.every((id) => source.locationIds.includes(id))));

export const currentEvidence = (
  input: PreparationInput,
  references: EvidenceRef[],
  scope: Scope
): boolean =>
  references.length > 0 &&
  references.every((ref) =>
    input.evidence.some(
      (item) =>
        item.id === ref.id &&
        item.revision === ref.revision &&
        item.retrieval === 'available' &&
        item.validity === 'current' &&
        coversScope(item, scope)
    )
  );

const validScope = (input: PreparationInput, scope: Scope): boolean => {
  if (
    !preparationSubjects(input).includes(scope.subjectId) ||
    scope.locationIds.some((id) => !input.work.locationIds.includes(id))
  )
    return false;
  if (scope.recordId === null) return true;
  const record = input.records.find((item) => item.id === scope.recordId);
  return Boolean(record && coversScope({ ...record, recordId: record.id }, scope));
};

const knownEvidence = (input: PreparationInput, references: EvidenceRef[]): boolean =>
  references.every((ref) =>
    input.evidence.some((item) => item.id === ref.id && item.revision === ref.revision)
  );

export const validatePreparationSnapshot = (input: PreparationInput): string[] => {
  const issues: string[] = [];
  const collections = [
    preparationSubjects(input),
    input.records.map((item) => item.id),
    input.artifacts.map((item) => item.id),
    [
      ...input.requirements,
      ...input.attachmentRequirements,
      ...input.protectedActionRequirements,
    ].map((item) => item.id),
  ];
  if (collections.some((ids) => new Set(ids).size !== ids.length))
    issues.push('Ambiguous preparation identifiers.');
  for (const party of input.relatedParties) {
    if (!knownEvidence(input, party.evidence)) issues.push(`Unknown party evidence: ${party.id}`);
  }
  for (const record of input.records) issues.push(...validateRecord(input, record));
  const scoped = [
    ...input.facts,
    ...input.evidence,
    ...[...input.requirements, ...input.attachmentRequirements, ...input.artifacts].map((item) => ({
      id: item.id,
      ...item.scope,
    })),
  ];
  for (const item of scoped) {
    if (!validScope(input, item)) issues.push(`Invalid preparation scope: ${item.id}`);
  }
  for (const fact of input.facts) {
    if (['operator-selected', 'proxy'].includes(fact.disposition) && !fact.qualification) {
      issues.push(`Qualified fact needs its rationale: ${fact.id}`);
    }
  }
  for (const artifact of input.artifacts) issues.push(...validateArtifact(input, artifact));
  issues.push(...validateProtectedActions(input));
  return issues;
};

const validateProtectedActions = (input: PreparationInput): string[] => {
  const issues: string[] = [];
  for (const action of input.protectedActionRequirements) {
    if (
      !preparationSubjects(input).includes(action.actorSubjectId) ||
      action.attachmentRequirementIds.some(
        (id) => !input.attachmentRequirements.some((item) => item.id === id)
      ) ||
      action.blocksRequirementIds.some(
        (id) =>
          ![...input.requirements, ...input.attachmentRequirements].some((item) => item.id === id)
      )
    ) {
      issues.push(`Invalid protected-action handoff: ${action.id}`);
    }
  }
  return issues;
};

const validateRecord = (
  input: PreparationInput,
  record: PreparationInput['records'][number]
): string[] => {
  const issues: string[] = [];
  if (
    !validScope(input, { ...record, recordId: null }) ||
    (record.relatedPartyId !== null &&
      !input.relatedParties.some((party) => party.id === record.relatedPartyId))
  ) {
    issues.push(`Invalid repeating record scope: ${record.id}`);
  }
  if ((record.kind === 'address') !== (record.addressRole !== null))
    issues.push(`Invalid address role: ${record.id}`);
  if (record.period?.start && record.period.end && record.period.start > record.period.end) {
    issues.push(`Reversed record period: ${record.id}`);
  }
  return issues;
};

const validateArtifact = (
  input: PreparationInput,
  artifact: PreparationInput['artifacts'][number]
): string[] => {
  const issues: string[] = [];
  if (!knownEvidence(input, artifact.evidence))
    issues.push(`Unknown artifact evidence: ${artifact.id}`);
  if (artifact.lineage.kind === 'source') return issues;
  for (const ref of artifact.lineage.sources) {
    const source = input.artifacts.find(
      (item) => item.id === ref.id && item.revision === ref.revision && item.digest === ref.digest
    );
    if (
      !source ||
      !coversScope(source.scope, artifact.scope) ||
      !coversScope(artifact.scope, source.scope)
    ) {
      issues.push(`Invalid conversion source: ${artifact.id}`);
    }
  }
  if (hasLineageCycle(input, artifact.id)) issues.push(`Cyclic artifact lineage: ${artifact.id}`);
  return issues;
};

const hasLineageCycle = (input: PreparationInput, origin: string): boolean => {
  const pending = [origin];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    const artifact = input.artifacts.find((item) => item.id === id);
    if (!artifact || visited.has(artifact.id)) continue;
    visited.add(artifact.id);
    if (artifact.lineage.kind !== 'converted') continue;
    for (const ref of artifact.lineage.sources) {
      if (ref.id === origin) return true;
      pending.push(ref.id);
    }
  }
  return false;
};
