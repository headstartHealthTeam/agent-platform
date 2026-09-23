import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256Json } from './json-fingerprint.js';
import { filesystemCode } from './private-run-storage.js';

async function optionalNoteArtifact(file: string): Promise<unknown> {
  try {
    const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    return value;
  } catch (error) {
    if (filesystemCode(error, 'ENOENT')) return null;
    throw error;
  }
}
export async function verifyNoteAdjudicationArtifacts(
  runDirectory: string,
  manifest: {
    readonly noteAdjudications?: {
      readonly inputHash: string;
      readonly receiptsHash: string;
      readonly accepted: number;
    } | null;
  }
): Promise<true> {
  const artifact = await optionalNoteArtifact(path.join(runDirectory, 'note_adjudications.json'));
  const binding = manifest.noteAdjudications;
  const hasArtifact = Boolean(artifact);
  if (!binding && !hasArtifact) return true;
  const receipts = await optionalNoteArtifact(
    path.join(runDirectory, 'note_adjudication_receipts.json')
  );
  if (!binding)
    throw new Error('Note adjudication inputs changed after build; rebuild before validation');
  if (
    sha256Json(artifact) !== binding.inputHash ||
    !Array.isArray(receipts) ||
    sha256Json(receipts) !== binding.receiptsHash ||
    receipts.length !== binding.accepted
  )
    throw new Error('Note adjudication inputs changed after build; rebuild before validation');
  return true;
}
