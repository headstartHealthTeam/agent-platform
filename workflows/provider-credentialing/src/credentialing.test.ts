import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadWorkflowPackage,
  validateWorkflowInput,
  validateWorkflowOutput,
} from '@headstart-health/workflow-runtime';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  credentialingInputSchema,
  credentialingOutputSchema,
  type CredentialingInput,
  type CredentialingOutput,
} from './contracts.js';
import { reviewFingerprint, validateProposal } from './review.js';
import { validateSnapshot } from './snapshot.js';
import {
  createSyntheticTools,
  loadScenario,
  runSyntheticCommand,
  scenarioIds,
} from './synthetic-tools.js';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = loadWorkflowPackage(directory);
const readJson = (relative: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'));
const referenceOutput = (): CredentialingOutput =>
  credentialingOutputSchema.parse(readJson('fixtures/output.valid.json'));
const firstAnswer = (output: CredentialingOutput): CredentialingOutput['answers'][number] => {
  const answer = output.answers.at(0);
  if (!answer) throw new Error('Expected fixture answer.');
  return answer;
};

describe('credentialing preparation contracts', () => {
  it.each(scenarioIds)('accepts the invented %s case through both schema consumers', (id) => {
    const input = loadScenario(id);
    expect(validateSnapshot(input)).toEqual([]);
    expect(validateWorkflowInput(workflow, input).valid).toBe(true);
    expect(input.dataMode).toBe('synthetic');
  });

  it('keeps JSON Schemas synchronized with the canonical typed contracts', () => {
    expect(workflow.inputSchema).toEqual(z.toJSONSchema(credentialingInputSchema));
    expect(workflow.outputSchema).toEqual(z.toJSONSchema(credentialingOutputSchema));
    expect(validateWorkflowOutput(workflow, referenceOutput()).valid).toBe(true);
    expect(readJson('fixtures/input.valid.json')).toEqual(loadScenario('ga-initial'));
  });

  it('rejects missing work, undeclared fields and live data in both consumers', () => {
    for (const value of [
      {},
      { ...loadScenario('ga-initial'), dataMode: 'live' },
      { ...loadScenario('ga-initial'), credential: 'synthetic-not-a-secret' },
    ]) {
      expect(credentialingInputSchema.safeParse(value).success).toBe(false);
      expect(validateWorkflowInput(workflow, value).valid).toBe(false);
    }
    expect(
      validateWorkflowOutput(workflow, { ...referenceOutput(), status: 'submitted' }).valid
    ).toBe(false);
  });

  it('retains payer-neutral request, location and prior-affiliation identity', () => {
    const input = loadScenario('tx-group-add');
    expect(input.work.requestType).toBe('group-add');
    expect(input.work.locationIds).toEqual(['location-a', 'location-b']);
    expect(input.work.existingAffiliationIds).toEqual(['affiliation-retained']);
    expect(input.work.jurisdiction).toBe('TX');
  });

  it('does not mistake the reference output for approval or external execution', () => {
    const output = referenceOutput();
    expect(validateProposal(loadScenario('ga-initial'), output)).toEqual([]);
    expect(output.status).toBe('prepared-for-review');
    expect(output.humanStops).toEqual(['H-01', 'H-04', 'H-05']);
    expect(reviewFingerprint(loadScenario('ga-initial'), output)).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe('evidence integrity', () => {
  const mutations: { name: string; mutate: (input: CredentialingInput) => void }[] = [
    {
      name: 'duplicate evidence',
      mutate: (input): void => {
        input.evidence.push(...input.evidence);
      },
    },
    {
      name: 'duplicate facts',
      mutate: (input): void => {
        input.facts.push(...input.facts);
      },
    },
    {
      name: 'duplicate requirements',
      mutate: (input): void => {
        input.requirements.push(...input.requirements);
      },
    },
    {
      name: 'another subject',
      mutate: (input): void => {
        for (const item of input.evidence) item.subjectId = 'unrelated-provider';
      },
    },
    {
      name: 'another fact subject',
      mutate: (input): void => {
        for (const fact of input.facts) fact.subjectId = 'unrelated-provider';
      },
    },
    {
      name: 'another location',
      mutate: (input): void => {
        for (const fact of input.facts) fact.locationIds = ['unrelated-location'];
      },
    },
    {
      name: 'missing content',
      mutate: (input): void => {
        for (const item of input.evidence) item.content = null;
      },
    },
    {
      name: 'content on failed read',
      mutate: (input): void => {
        for (const item of input.evidence) item.retrieval = 'error';
      },
    },
    {
      name: 'stale fact evidence',
      mutate: (input): void => {
        for (const fact of input.facts)
          fact.evidence = [{ id: 'practice-letter', revision: 'old' }];
      },
    },
    {
      name: 'invented unresolved fact',
      mutate: (input): void => {
        for (const fact of input.facts) fact.value = 'invented';
      },
    },
  ];
  it.each(mutations)('rejects $name', ({ mutate }) => {
    const input = loadScenario('ga-initial');
    mutate(input);
    expect(validateSnapshot(input).length).toBeGreaterThan(0);
    expect(() => createSyntheticTools(input)).toThrow();
    expect(() => reviewFingerprint(input, referenceOutput())).toThrow();
  });
});

describe('review binding and truthful stop state', () => {
  const mutations: { name: string; mutate: (output: CredentialingOutput) => void }[] = [
    {
      name: 'work identity',
      mutate: (output): void => {
        output.workId = 'another-case';
      },
    },
    {
      name: 'case version',
      mutate: (output): void => {
        output.caseRevision = 'old';
      },
    },
    {
      name: 'workflow version',
      mutate: (output): void => {
        output.workflowRevision = 'old';
      },
    },
    {
      name: 'route version',
      mutate: (output): void => {
        output.routeRevision = 'old';
      },
    },
    {
      name: 'missing disposition',
      mutate: (output): void => {
        output.answers = [];
      },
    },
    {
      name: 'duplicate disposition',
      mutate: (output): void => {
        output.answers.push(...output.answers);
      },
    },
    {
      name: 'unknown requirement',
      mutate: (output): void => {
        firstAnswer(output).requirementId = 'unknown';
      },
    },
    {
      name: 'unknown fact',
      mutate: (output): void => {
        firstAnswer(output).factIds = ['unknown'];
      },
    },
    {
      name: 'unknown question evidence',
      mutate: (output): void => {
        output.questions = [
          {
            id: 'q',
            kind: 'evidence',
            question: 'Resolve discrepancy?',
            evidenceIds: ['unknown'],
            nextActor: 'ops',
          },
        ];
      },
    },
    {
      name: 'uncited answer',
      mutate: (output): void => {
        firstAnswer(output).evidence = [];
      },
    },
    {
      name: 'missing supported value',
      mutate: (output): void => {
        firstAnswer(output).value = null;
      },
    },
    {
      name: 'value on unresolved answer',
      mutate: (output): void => {
        firstAnswer(output).disposition = 'unresolved';
      },
    },
    {
      name: 'stale evidence',
      mutate: (output): void => {
        firstAnswer(output).evidence = [{ id: 'practice-letter', revision: 'old' }];
      },
    },
    {
      name: 'missing human stops',
      mutate: (output): void => {
        output.humanStops = [];
      },
    },
  ];
  it.each(mutations)('rejects $name', ({ mutate }) => {
    const output = referenceOutput();
    mutate(output);
    expect(validateProposal(loadScenario('ga-initial'), output).length).toBeGreaterThan(0);
    expect(() => reviewFingerprint(loadScenario('ga-initial'), output)).toThrow();
  });

  it.each(['expired', 'unknown'] as const)('rejects evidence whose validity is %s', (validity) => {
    const input = loadScenario('ga-initial');
    for (const item of input.evidence) item.validity = validity;
    expect(validateProposal(input, referenceOutput()).join(' ')).toContain('Unavailable');
  });

  it('accepts a precise unresolved handoff without inventing a value', () => {
    const output = referenceOutput();
    output.status = 'needs-information';
    firstAnswer(output).disposition = 'unresolved';
    firstAnswer(output).value = null;
    output.questions = [
      {
        id: 'q',
        kind: 'evidence',
        question: 'Which version is authoritative?',
        evidenceIds: ['practice-letter'],
        nextActor: 'ops',
      },
    ];
    output.humanStops.push('H-02');
    expect(validateProposal(loadScenario('ga-initial'), output)).toEqual([]);
    output.questions.push(...output.questions);
    expect(validateProposal(loadScenario('ga-initial'), output)).toContain(
      'Ambiguous duplicate identifiers.'
    );
  });

  it('does not accept awaiting or missing content as support', () => {
    const input = loadScenario('ga-initial');
    for (const item of input.evidence) {
      item.retrieval = 'awaiting-file';
      item.content = null;
    }
    expect(validateSnapshot(input)).toEqual([]);
    expect(validateProposal(input, referenceOutput()).join(' ')).toContain('Unavailable');
  });

  it('requires a blocked reconciliation handoff for an uncertain prior save', () => {
    const input = loadScenario('uncertain-save');
    const output = referenceOutput();
    output.workId = input.work.id;
    expect(validateProposal(input, output)).toContain(
      'Unknown prior effect requires reconciliation.'
    );
    output.humanStops.push('H-03');
    expect(validateProposal(input, output)).toContain(
      'Unknown prior effect requires reconciliation.'
    );
    output.status = 'blocked';
    expect(validateProposal(input, output)).toEqual([]);
  });

  it('does not claim readiness after stop or denied preparation', () => {
    const input = loadScenario('ga-initial');
    input.execution.stopRequested = true;
    expect(validateProposal(input, referenceOutput()).join(' ')).toContain('Stop requested');
    input.execution.stopRequested = false;
    input.execution.permittedActions = ['inspect'];
    expect(validateProposal(input, referenceOutput()).join(' ')).toContain('not permitted');
    const output = referenceOutput();
    output.status = 'blocked';
    expect(validateProposal(input, output)).toEqual([]);
  });

  it('changes content binding for scope, facts, evidence, route and proposed values', () => {
    const input = loadScenario('ga-initial');
    const output = referenceOutput();
    const before = reviewFingerprint(input, output);
    const changedScope = structuredClone(input);
    changedScope.work.product = 'different-product';
    expect(reviewFingerprint(changedScope, output)).not.toBe(before);
    const changedEvidence = structuredClone(input);
    for (const item of changedEvidence.evidence)
      item.content = `${item.content ?? ''} Supplemental context.`;
    expect(reviewFingerprint(changedEvidence, output)).not.toBe(before);
    const changedFacts = structuredClone(input);
    for (const fact of changedFacts.facts) fact.key = 'different-key';
    expect(reviewFingerprint(changedFacts, output)).not.toBe(before);
    const changedRoute = structuredClone(input);
    changedRoute.routeRevision = 'r2';
    expect(reviewFingerprint(changedRoute, { ...output, routeRevision: 'r2' })).not.toBe(before);
    const changedOutput = referenceOutput();
    firstAnswer(changedOutput).value = '2020-03-03';
    expect(reviewFingerprint(input, changedOutput)).not.toBe(before);
    // Shape/provenance validation cannot establish whether a cited source supports that changed date.
  });
});

describe('scoped investigative tools', () => {
  it('requires evidence discovery and lets the agent revisit a source independently', () => {
    const tools = createSyntheticTools(loadScenario('ga-initial'));
    expect(tools.readCase()).not.toHaveProperty('evidence');
    expect(tools.listEvidence().every((item) => !Object.hasOwn(item, 'content'))).toBe(true);
    expect(tools.readEvidence('practice-letter').content).toContain('2020-02-03');
    const retrieved = tools.readEvidence('practice-letter');
    retrieved.content = 'modified local copy';
    expect(tools.readEvidence('practice-letter').content).toContain('2020-02-03');
    const snapshot = tools.readCase();
    snapshot.work.locationIds.push('unrelated');
    expect(tools.readCase().work.locationIds).toEqual(['location-a']);
    expect(() => tools.readEvidence('another-case-file')).toThrow('outside');
  });

  it('returns awaiting evidence explicitly rather than an empty success', () => {
    const tools = createSyntheticTools(loadScenario('late-conflicting-files'));
    expect(tools.readEvidence('cv')).toMatchObject({ retrieval: 'awaiting-file', content: null });
    expect(tools.readEvidence('later-letter').content).toContain('2020-03-03');
  });

  it('denies synthetic inspection after stop or without permission', () => {
    const input = loadScenario('ga-initial');
    input.execution.stopRequested = true;
    expect(() => createSyntheticTools(input)).toThrow('stopped');
    input.execution.stopRequested = false;
    input.execution.permittedActions = ['prepare'];
    expect(() => createSyntheticTools(input)).toThrow('not permitted');
  });

  it('dispatches only the three documented synthetic read operations', () => {
    expect(runSyntheticCommand(['ga-initial', 'case'])).toHaveProperty('work');
    expect(runSyntheticCommand(['ga-initial', 'list-evidence'])).toHaveLength(2);
    expect(runSyntheticCommand(['ga-initial', 'read-evidence', 'practice-letter'])).toHaveProperty(
      'content'
    );
    for (const args of [
      [],
      ['ga-initial'],
      ['ga-initial', 'save'],
      ['ga-initial', 'read-evidence'],
      ['ga-initial', 'case', 'extra'],
      ['ga-initial', 'case', 'extra', 'extra'],
    ]) {
      expect(() => runSyntheticCommand(args)).toThrow();
    }
    expect(() => loadScenario('../../unrelated')).toThrow('Unknown synthetic');
  });
});
