import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DocumentContent } from './read-document.js';

const extensions = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/tiff', '.tiff'],
  ['application/pdf', '.pdf'],
  ['application/json', '.json'],
  ['text/plain', '.txt'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/vnd.ms-excel.sheet.macroEnabled.12', '.xlsm'],
]);

export interface MaterializedDocument {
  path: string;
  mimeType: string;
  kind: string;
  /** Identity of THIS file's bytes, not the source document from which a page was rendered. */
  digest: string;
  byteLength: number;
}
/** Write actual evidence, not base64 console output. Never use source-controlled filenames. */
export async function materializeDocumentContent(
  content: DocumentContent[],
  directory: string
): Promise<MaterializedDocument[]> {
  const artifacts: MaterializedDocument[] = [];
  for (const [index, block] of content.entries()) {
    const mimeType = block.type === 'image' ? block.mimeType : block.resource.mimeType;
    const encoded = block.type === 'image' ? block.data : block.resource.blob;
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new Error('Invalid original-file encoding');
    const path = join(directory, `evidence-${String(index)}${extensions.get(mimeType) ?? '.bin'}`);
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    artifacts.push({
      path,
      mimeType,
      kind: block.type,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      byteLength: bytes.length,
    });
  }
  return artifacts;
}
