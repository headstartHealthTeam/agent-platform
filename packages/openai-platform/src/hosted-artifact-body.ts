import { HostedArtifactError } from './hosted-artifact-error.js';

/** Bound actual bytes, including a body that stalls after response headers arrive. */
export async function readHostedArtifactBody(
  response: Response,
  size: number,
  signal: AbortSignal
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Artifact body unavailable');
  const cancel = (): void => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > size) throw new HostedArtifactError('artifact-capacity');
      chunks.push(part.value);
    }
    if (length !== size) throw new Error('Artifact truncated');
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
