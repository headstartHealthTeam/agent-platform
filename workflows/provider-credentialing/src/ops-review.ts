import type { PreparationOutput, PreparationSnapshot } from './preparation-contracts.js';

interface EvidenceReference {
  id: string;
  revision: string;
}
type Investigation = NonNullable<PreparationOutput['opsReview']>['investigation'];
type Question = PreparationOutput['questions'][number];

function evidenceIssues(input: PreparationSnapshot, references: EvidenceReference[]): string[] {
  return references
    .filter(
      (ref) =>
        !input.evidence.some((source) => source.id === ref.id && source.revision === ref.revision)
    )
    .map((ref) => `Ops handoff references missing or stale evidence: ${ref.id}`);
}

function investigationIssues(input: PreparationSnapshot, investigation: Investigation): string[] {
  const issues: string[] = [];
  const investigated = new Set<string>();
  for (const item of investigation) {
    issues.push(
      ...evidenceIssues(input, [item.source, ...(item.discoveredFrom ? [item.discoveredFrom] : [])])
    );
    if (investigated.has(item.source.id))
      issues.push(`Duplicate investigation source: ${item.source.id}`);
    investigated.add(item.source.id);
    if (item.discoveredFrom?.id === item.source.id)
      issues.push(`Investigation source cannot discover itself: ${item.source.id}`);
    const evidence = input.evidence.find(
      (source) => source.id === item.source.id && source.revision === item.source.revision
    );
    if (item.outcome === 'inspected' && evidence?.retrieval !== 'available')
      issues.push(`Unavailable evidence cannot be marked inspected: ${item.source.id}`);
  }
  return issues;
}

function requirementIssues(output: PreparationOutput, question: Question): string[] {
  const issues: string[] = [];
  const linked = new Set<string>();
  for (const ref of question.review?.requirements ?? []) {
    const key = `${ref.kind}:${ref.id}`;
    const dispositions =
      ref.kind === 'answer'
        ? output.answers
        : ref.kind === 'attachment'
          ? output.attachments
          : output.protectedActions;
    const requirement = dispositions.find((item) => item.requirementId === ref.id);
    if (requirement?.disposition !== 'unresolved')
      issues.push(`Question must link an unresolved requirement: ${question.id}/${key}`);
    if (linked.has(key)) issues.push(`Duplicate question requirement: ${question.id}/${key}`);
    linked.add(key);
  }
  return issues;
}

function questionIssues(
  input: PreparationSnapshot,
  output: PreparationOutput,
  question: Question
): string[] {
  if (!question.review)
    return output.opsReview ? [`Ops handoff requires an actionable question: ${question.id}`] : [];
  const issues = requirementIssues(output, question);
  if (question.kind === 'evidence' && question.review.requirements.length === 0)
    issues.push(`Evidence question requires an unresolved requirement: ${question.id}`);
  for (const context of question.review.knownContext)
    issues.push(...evidenceIssues(input, context.evidence));
  return issues;
}

/** Check handoff references, not whether a source was actually read or a finding is true. */
export function validateOpsReview(input: PreparationSnapshot, output: PreparationOutput): string[] {
  const covered = new Set(
    output.questions.flatMap((question) =>
      (question.review?.requirements ?? []).map((ref) => `${ref.kind}:${ref.id}`)
    )
  );
  const required = [
    ...input.requirements
      .filter((item) => item.required)
      .map((item) => ({ kind: 'answer', id: item.id })),
    ...input.attachmentRequirements
      .filter((item) => item.required)
      .map((item) => ({ kind: 'attachment', id: item.id })),
    ...input.protectedActionRequirements.map((item) => ({ kind: 'protected-action', id: item.id })),
  ];
  const coverageIssues = output.opsReview
    ? required
        .filter((ref) => {
          const dispositions =
            ref.kind === 'answer'
              ? output.answers
              : ref.kind === 'attachment'
                ? output.attachments
                : output.protectedActions;
          return (
            dispositions.some(
              (item) => item.requirementId === ref.id && item.disposition === 'unresolved'
            ) && !covered.has(`${ref.kind}:${ref.id}`)
          );
        })
        .map((ref) => `Ops handoff requires a residual request: ${ref.kind}:${ref.id}`)
    : [];
  return [
    ...coverageIssues,
    ...(output.opsReview?.findings ?? []).flatMap((finding) =>
      evidenceIssues(input, finding.evidence)
    ),
    ...investigationIssues(input, output.opsReview?.investigation ?? []),
    ...output.questions.flatMap((question) => questionIssues(input, output, question)),
  ];
}
