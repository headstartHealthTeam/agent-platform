import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWorkflowPackage, validateWorkflowOutput } from '@headstart-health/workflow-runtime';
import { describe, expect, it } from 'vitest';

import { credentialingOutputSchema, type CredentialingOutput } from './contracts.js';
import { reviewFingerprint, validateProposal } from './review.js';
import { loadScenario } from './synthetic-tools.js';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = loadWorkflowPackage(directory);
const proposal = (): CredentialingOutput => {
  const value: unknown = JSON.parse(
    fs.readFileSync(path.join(directory, 'fixtures/output.valid.json'), 'utf8')
  );
  return credentialingOutputSchema.parse(value);
};
const question = (
  kind: CredentialingOutput['questions'][number]['kind']
): CredentialingOutput['questions'][number] => ({
  id: 'q',
  kind,
  question: 'Obtain the specific authorized resolution for this synthetic case.',
  evidenceIds: [],
  nextActor: 'ops',
});

describe('typed conditional human stops', () => {
  it('rejects an old output version and missing or unknown question kinds in both consumers', () => {
    const { kind, ...unclassified } = question('evidence');
    expect(kind).toBe('evidence');
    for (const value of [
      { ...proposal(), schemaVersion: '0.1.0' },
      { ...proposal(), questions: [unclassified] },
      { ...proposal(), questions: [{ ...question('evidence'), kind: 'approval' }] },
    ]) {
      expect(credentialingOutputSchema.safeParse(value).success).toBe(false);
      expect(validateWorkflowOutput(workflow, value).valid).toBe(false);
    }
  });

  it('accepts H-03-only reconciliation without adding a redundant evidence exception', () => {
    const input = loadScenario('uncertain-save');
    const output = proposal();
    output.workId = input.work.id;
    output.status = 'blocked';
    output.humanStops.push('H-03');
    output.questions = [
      {
        ...question('reconciliation'),
        question:
          'Reconcile the prior dispatched save against destination readback; do not replay it.',
        evidenceIds: ['prior-attempt'],
      },
    ];
    expect(validateWorkflowOutput(workflow, output).valid).toBe(true);
    expect(validateProposal(input, output)).toEqual([]);
    expect(reviewFingerprint(input, output)).toMatch(/^[a-f0-9]{64}$/u);
    expect(output.humanStops).not.toContain('H-02');
  });

  it.each(['access', 'reconciliation'] as const)(
    '%s requires blocked status and H-03 even when the case has no recorded unknown effect',
    (kind) => {
      const input = loadScenario('ga-initial');
      const output = proposal();
      output.questions = [question(kind)];
      output.humanStops.push('H-03');
      for (const status of ['prepared-for-review', 'needs-information'] as const) {
        output.status = status;
        expect(validateProposal(input, output)).toContain(
          'Access or reconciliation questions require a blocked H-03 handoff.'
        );
      }
      output.status = 'blocked';
      expect(validateProposal(input, output)).toEqual([]);
      output.humanStops = output.humanStops.filter((stop) => stop !== 'H-03');
      expect(validateProposal(input, output)).toContain(
        'Access or reconciliation questions require a blocked H-03 handoff.'
      );
    }
  );

  it('requires H-02 for an evidence question even when every answer is supported', () => {
    const input = loadScenario('ga-initial');
    const output = proposal();
    output.status = 'needs-information';
    output.questions = [question('evidence')];
    expect(validateProposal(input, output)).toContain(
      'Unresolved evidence requires an exception handoff.'
    );
    output.humanStops.push('H-02');
    expect(validateProposal(input, output)).toEqual([]);
    output.status = 'prepared-for-review';
    expect(validateProposal(input, output)).toContain(
      'Unresolved preparation cannot be presented as ready for review.'
    );
  });

  it.each(['unresolved-answer', 'evidence-question'] as const)(
    'requires both stops for recovery plus %s',
    (exception) => {
      const input = loadScenario('uncertain-save');
      const output = proposal();
      output.workId = input.work.id;
      output.status = 'blocked';
      output.humanStops.push('H-03');
      output.questions = [question('reconciliation')];
      if (exception === 'unresolved-answer') {
        output.answers = output.answers.map((answer) => ({
          ...answer,
          value: null,
          disposition: 'unresolved',
        }));
      } else {
        output.questions.push({ ...question('evidence'), id: 'evidence-q' });
      }
      expect(validateProposal(input, output)).toContain(
        'Unresolved evidence requires an exception handoff.'
      );
      output.humanStops.push('H-02');
      expect(validateProposal(input, output)).toEqual([]);
      output.humanStops = output.humanStops.filter((stop) => stop !== 'H-03');
      expect(validateProposal(input, output)).toContain(
        'Unknown prior effect requires reconciliation.'
      );
    }
  );

  it('cannot bypass unknown-effect blocking by omitting or relabeling questions', () => {
    const input = loadScenario('uncertain-save');
    for (const questions of [[], [question('evidence')]]) {
      const output = proposal();
      output.workId = input.work.id;
      output.status = 'needs-information';
      output.questions = questions;
      output.humanStops.push('H-02');
      expect(validateProposal(input, output)).toContain(
        'Unknown prior effect requires reconciliation.'
      );
      expect(() => reviewFingerprint(input, output)).toThrow('Unknown prior effect');
    }
  });
});
