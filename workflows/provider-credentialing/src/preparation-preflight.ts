import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  artifactByteLimit,
  artifactValidationReply,
  type ArtifactValidationReply,
} from './artifact-validation.js';

const readArtifact = (path: string): string => {
  const descriptor = openSync(path, 'r');
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error('Expected regular file');
    const bytes = Buffer.alloc(artifactByteLimit + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(descriptor, bytes, size, bytes.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size > artifactByteLimit) throw new Error('Artifact exceeds limit');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
  } finally {
    closeSync(descriptor);
  }
};

/** Local, read-only semantic preflight. Application publication independently revalidates. */
export const runPreparationPreflight = (args: string[]): ArtifactValidationReply => {
  try {
    const { values } = parseArgs({
      args,
      options: { input: { type: 'string' }, proposal: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    if (!values.input || !values.proposal) throw new Error('Missing artifacts');
    return artifactValidationReply({
      inputJson: readArtifact(values.input),
      proposalJson: readArtifact(values.proposal),
    });
  } catch {
    return {
      ok: false,
      code: 'invalid-artifacts',
      issues: [
        'Provide --input <snapshot.json> --proposal <proposal.json>; both must be readable UTF-8 JSON files at most 1 MiB each. No package was queued or published.',
      ],
    };
  }
};
