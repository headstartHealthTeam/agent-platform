import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

import { toFile } from 'openai';

/** Capture and hash one reviewed artifact before dispatch, not a stream that could change
 * between approval and upload. This is deployment input, never a business-data export.
 */
export async function prepareRuntimeUpload(
  path: string,
  digest: string
): Promise<Awaited<ReturnType<typeof toFile>>> {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > 50 * 1024 * 1024)
      throw new Error('Runtime input exceeds hosted file capacity');
    const bytes = await handle.readFile();
    if (bytes.length !== info.size || createHash('sha256').update(bytes).digest('hex') !== digest)
      throw new Error('Runtime input changed since approval');
    return await toFile(bytes, `runtime-${digest}.tar.gz`, { type: 'application/gzip' });
  } finally {
    await handle.close();
  }
}
