import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { artifactValidationReply } from './artifact-validation.js';
import { validateOpsReview } from './ops-review.js';
import {
  preparationInputSchema,
  preparationOutputSchema,
  type PreparationOutput,
  type PreparationSnapshot,
} from './preparation-contracts.js';

const fixture = (): { input: PreparationSnapshot; output: PreparationOutput } => {
  const read = (kind: string): unknown =>
    JSON.parse(
      readFileSync(
        new URL(`../fixtures/preparation/historical-preparation.${kind}.json`, import.meta.url),
        'utf8'
      )
    );
  const input = preparationInputSchema.parse(read('input'));
  const output = preparationOutputSchema.parse(read('output'));
  output.opsReview = {
    summary: 'Address roles and conflicting history still need evidence.',
    findings: [
      {
        text: 'The historical declaration is comparison evidence, not a current attestation.',
        evidence: [{ id: 'historical-application', revision: 'r1' }],
      },
    ],
    nextStep: 'Ops confirms payer address roles; the provider resolves conflicting history.',
    investigation: [
      {
        source: { id: 'historical-application', revision: 'r1' },
        discoveredFrom: null,
        outcome: 'inspected',
        detail: 'Read the full historical application; current declarations remain unverified.',
      },
    ],
  };
  const mappings: Record<string, string[]> = {
    'address-mapping': [
      'answer-service-a-street',
      'answer-service-a-city',
      'answer-service-a-postalCode',
      'answer-pay-to-street',
      'answer-pay-to-city',
    ],
    'conflicting-history': ['answer-degree-one-degree', 'answer-job-one-startDate'],
    'current-declaration': ['current-declaration'],
  };
  for (const question of output.questions) {
    question.review = {
      title:
        question.id === 'address-mapping' ? 'Confirm payer address roles' : 'Resolve evidence gap',
      knownContext: [],
      requestedItems: [question.question],
      requirements: (mappings[question.id] ?? []).map((id) => ({ kind: 'answer', id })),
    };
  }
  return { input, output };
};

describe('Ops handoff contract', () => {
  it('validates the complete artifact without promoting historical evidence or resolving gaps', () => {
    const { input, output } = fixture();
    expect(
      artifactValidationReply({
        inputJson: JSON.stringify(input),
        proposalJson: JSON.stringify(output),
      })
    ).toMatchObject({ ok: true, value: { readiness: 'needs-information' } });
    expect(output.answers.some((answer) => answer.disposition === 'unresolved')).toBe(true);
  });

  it('retains compatibility with historical packages without structured handoffs', () => {
    const { input, output } = fixture();
    delete output.opsReview;
    for (const question of output.questions) delete question.review;
    expect(validateOpsReview(input, output)).toEqual([]);
  });

  it('rejects stale findings, unavailable inspected sources and invented traversal parents', () => {
    const { input, output } = fixture();
    const review = output.opsReview;
    if (!review) throw new Error('Missing fixture handoff');
    review.findings.push({ text: 'Stale assertion', evidence: [{ id: 'unknown', revision: '9' }] });
    review.investigation.push({
      source: { id: 'unknown', revision: '1' },
      discoveredFrom: { id: 'missing-parent', revision: '1' },
      outcome: 'inspected',
      detail: 'Not actually available.',
    });
    expect(validateOpsReview(input, output)).toEqual(
      expect.arrayContaining([
        'Ops handoff references missing or stale evidence: unknown',
        'Ops handoff references missing or stale evidence: missing-parent',
        'Unavailable evidence cannot be marked inspected: unknown',
      ])
    );
  });

  it('rejects duplicate sources and self-discovery without claiming to verify actual tool use', () => {
    const { input, output } = fixture();
    const review = output.opsReview;
    const source = review?.investigation[0];
    if (!review || !source) throw new Error('Missing fixture investigation');
    review.investigation.push({ ...source, discoveredFrom: source.source });
    expect(validateOpsReview(input, output)).toEqual([
      'Duplicate investigation source: historical-application',
      'Investigation source cannot discover itself: historical-application',
    ]);
  });

  it('does not let a later human-only action or supported answer masquerade as an unresolved request', () => {
    const { input, output } = fixture();
    const question = output.questions[0];
    const action = output.protectedActions.find((item) => item.disposition === 'human-required');
    const answer = output.answers.find((item) => item.disposition === 'supported');
    if (!question?.review || !action || !answer) throw new Error('Missing fixture requirements');
    question.review.requirements = [
      { kind: 'protected-action', id: action.requirementId },
      { kind: 'answer', id: answer.requirementId },
      { kind: 'attachment', id: 'missing' },
      { kind: 'attachment', id: 'missing' },
    ];
    question.review.knownContext = [
      { text: 'Missing source', evidence: [{ id: 'missing', revision: '1' }] },
    ];
    expect(validateOpsReview(input, output)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Question must link an unresolved requirement/),
        expect.stringMatching(/Duplicate question requirement/),
        'Ops handoff references missing or stale evidence: missing',
      ])
    );
  });

  it('requires specific questions for new handoffs but permits access failures without fabricated requirements', () => {
    const { input, output } = fixture();
    const question = output.questions[0];
    if (!question?.review) throw new Error('Missing fixture question');
    question.review.requirements = [];
    expect(validateOpsReview(input, output)).toEqual(
      expect.arrayContaining([
        `Evidence question requires an unresolved requirement: ${question.id}`,
      ])
    );
    question.kind = 'access';
    expect(validateOpsReview(input, output)).not.toContain(
      `Evidence question requires an unresolved requirement: ${question.id}`
    );
    delete question.review;
    expect(validateOpsReview(input, output)).toEqual(
      expect.arrayContaining([`Ops handoff requires an actionable question: ${question.id}`])
    );
  });

  it('requires every unresolved required gap to have a residual request, without counting later human-only steps', () => {
    const { input, output } = fixture();
    expect(validateOpsReview(input, output)).toEqual([]);
    output.questions = output.questions.filter((question) => question.id !== 'current-declaration');
    expect(validateOpsReview(input, output)).toEqual([
      'Ops handoff requires a residual request: answer:current-declaration',
    ]);
    output.questions = [];
    expect(validateOpsReview(input, output)).toHaveLength(8);
  });

  it('rejects oversized default-facing paragraphs instead of silently truncating their meaning', () => {
    const { output } = fixture();
    expect(
      preparationOutputSchema.safeParse({
        ...output,
        opsReview: { ...output.opsReview, summary: 'x'.repeat(301) },
      }).success
    ).toBe(false);
  });
});
