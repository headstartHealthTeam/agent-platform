import type { ArtifactInput } from './preparation-contracts.js';
import { preparationSubjects, validatePreparationSnapshot } from './preparation-snapshot.js';

export const unique = (values: string[]): boolean => new Set(values).size === values.length;

export const validateSnapshot = (input: ArtifactInput): string[] => {
  const issues: string[] =
    input.schemaVersion !== '0.1.0' ? validatePreparationSnapshot(input) : [];
  const collections = [
    input.facts.map((fact) => fact.id),
    input.evidence.map((item) => item.id),
    input.requirements.map((item) => item.id),
    input.work.locationIds,
    input.work.existingAffiliationIds,
  ];
  if (collections.some((ids) => !unique(ids))) {
    issues.push('Ambiguous duplicate identifiers.');
  }
  const subjects =
    input.schemaVersion !== '0.1.0'
      ? preparationSubjects(input)
      : [input.work.providerId, input.work.practiceId];
  for (const item of input.evidence) {
    if (!subjects.includes(item.subjectId)) {
      issues.push(`Evidence is outside the work subject scope: ${item.id}`);
    }
    if ((item.retrieval === 'available') !== (item.content !== null)) {
      issues.push(`Evidence retrieval and content disagree: ${item.id}`);
    }
  }
  for (const fact of input.facts) {
    issues.push(...validateFact(input, fact, subjects));
  }
  return issues;
};

const validateFact = (
  input: ArtifactInput,
  fact: ArtifactInput['facts'][number],
  subjects: string[]
): string[] => {
  const issues: string[] = [];
  if (
    !subjects.includes(fact.subjectId) ||
    fact.locationIds.some((id) => !input.work.locationIds.includes(id))
  ) {
    issues.push(`Fact is outside the work scope: ${fact.id}`);
  }
  for (const ref of fact.evidence) {
    if (!input.evidence.some((item) => item.id === ref.id && item.revision === ref.revision)) {
      issues.push(`Fact references unknown evidence: ${fact.id}`);
    }
  }
  if (
    ['unknown', 'conflicting', 'not-applicable'].includes(fact.disposition) &&
    fact.value !== null
  ) {
    issues.push(`Unresolved or inapplicable fact carries a value: ${fact.id}`);
  }
  return issues;
};
