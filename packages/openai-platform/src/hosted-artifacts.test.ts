import OpenAI from 'openai';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { readHostedArtifactBody } from './hosted-artifact-body.js';
import { downloadHostedArtifact } from './hosted-artifacts.js';

const request = { turnId: 'turn', path: '/workspace/outputs/license.pdf', maxBytes: 100 };
const artifact = {
  id: 'artifact',
  session_id: 'session',
  turn_id: 'turn',
  path: request.path,
  size_bytes: 8,
};
function setup(
  pages: unknown[][],
  body = '%PDF-abc'
): { client: OpenAI; fetcher: Mock<typeof fetch> } {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith('/content')) return new Response(body);
    const page = url.searchParams.has('after') ? 1 : 0;
    return Response.json({ data: pages.at(page), has_more: page + 1 < pages.length });
  });
  return { client: new OpenAI({ apiKey: 'invented', fetch: fetcher, maxRetries: 0 }), fetcher };
}
describe('native hosted artifact transport', () => {
  it('returns a repairable identity error after a complete ended-turn listing lacks the requested path', async () => {
    const { client, fetcher } = setup([[{ ...artifact, id: 'old', turn_id: 'old' }], []]);
    await expect(downloadHostedArtifact(client, 'session', request)).rejects.toMatchObject({
      code: 'artifact-identity',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('paginates and selects the exact session, originating turn and output path', async () => {
    const { client, fetcher } = setup([
      [{ ...artifact, id: 'old', turn_id: 'old-turn' }],
      [artifact],
    ]);
    const value = await downloadHostedArtifact(client, 'session', request);
    expect(Buffer.from(value.bytes).toString()).toBe('%PDF-abc');
    expect(value).toMatchObject({ id: 'artifact', path: request.path, turnId: 'turn' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([
    [{ ...artifact, session_id: 'other' }],
    [artifact, artifact],
    [{ ...artifact, size_bytes: 101 }],
    [{ ...artifact, size_bytes: 0 }],
    [{ ...artifact, turn_id: 'other' }],
  ])('rejects unproven or oversized metadata without downloading content', async (...items) => {
    const { client, fetcher } = setup([items]);
    await expect(downloadHostedArtifact(client, 'session', request)).rejects.toThrow(
      /artifact|file/i
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['short', 'longer-than-eight'])('rejects a changed body size: %s', async (body) => {
    const { client } = setup([[artifact]], body);
    await expect(downloadHostedArtifact(client, 'session', request)).rejects.toThrow('unavailable');
  });
  it.each([
    '/workspace/.credentials/google.json',
    '/workspace/outputs/../private',
    '/workspace/outputs//x',
    '/workspace/outputs/x\\y',
  ])('rejects non-output/canonical paths: %s', async (path) => {
    const { client, fetcher } = setup([[artifact]]);
    await expect(downloadHostedArtifact(client, 'session', { ...request, path })).rejects.toThrow(
      'identity is invalid'
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels a stalled body after headers instead of holding the application lock indefinitely', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    const result = readHostedArtifactBody(response, 10, controller.signal);
    const assertion = expect(result).rejects.toThrow();
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
});
