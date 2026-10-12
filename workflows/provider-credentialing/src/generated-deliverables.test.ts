import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { artifactValidationReply, type ArtifactValidationReply } from './artifact-validation.js';
import {
  preparationInputSchema,
  preparationOutputSchema,
  type PreparationInput,
  type PreparationOutput,
} from './preparation-contracts.js';

const fixture = (): { input: PreparationInput; output: PreparationOutput } => {
  const read = (kind: string): unknown =>
    JSON.parse(
      readFileSync(
        new URL(`../fixtures/preparation/historical-preparation.${kind}.json`, import.meta.url),
        'utf8'
      )
    );
  const input = preparationInputSchema.parse(read('input'));
  const output = preparationOutputSchema.parse(read('output'));
  output.deliverables = [
    {
      id: 'review-checklist',
      revision: '1',
      digest: `sha256:${'a'.repeat(64)}`,
      mediaType: 'text/markdown',
      title: 'Review and collection checklist',
      filename: 'review-checklist.md',
      purpose: 'review-checklist',
      sources: input.artifacts.map(({ id, revision, digest }) => ({ id, revision, digest })),
    },
  ];
  return { input, output };
};
const validate = ({ input, output }: ReturnType<typeof fixture>): ArtifactValidationReply =>
  artifactValidationReply({
    inputJson: JSON.stringify(input),
    proposalJson: JSON.stringify(output),
  });

describe('generated review deliverables', () => {
  it('accepts a cross-subject review aid without turning it into source evidence, an attachment or readiness', () => {
    const packet = fixture();
    expect(validate(packet)).toMatchObject({ ok: true, value: { readiness: 'needs-information' } });
    expect(packet.input.artifacts.some((file) => file.id === 'review-checklist')).toBe(false);
    expect(packet.output.attachments.some((file) => file.artifact?.id === 'review-checklist')).toBe(
      false
    );
  });
  it('keeps historical packages without generated files valid', () => {
    const packet = fixture();
    delete packet.output.deliverables;
    expect(validate(packet).ok).toBe(true);
  });
  it.each([
    'source-identity',
    'duplicate-id',
    'duplicate-filename',
    'unknown-source',
    'stale-source',
    'duplicate-source',
    'generated-as-source',
    'generated-as-payer-attachment',
  ])('rejects %s', (condition) => {
    const packet = fixture();
    const file = packet.output.deliverables?.[0];
    const source = packet.input.artifacts[0];
    const parent = file?.sources[0];
    const attachment = packet.output.attachments[0];
    if (!file || !source || !parent || !attachment) throw new Error('Missing synthetic fixture');
    if (condition === 'source-identity') file.id = source.id;
    if (condition === 'duplicate-id')
      packet.output.deliverables?.push({ ...file, filename: 'second.md' });
    if (condition === 'duplicate-filename')
      packet.output.deliverables?.push({ ...file, id: 'other' });
    if (condition === 'unknown-source') parent.id = 'missing';
    if (condition === 'stale-source') parent.digest = `sha256:${'0'.repeat(64)}`;
    if (condition === 'duplicate-source') file.sources.push(parent);
    if (condition === 'generated-as-source')
      file.sources.push({ id: file.id, revision: file.revision, digest: file.digest });
    if (condition === 'generated-as-payer-attachment') {
      attachment.disposition = 'proposed';
      attachment.artifact = { id: file.id, revision: file.revision, digest: file.digest };
    }
    expect(validate(packet).ok).toBe(false);
  });
  it.each([
    '../private.md',
    '/workspace/outputs/checklist.md',
    'folder\\file.md',
    'bad\nheader.md',
    '.',
    '..',
  ])('rejects unsafe download filename %s', (filename) => {
    const packet = fixture();
    const file = packet.output.deliverables?.[0];
    if (!file) throw new Error('Missing synthetic fixture');
    file.filename = filename;
    expect(validate(packet).ok).toBe(false);
  });
});
