import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateReviewArtifacts } from './artifact-validation.js';
import {
  credentialingArtifactInputSchema,
  preparationOutputSchema,
  productionReadInputSchema,
  type ProductionReadInput,
  type PreparationOutput,
} from './preparation-contracts.js';
import { validateProposal } from './review.js';
import { createSyntheticTools, loadPreparationScenario } from './synthetic-tools.js';

// Invented fixtures exercise the live-data contract; no production records or access are used.
const input = (): ProductionReadInput =>
  productionReadInputSchema.parse({
    ...loadPreparationScenario('ga-preparation'),
    schemaVersion: '0.3.0',
    dataMode: 'production-read',
  });
const proposal = (): PreparationOutput =>
  preparationOutputSchema.parse(
    JSON.parse(
      fs.readFileSync(
        new URL('../fixtures/preparation/ga-preparation.output.json', import.meta.url),
        'utf8'
      )
    )
  );

describe('read-only production preparation contract', () => {
  it('reuses the rich preparation validation and exact artifact handoff', () => {
    const snapshot = input();
    const output = proposal();
    expect(credentialingArtifactInputSchema.parse(snapshot)).toEqual(snapshot);
    expect(validateProposal(snapshot, output)).toEqual([]);
    expect(
      validateReviewArtifacts({
        inputJson: JSON.stringify(snapshot),
        proposalJson: JSON.stringify(output),
      })
    ).toMatchObject({
      dataMode: 'production-read',
      inputSchemaVersion: '0.3.0',
      proposalSchemaVersion: '0.3.0',
      readiness: 'prepared-for-review',
    });
  });

  it('cannot be read through synthetic tools or relabeled as a legacy input', () => {
    expect(() => createSyntheticTools(input())).toThrow();
    expect(
      credentialingArtifactInputSchema.safeParse({ ...input(), schemaVersion: '0.2.0' }).success
    ).toBe(false);
    expect(
      credentialingArtifactInputSchema.safeParse({ ...input(), dataMode: 'synthetic' }).success
    ).toBe(false);
  });

  it('preserves scope checks, human stops, and stopped execution', () => {
    const scoped = input();
    const artifact = scoped.artifacts.at(0);
    if (!artifact) throw new Error('Missing test artifact');
    artifact.scope.subjectId = 'unrelated-subject';
    expect(validateProposal(scoped, proposal()).length).toBeGreaterThan(0);
    expect(validateProposal(input(), { ...proposal(), humanStops: [] }).length).toBeGreaterThan(0);
    const stopped = input();
    stopped.execution.stopRequested = true;
    expect(validateProposal(stopped, proposal()).length).toBeGreaterThan(0);
  });
});
