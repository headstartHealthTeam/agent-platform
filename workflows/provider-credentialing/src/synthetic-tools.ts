import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { credentialingInputSchema, type CredentialingInput } from './contracts.js';
import { validateSnapshot } from './snapshot.js';

export const scenarioIds = [
  'ga-initial',
  'tx-group-add',
  'late-conflicting-files',
  'uncertain-save',
  'approval-not-billing',
] as const;

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
  readCase: () => Omit<CredentialingInput, 'evidence'>;
  listEvidence: () => Omit<CredentialingInput['evidence'][number], 'content'>[];
  readEvidence: (id: string) => CredentialingInput['evidence'][number];
} => {
  const input = credentialingInputSchema.parse(inputValue);
  const issues = validateSnapshot(input);
  if (issues.length > 0) {
    throw new Error(issues.join(' '));
  }
  if (input.execution.stopRequested || !input.execution.permittedActions.includes('inspect')) {
    throw new Error('Synthetic inspection is not permitted or has been stopped.');
  }
  return {
    readCase: (): Omit<CredentialingInput, 'evidence'> => {
      const snapshot = {
        schemaVersion: input.schemaVersion,
        dataMode: input.dataMode,
        caseRevision: input.caseRevision,
        workflowRevision: input.workflowRevision,
        routeRevision: input.routeRevision,
        work: input.work,
        facts: input.facts,
        requirements: input.requirements,
        recordedMilestones: input.recordedMilestones,
        execution: input.execution,
      };
      return structuredClone(snapshot);
    },
    listEvidence: (): Omit<CredentialingInput['evidence'][number], 'content'>[] =>
      input.evidence.map(({ content: _content, ...item }) => structuredClone(item)),
    readEvidence: (id): CredentialingInput['evidence'][number] => {
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
  const tools = createSyntheticTools(loadScenario(scenario));
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
