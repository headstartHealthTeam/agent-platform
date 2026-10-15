import { readPrivateJson } from './private-run-storage.js';

/** The approved native-capture protocol bounds stdin, not already saved private files. */
export async function readCaptureInput(
  input: string,
  stream: AsyncIterable<unknown> = process.stdin
): Promise<unknown> {
  if (input !== '-') return readPrivateJson(input);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) throw new Error('Expected binary capture input');
    bytes += chunk.byteLength;
    if (bytes > 64 * 1024 * 1024) throw new Error('Capture exceeds the bounded input limit');
    chunks.push(chunk);
  }
  const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return result;
}
