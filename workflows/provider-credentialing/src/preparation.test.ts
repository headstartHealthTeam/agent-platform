import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadWorkflowPackage,
  validateWorkflowInput,
  validateWorkflowOutput,
} from '@headstart-health/workflow-runtime';
import { describe, expect, it } from 'vitest';

import { validateReviewArtifacts } from './artifact-validation.js';
import { credentialingOutputSchema } from './contracts.js';
import {
  preparationInputSchema,
  preparationOutputSchema,
  type PreparationInput,
  type PreparationOutput,
} from './preparation-contracts.js';
import { reviewFingerprint, validateProposal } from './review.js';
import { validateSnapshot } from './snapshot.js';
import {
  createSyntheticTools,
  loadPreparationScenario,
  loadScenario,
  preparationScenarioIds,
  runSyntheticCommand,
} from './synthetic-tools.js';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = loadWorkflowPackage(directory);
const readJson = (relative: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(directory, relative), 'utf8'));
const proposal = (id = 'ga-preparation'): PreparationOutput =>
  preparationOutputSchema.parse(readJson(`fixtures/preparation/${id}.output.json`));
const first = <T>(items: T[]): T => {
  const item = items.at(0);
  if (item === undefined) throw new Error('Expected fixture item.');
  return item;
};
const converted = (input: PreparationInput): PreparationInput['artifacts'][number] =>
  first(input.artifacts.filter((item) => item.lineage.kind === 'converted'));

describe('versioned, source-shaped synthetic preparation', () => {
  it.each(preparationScenarioIds)(
    'validates %s through the same typed, JSON Schema and application boundaries',
    (id) => {
      const input = loadPreparationScenario(id);
      const output = proposal(id);
      expect(validateSnapshot(input)).toEqual([]);
      expect(validateProposal(input, output)).toEqual([]);
      expect(validateWorkflowInput(workflow, input).valid).toBe(true);
      expect(validateWorkflowOutput(workflow, output).valid).toBe(true);
      expect(
        validateReviewArtifacts({
          inputJson: JSON.stringify(input),
          proposalJson: JSON.stringify(output),
        })
      ).toMatchObject({
        inputSchemaVersion: '0.2.0',
        proposalSchemaVersion: '0.3.0',
        readiness: 'prepared-for-review',
      });
      expect(input.records.filter((item) => item.kind === 'education')).toHaveLength(2);
      expect(input.records.filter((item) => item.kind === 'employment')).toHaveLength(3);
      expect(input.records.filter((item) => item.kind === 'ownership')).toHaveLength(2);
      expect(input.records.some((item) => item.kind === 'management')).toBe(true);
      expect(output.answers.length).toBeGreaterThan(25);
      expect(output.attachments.some((item) => item.artifact?.id === 'cv-deficient')).toBe(false);
      expect(output.protectedActions.every((item) => item.disposition === 'human-required')).toBe(
        true
      );
    }
  );
  it('retains distinct address roles, related parties, proxy provenance and conversion lineage', () => {
    const input = loadPreparationScenario('ga-preparation');
    expect(
      input.records.filter((item) => item.kind === 'address').map((item) => item.addressRole)
    ).toEqual(['service', 'pay-to', 'mail-to']);
    expect(
      input.facts.some((item) => item.disposition === 'proxy' && item.qualification !== null)
    ).toBe(true);
    expect(converted(input).lineage).toMatchObject({
      kind: 'converted',
      sources: [{ id: 'license-image', revision: 'r1' }],
    });
    expect(first(input.protectedActionRequirements).blocksRequirementIds).toContain(
      'answer-ownership-one-percentage'
    );
    const tx = loadPreparationScenario('tx-preparation');
    expect(tx.work.existingAffiliationIds).toEqual(['affiliation-retained']);
    expect(tx.work.locationIds).toHaveLength(2);
    expect(
      tx.protectedActionRequirements
        .filter((item) => item.action === 'signature')
        .map((item) => item.actorSubjectId)
    ).toEqual(['practice-alpha', 'provider-alpha']);
  });
  it('keeps the legacy pair valid but rejects cross-version pairing', () => {
    const legacy = credentialingOutputSchema.parse(readJson('fixtures/output.valid.json'));
    expect(validateProposal(loadScenario('ga-initial'), legacy)).toEqual([]);
    expect(validateProposal(loadScenario('ga-initial'), proposal()).join(' ')).toContain(
      'schema-version pair'
    );
    expect(validateProposal(loadPreparationScenario('ga-preparation'), legacy).join(' ')).toContain(
      'schema-version pair'
    );
  });
  it('does not send evidence bodies or reference answers with the initial tool projection', () => {
    const input = loadPreparationScenario('ga-preparation');
    const tools = createSyntheticTools(input);
    const snapshot = tools.readCase();
    expect(snapshot).not.toHaveProperty('evidence');
    expect(snapshot).not.toHaveProperty('answers');
    expect(snapshot).toHaveProperty('records', input.records);
    expect(tools.listEvidence().every((item) => !('content' in item))).toBe(true);
    expect(
      runSyntheticCommand(['ga-preparation', 'read-evidence', 'license-image-source'])
    ).toEqual(tools.readEvidence('license-image-source'));
    expect(() => loadPreparationScenario('../escape')).toThrow('Unknown');
  });
  it('binds destinations, lineage and human action routing into review content', () => {
    const input = loadPreparationScenario('ga-preparation');
    const original = reviewFingerprint(input, proposal());
    first(input.requirements).destination.field = 'changed-field';
    expect(reviewFingerprint(input, proposal())).not.toBe(original);
    const changed = reviewFingerprint(input, proposal());
    first(input.protectedActionRequirements).actorRole = 'different designated role';
    expect(reviewFingerprint(input, proposal())).not.toBe(changed);
  });
});

describe('preparation snapshot integrity', () => {
  const mutations: { name: string; mutate: (input: PreparationInput) => void }[] = [
    {
      name: 'duplicate party',
      mutate: (input): void => {
        input.relatedParties.push(first(input.relatedParties));
      },
    },
    {
      name: 'party collides with provider',
      mutate: (input): void => {
        first(input.relatedParties).id = input.work.providerId;
      },
    },
    {
      name: 'duplicate record',
      mutate: (input): void => {
        input.records.push(first(input.records));
      },
    },
    {
      name: 'duplicate artifact',
      mutate: (input): void => {
        input.artifacts.push(first(input.artifacts));
      },
    },
    {
      name: 'cross-kind requirement collision',
      mutate: (input): void => {
        first(input.attachmentRequirements).id = first(input.requirements).id;
      },
    },
    {
      name: 'unknown party evidence',
      mutate: (input): void => {
        first(first(input.relatedParties).evidence).revision = 'missing';
      },
    },
    {
      name: 'record outside subject',
      mutate: (input): void => {
        first(input.records).subjectId = 'other';
      },
    },
    {
      name: 'record outside location',
      mutate: (input): void => {
        first(input.records).locationIds = ['other'];
      },
    },
    {
      name: 'unknown related party',
      mutate: (input): void => {
        first(input.records).relatedPartyId = 'other';
      },
    },
    {
      name: 'address without role',
      mutate: (input): void => {
        first(input.records).addressRole = null;
      },
    },
    {
      name: 'non-address with role',
      mutate: (input): void => {
        first(input.records.filter((item) => item.kind === 'education')).addressRole = 'service';
      },
    },
    {
      name: 'reversed dates',
      mutate: (input): void => {
        first(input.records).period = { start: '2026-02-01', end: '2026-01-01' };
      },
    },
    {
      name: 'unknown fact record',
      mutate: (input): void => {
        first(input.facts).recordId = 'other';
      },
    },
    {
      name: 'wrong fact record subject',
      mutate: (input): void => {
        first(input.facts).recordId = 'degree-one';
      },
    },
    {
      name: 'unknown evidence location',
      mutate: (input): void => {
        first(input.evidence).locationIds = ['other'];
      },
    },
    {
      name: 'unknown requirement subject',
      mutate: (input): void => {
        first(input.requirements).scope.subjectId = 'other';
      },
    },
    {
      name: 'proxy missing rationale',
      mutate: (input): void => {
        first(input.facts.filter((item) => item.disposition === 'proxy')).qualification = null;
      },
    },
    {
      name: 'unknown artifact evidence',
      mutate: (input): void => {
        first(first(input.artifacts).evidence).revision = 'missing';
      },
    },
    {
      name: 'stale conversion revision',
      mutate: (input): void => {
        first(input.artifacts).revision = 'r2';
      },
    },
    {
      name: 'stale conversion digest',
      mutate: (input): void => {
        first(input.artifacts).digest = `sha256:${'e'.repeat(64)}`;
      },
    },
    {
      name: 'conversion wrong subject',
      mutate: (input): void => {
        first(input.artifacts).scope.subjectId = 'practice-alpha';
      },
    },
    {
      name: 'conversion broader scope',
      mutate: (input): void => {
        converted(input).scope.recordId = null;
      },
    },
    {
      name: 'self-referencing conversion',
      mutate: (input): void => {
        const item = converted(input);
        item.lineage = {
          kind: 'converted',
          sources: [{ id: item.id, revision: item.revision, digest: item.digest }],
          transformation: { id: 'test', revision: 'v1' },
        };
      },
    },
    {
      name: 'two-file cycle',
      mutate: (input): void => {
        const item = converted(input);
        first(input.artifacts).lineage = {
          kind: 'converted',
          sources: [{ id: item.id, revision: item.revision, digest: item.digest }],
          transformation: { id: 'test', revision: 'v1' },
        };
      },
    },
    {
      name: 'unknown conversion source',
      mutate: (input): void => {
        converted(input).lineage = {
          kind: 'converted',
          sources: [{ id: 'missing', revision: 'r1', digest: `sha256:${'a'.repeat(64)}` }],
          transformation: { id: 'test', revision: 'v1' },
        };
      },
    },
    {
      name: 'unknown signer',
      mutate: (input): void => {
        first(input.protectedActionRequirements).actorSubjectId = 'other';
      },
    },
    {
      name: 'unknown protected attachment',
      mutate: (input): void => {
        first(input.protectedActionRequirements).attachmentRequirementIds = ['other'];
      },
    },
    {
      name: 'unknown mid-form dependency',
      mutate: (input): void => {
        first(input.protectedActionRequirements).blocksRequirementIds = ['other'];
      },
    },
  ];
  it.each(mutations)('rejects $name', ({ mutate }) => {
    const input = loadPreparationScenario('ga-preparation');
    mutate(input);
    expect(validateSnapshot(input).length).toBeGreaterThan(0);
    expect(() => reviewFingerprint(input, proposal())).toThrow();
  });
  it('allows scoped evidence for a declared related party without widening access', () => {
    const input = loadPreparationScenario('ga-preparation');
    input.evidence.push({ ...first(input.evidence), id: 'owner-document', subjectId: 'owner-one' });
    expect(validateSnapshot(input)).toEqual([]);
    expect(() => createSyntheticTools(input).readEvidence('unrelated-owner')).toThrow('outside');
  });
  it('rejects malformed dates and unknown fields at both schema boundaries', () => {
    const input = loadPreparationScenario('ga-preparation');
    const invalid = {
      ...input,
      records: [{ ...first(input.records), period: { start: '2026-02-30', end: null } }],
    };
    expect(preparationInputSchema.safeParse(invalid).success).toBe(false);
    expect(validateWorkflowInput(workflow, invalid).valid).toBe(false);
    const action = { ...first(proposal().protectedActions), execute: true };
    expect(
      preparationOutputSchema.safeParse({ ...proposal(), protectedActions: [action] }).success
    ).toBe(false);
  });
});

describe('exact proposed content and human boundaries', () => {
  const mutations: {
    name: string;
    mutate: (input: PreparationInput, output: PreparationOutput) => void;
  }[] = [
    {
      name: 'missing attachment disposition',
      mutate: (_input, output): void => {
        output.attachments.pop();
      },
    },
    {
      name: 'duplicate attachment disposition',
      mutate: (_input, output): void => {
        output.attachments.push(first(output.attachments));
      },
    },
    {
      name: 'unknown attachment requirement',
      mutate: (_input, output): void => {
        first(output.attachments).requirementId = 'other';
      },
    },
    {
      name: 'missing protected handoff',
      mutate: (_input, output): void => {
        output.protectedActions.pop();
      },
    },
    {
      name: 'wrong-record answer',
      mutate: (_input, output): void => {
        first(output.answers).factIds = ['degree-one-degree'];
      },
    },
    {
      name: 'wrong-record evidence',
      mutate: (_input, output): void => {
        first(output.answers).evidence = [{ id: 'degree-one-source', revision: 'r1' }];
      },
    },
    {
      name: 'missing basis',
      mutate: (_input, output): void => {
        first(output.answers).basis = null;
      },
    },
    {
      name: 'promoted unknown fact',
      mutate: (input): void => {
        first(input.facts).disposition = 'unknown';
        first(input.facts).value = null;
      },
    },
    {
      name: 'proxy promoted to verification',
      mutate: (_input, output): void => {
        first(output.answers.filter((item) => item.basis === 'proxy')).basis = 'verified';
      },
    },
    {
      name: 'unsupported verification',
      mutate: (_input, output): void => {
        first(output.answers).basis = 'verified';
      },
    },
    {
      name: 'verification without facts',
      mutate: (_input, output): void => {
        first(output.answers).basis = 'verified';
        first(output.answers).factIds = [];
      },
    },
    {
      name: 'unresolved answer with basis',
      mutate: (_input, output): void => {
        first(output.answers).disposition = 'unresolved';
        first(output.answers).value = null;
        output.status = 'needs-information';
        output.humanStops.push('H-02');
      },
    },
    {
      name: 'missing exact file',
      mutate: (_input, output): void => {
        first(output.attachments).artifact = null;
      },
    },
    {
      name: 'changed exact file',
      mutate: (_input, output): void => {
        const ref = first(output.attachments).artifact;
        if (ref) ref.digest = `sha256:${'f'.repeat(64)}`;
      },
    },
    {
      name: 'wrong attachment scope',
      mutate: (input): void => {
        first(input.attachmentRequirements).scope.subjectId = 'practice-alpha';
        first(input.attachmentRequirements).scope.recordId = null;
      },
    },
    {
      name: 'wrong media type',
      mutate: (input): void => {
        first(input.attachmentRequirements).acceptedMediaTypes = ['image/png'];
      },
    },
    {
      name: 'unresolved attachment selecting file',
      mutate: (_input, output): void => {
        first(output.attachments).disposition = 'unresolved';
      },
    },
    {
      name: 'converted source becomes expired',
      mutate: (input): void => {
        first(input.evidence.filter((item) => item.id === 'license-image-source')).validity =
          'expired';
      },
    },
    {
      name: 'converted source becomes unavailable',
      mutate: (input): void => {
        const item = first(input.evidence.filter((entry) => entry.id === 'license-image-source'));
        item.retrieval = 'awaiting-file';
        item.content = null;
      },
    },
    {
      name: 'unknown protected routing claimed ready',
      mutate: (_input, output): void => {
        first(output.protectedActions).disposition = 'unresolved';
        output.humanStops.push('H-02');
      },
    },
    {
      name: 'unknown protected routing without exception stop',
      mutate: (_input, output): void => {
        first(output.protectedActions).disposition = 'unresolved';
        output.status = 'needs-information';
      },
    },
  ];
  it.each(mutations)('rejects $name', ({ mutate }) => {
    const input = loadPreparationScenario('ga-preparation');
    const output = proposal();
    mutate(input, output);
    expect(validateProposal(input, output).length).toBeGreaterThan(0);
    expect(() => reviewFingerprint(input, output)).toThrow();
  });
  it('accepts an explicit incomplete handoff without pretending files or signers are ready', () => {
    const input = loadPreparationScenario('ga-preparation');
    const output = proposal();
    output.status = 'needs-information';
    output.humanStops.push('H-02');
    first(output.attachments).disposition = 'unresolved';
    first(output.attachments).artifact = null;
    first(output.protectedActions).disposition = 'unresolved';
    first(output.answers).disposition = 'unresolved';
    first(output.answers).value = null;
    first(output.answers).basis = null;
    expect(validateProposal(input, output)).toEqual([]);
  });
  it('retains operator-selected provenance and only allows verified basis on verified facts', () => {
    const input = loadPreparationScenario('ga-preparation');
    const output = proposal();
    first(input.facts).disposition = 'operator-selected';
    first(input.facts).qualification =
      'Invented selection from multiple documented contact options.';
    expect(validateProposal(input, output).join(' ')).toContain('promoted to certainty');
    first(output.answers).basis = 'operator-selected';
    expect(validateProposal(input, output)).toEqual([]);
    first(input.facts).disposition = 'verified';
    first(output.answers).basis = 'verified';
    expect(validateProposal(input, output)).toEqual([]);
  });
});
