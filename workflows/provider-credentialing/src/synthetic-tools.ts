import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { credentialingInputSchema, type CredentialingInput } from './contracts.js';
import {
  syntheticArtifactInputSchema,
  preparationInputSchema,
  type ArtifactInput,
  type PreparationInput,
  type SyntheticArtifactInput,
} from './preparation-contracts.js';
import { validateSnapshot } from './snapshot.js';

export const scenarioIds = [
  'ga-initial',
  'tx-group-add',
  'late-conflicting-files',
  'uncertain-save',
  'approval-not-billing',
] as const;

export const preparationScenarioIds = ['ga-preparation', 'tx-preparation'] as const;

export const loadPreparationScenario = (id: string): PreparationInput => {
  if (!preparationScenarioIds.some((candidate) => candidate === id))
    throw new Error('Unknown synthetic preparation scenario.');
  const filename = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/preparation',
    `${id}.input.json`
  );
  return preparationInputSchema.parse(JSON.parse(fs.readFileSync(filename, 'utf8')));
};

type CaseSnapshot = Omit<CredentialingInput, 'evidence'> | Omit<PreparationInput, 'evidence'>;
const caseProjection = ({
  evidence: _evidence,
  ...snapshot
}: SyntheticArtifactInput): CaseSnapshot => snapshot;

export const loadScenario = (id: string): CredentialingInput => {
  if (!scenarioIds.some((candidate) => candidate === id)) {
    throw new Error('Unknown synthetic scenario.');
  }
  const filename = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../fixtures/cases',
    `${id}.json`
  );
  const value: unknown = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return credentialingInputSchema.parse(value);
};

export const createSyntheticTools = (
  inputValue: unknown
): {
  readCase: () => CaseSnapshot;
  listEvidence: () => Omit<ArtifactInput['evidence'][number], 'content'>[];
  readEvidence: (id: string) => ArtifactInput['evidence'][number];
} => {
  const input = syntheticArtifactInputSchema.parse(inputValue);
  const issues = validateSnapshot(input);
  if (issues.length > 0) {
    throw new Error(issues.join(' '));
  }
  if (input.execution.stopRequested || !input.execution.permittedActions.includes('inspect')) {
    throw new Error('Synthetic inspection is not permitted or has been stopped.');
  }
  return {
    readCase: (): CaseSnapshot => structuredClone(caseProjection(input)),
    listEvidence: (): Omit<ArtifactInput['evidence'][number], 'content'>[] =>
      input.evidence.map(({ content: _content, ...item }) => structuredClone(item)),
    readEvidence: (id): ArtifactInput['evidence'][number] => {
      const item = input.evidence.find((candidate) => candidate.id === id);
      if (!item) {
        throw new Error('Evidence is outside this synthetic case.');
      }
      return structuredClone(item);
    },
  };
};

export const runSyntheticCommand = (args: string[]): unknown => {
  const [scenario, command, evidenceId] = args;
  if (!scenario || !command || args.length > 3) {
    throw new Error('Usage: <scenario> case|list-evidence|read-evidence [evidence-id]');
  }
  const input = preparationScenarioIds.some((id) => id === scenario)
    ? loadPreparationScenario(scenario)
    : loadScenario(scenario);
  const tools = createSyntheticTools(input);
  if (command === 'case' && !evidenceId) {
    return tools.readCase();
  }
  if (command === 'list-evidence' && !evidenceId) {
    return tools.listEvidence();
  }
  if (command === 'read-evidence' && evidenceId) {
    return tools.readEvidence(evidenceId);
  }
  throw new Error('Unsupported synthetic operation. No external tools are available.');
};
