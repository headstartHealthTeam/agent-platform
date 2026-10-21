import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { artifactValidationReply } from './artifact-validation.js';
import {
  preparationInputSchema,
  preparationOutputSchema,
  type PreparationInput,
  type PreparationOutput,
} from './preparation-contracts.js';

/** Isolate payer-address readiness from every unrelated historical-fixture discrepancy. */
const addressOnly = (): { input: PreparationInput; output: PreparationOutput } => {
  const load = (suffix: string): unknown =>
    JSON.parse(
      readFileSync(
        new URL(`../fixtures/preparation/historical-preparation.${suffix}.json`, import.meta.url),
        'utf8'
      )
    );
  const input = preparationInputSchema.parse(load('input'));
  const output = preparationOutputSchema.parse(load('output'));
  const unmapped = new Set(
    input.records
      .filter((record) => record.kind === 'address' && record.addressRole === null)
      .map((record) => record.id)
  );
  input.requirements = input.requirements.filter(
    (requirement) => requirement.scope.recordId !== null && unmapped.has(requirement.scope.recordId)
  );
  output.answers = output.answers.filter((answer) =>
    input.requirements.some((requirement) => requirement.id === answer.requirementId)
  );
  input.attachmentRequirements = [];
  input.protectedActionRequirements = [];
  output.attachments = [];
  output.protectedActions = [];
  output.questions = [];
  return { input, output };
};

const supportAnswers = (input: PreparationInput, output: PreparationOutput): void => {
  for (const answer of output.answers) {
    const fact = input.facts.find((item) => answer.factIds.includes(item.id));
    if (!fact) throw new Error('Missing invented address fact');
    if (fact.value === null) throw new Error('Missing invented address value');
    answer.disposition = 'supported';
    answer.value = fact.value;
    answer.basis = 'documented';
    answer.evidence = fact.evidence;
  }
  output.status = 'prepared-for-review';
  output.humanStops = ['H-01', 'H-04', 'H-05'];
};

describe.each(['synthetic', 'production-read'] as const)('%s payer-address readiness', (mode) => {
  const validate = (
    input: PreparationInput,
    output: PreparationOutput
  ): ReturnType<typeof artifactValidationReply> =>
    artifactValidationReply({
      inputJson: JSON.stringify(
        mode === 'production-read' ? { ...input, schemaVersion: '0.3.0', dataMode: mode } : input
      ),
      proposalJson: JSON.stringify(output),
    });

  it('retains documented source context with unresolved destination answers and H-02', () => {
    const { input, output } = addressOnly();
    expect(output.answers).toHaveLength(5);
    expect(output.answers.every((answer) => answer.disposition === 'unresolved')).toBe(true);
    expect(output.humanStops).toContain('H-02');
    expect(validate(input, output)).toMatchObject({
      ok: true,
      value: { readiness: 'needs-information' },
    });
  });

  it('rejects supported destination answers when the payer address role alone is unknown', () => {
    const { input, output } = addressOnly();
    supportAnswers(input, output);
    expect(validate(input, output)).toEqual({
      ok: false,
      code: 'invalid-artifacts',
      issues: output.answers.map(
        (answer) => `Answer requires an established payer address role: ${answer.requirementId}`
      ),
    });
    // Even another incomplete status/H-02 cannot disguise a falsely supported field.
    output.status = 'needs-information';
    output.humanStops.push('H-02');
    expect(validate(input, output)).toMatchObject({ ok: false, code: 'invalid-artifacts' });
  });

  it('accepts the same answers only after their corresponding address roles are established', () => {
    const { input, output } = addressOnly();
    supportAnswers(input, output);
    for (const record of input.records) {
      if (record.id === 'service-a') record.addressRole = 'service';
      if (record.id === 'pay-to') record.addressRole = 'pay-to';
    }
    expect(validate(input, output)).toMatchObject({
      ok: true,
      value: { readiness: 'prepared-for-review' },
    });
  });

  it('does not block mapped answers merely because unrelated unmapped inventory is retained', () => {
    const { input, output } = addressOnly();
    supportAnswers(input, output);
    const record = input.records.find((item) => item.id === 'service-a');
    if (!record) throw new Error('Missing invented service address');
    record.addressRole = 'service';
    input.requirements = input.requirements.filter((item) => item.scope.recordId === record.id);
    output.answers = output.answers.filter((answer) =>
      input.requirements.some((requirement) => requirement.id === answer.requirementId)
    );
    expect(input.records.find((item) => item.id === 'pay-to')?.addressRole).toBeNull();
    expect(validate(input, output)).toMatchObject({
      ok: true,
      value: { readiness: 'prepared-for-review' },
    });
  });
});
