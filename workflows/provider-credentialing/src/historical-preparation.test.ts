import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { artifactValidationReply } from './artifact-validation.js';
import {
  preparationInputSchema,
  preparationOutputSchema,
  type PreparationInput,
  type PreparationOutput,
} from './preparation-contracts.js';

const request = (): { inputJson: string; proposalJson: string } => ({
  inputJson: readFileSync(
    new URL('../fixtures/preparation/historical-preparation.input.json', import.meta.url),
    'utf8'
  ),
  proposalJson: readFileSync(
    new URL('../fixtures/preparation/historical-preparation.output.json', import.meta.url),
    'utf8'
  ),
});

describe('complete mixed-source historical preparation', () => {
  it('accepts unresolved payer roles, genuine conflicts and historical comparison without fabricating current support', () => {
    expect(artifactValidationReply(request())).toMatchObject({
      ok: true,
      value: { readiness: 'needs-information' },
    });
  });
  it('uses the same semantics for production-read without changing conflicts or historical validity', () => {
    const value = request();
    const input = preparationInputSchema.parse(JSON.parse(value.inputJson));
    expect(input.artifacts).toHaveLength(7);
    expect(input.evidence.some((item) => item.validity === 'expired')).toBe(true);
    expect(input.evidence.some((item) => item.validity === 'unknown')).toBe(true);
    expect(input.facts.filter((item) => item.disposition === 'conflicting')).toHaveLength(2);
    expect(
      artifactValidationReply({
        ...value,
        inputJson: JSON.stringify({
          ...input,
          schemaVersion: '0.3.0',
          dataMode: 'production-read',
        }),
      })
    ).toMatchObject({
      ok: true,
      value: { dataMode: 'production-read', readiness: 'needs-information' },
    });
  });
  const first = <T>(items: T[]): T => {
    const value = items[0];
    if (value === undefined) throw new Error('Missing invented fixture entry');
    return value;
  };
  const invalid: {
    name: string;
    issue: RegExp;
    mutate: (input: PreparationInput, output: PreparationOutput) => void;
  }[] = [
    {
      name: 'address without source context or payer role',
      issue: /Invalid address role:/,
      mutate: (input): void => {
        delete first(
          input.records.filter((item) => item.addressRole === null && item.kind === 'address')
        ).sourceAddressType;
      },
    },
    {
      name: 'source address context on non-address',
      issue: /Invalid address role:/,
      mutate: (input): void => {
        first(input.records.filter((item) => item.kind === 'education')).sourceAddressType =
          'business';
      },
    },
    {
      name: 'external ID used as internal evidence record',
      issue: /Invalid preparation scope:/,
      mutate: (input): void => {
        const item = first(input.evidence.filter((entry) => entry.recordId !== null));
        item.recordId = item.source.recordId;
      },
    },
    {
      name: 'historical evidence promoted to current support',
      issue: /Unavailable, stale or unknown evidence: historical-application/,
      mutate: (input, output): void => {
        const fact = first(input.facts.filter((item) => item.id === 'prior-declaration'));
        const answer = first(output.answers.filter((item) => item.factIds.includes(fact.id)));
        answer.disposition = 'supported';
        answer.value = fact.value;
        answer.basis = 'declared';
        answer.evidence = fact.evidence;
      },
    },
    {
      name: 'cross-subject evidence claimed as current support',
      issue: /Answer lacks scoped current evidence or basis:/,
      mutate: (input, output): void => {
        const answer = first(
          output.answers.filter(
            (item) =>
              item.disposition === 'supported' &&
              input.requirements.some(
                (requirement) =>
                  requirement.id === item.requirementId &&
                  requirement.scope.subjectId === input.work.providerId
              )
          )
        );
        const evidence = first(
          input.evidence.filter((item) => item.subjectId === input.work.practiceId)
        );
        answer.evidence = [{ id: evidence.id, revision: evidence.revision }];
      },
    },
    {
      name: 'conflicting fact silently assigned a chosen value',
      issue: /Unresolved or inapplicable fact carries a value:/,
      mutate: (input): void => {
        first(input.facts.filter((item) => item.disposition === 'conflicting')).value =
          'chosen without resolution';
      },
    },
    {
      name: 'mixed-subject analysis memo labeled a conversion',
      issue: /Invalid conversion source: optional-analysis-memo/,
      mutate: (input): void => {
        const provider = first(
          input.artifacts.filter((item) => item.scope.subjectId === input.work.providerId)
        );
        const practice = first(
          input.artifacts.filter((item) => item.scope.subjectId === input.work.practiceId)
        );
        input.artifacts.push({
          ...provider,
          id: 'optional-analysis-memo',
          digest: `sha256:${'9'.repeat(64)}`,
          lineage: {
            kind: 'converted',
            sources: [provider, practice].map(({ id, revision, digest }) => ({
              id,
              revision,
              digest,
            })),
            transformation: { id: 'memo', revision: '1' },
          },
        });
      },
    },
    {
      name: 'changed original digest',
      issue: /Invalid conversion source: license-pdf/,
      mutate: (input): void => {
        first(input.artifacts).digest = `sha256:${'9'.repeat(64)}`;
      },
    },
    {
      name: 'stale proposal',
      issue: /Proposal does not match the current work and revisions/,
      mutate: (_input, output): void => {
        output.caseRevision = '999';
      },
    },
    {
      name: 'missing human exception stop',
      issue: /Unresolved evidence requires an exception handoff/,
      mutate: (_input, output): void => {
        output.humanStops = output.humanStops.filter((item) => item !== 'H-02');
      },
    },
    {
      name: 'stopped execution',
      issue: /Stop requested:/,
      mutate: (input): void => {
        input.execution.stopRequested = true;
      },
    },
  ];
  it.each(invalid)('still rejects $name', ({ mutate, issue }) => {
    const value = request();
    const input = preparationInputSchema.parse(JSON.parse(value.inputJson));
    const output = preparationOutputSchema.parse(JSON.parse(value.proposalJson));
    mutate(input, output);
    const reply = artifactValidationReply({
      inputJson: JSON.stringify(input),
      proposalJson: JSON.stringify(output),
    });
    expect(reply).toMatchObject({ ok: false, code: 'invalid-artifacts' });
    if (!reply.ok)
      expect(reply.issues).toEqual(expect.arrayContaining([expect.stringMatching(issue)]));
  });
  it('isolates historical validity from cross-subject scope rejection', () => {
    const value = request();
    const input = preparationInputSchema.parse(JSON.parse(value.inputJson));
    const output = preparationOutputSchema.parse(JSON.parse(value.proposalJson));
    const fact = first(input.facts.filter((item) => item.id === 'prior-declaration'));
    const answer = first(
      output.answers.filter((item) => item.requirementId === 'current-declaration')
    );
    answer.disposition = 'supported';
    answer.value = fact.value;
    answer.basis = 'declared';
    answer.evidence = fact.evidence;
    const validate = (): ReturnType<typeof artifactValidationReply> =>
      artifactValidationReply({
        inputJson: JSON.stringify(input),
        proposalJson: JSON.stringify(output),
      });
    expect(validate()).toEqual({
      ok: false,
      code: 'invalid-artifacts',
      issues: [
        'Answer lacks scoped current evidence or basis: current-declaration',
        'Unavailable, stale or unknown evidence: historical-application',
      ],
    });
    // Counterfactual fixture only: changing validity is the sole difference, not a live correction.
    first(input.evidence.filter((item) => item.id === 'historical-application')).validity =
      'current';
    expect(validate()).toMatchObject({ ok: true });
  });
});
