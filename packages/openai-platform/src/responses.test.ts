import { describe, expect, it, vi } from 'vitest';

import {
  StructuredResponseError,
  createStructuredResponsesClient,
  type StructuredResponseRequest,
} from './responses.js';

const request: StructuredResponseRequest = {
  model: 'gpt-5.6-sol',
  instructions: 'Synthetic preflight only.',
  input: JSON.stringify({ synthetic: true }),
  schema: {
    type: 'object',
    properties: { findings: { type: 'array', items: { type: 'string' } } },
    required: ['findings'],
    additionalProperties: false,
  },
  schemaName: 'synthetic_findings',
  reasoningEffort: 'low',
};
const output = JSON.stringify({ findings: [] });

describe('isolated structured Responses client', () => {
  it('preserves the structured non-storing contract with explicit credentials and model', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ id: 'resp_synthetic', output_text: output })
    );
    const client = createStructuredResponsesClient({ apiKey: 'synthetic-test-key', fetchImpl });
    const signal = new AbortController().signal;
    expect(await client({ ...request, signal })).toEqual({
      data: { findings: [] },
      usage: null,
      responseId: 'resp_synthetic',
      model: request.model,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.openai.com/v1/responses', {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { Authorization: 'Bearer synthetic-test-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        store: false,
        instructions: request.instructions,
        input: request.input,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      }),
    });
  });

  it('supports output content blocks and returns usage/model metadata without importing lifecycle policy', async () => {
    const client = createStructuredResponsesClient({
      apiKey: 'synthetic-test-key',
      fetchImpl: async () =>
        Response.json({
          output_text: '',
          output: [
            {},
            {
              content: [
                { type: 'reasoning' },
                { type: 'output_text', text: '{"findings":' },
                { type: 'output_text', text: '[]}' },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 2 },
          model: 'reported-model',
        }),
    });
    expect(await client(request)).toEqual({
      data: { findings: [] },
      responseId: null,
      usage: { input_tokens: 1, output_tokens: 2 },
      model: 'reported-model',
    });
  });

  it('reports safe HTTP failures and cooldowns without retrying or leaking payloads', async () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    for (const [header, delay] of [
      ['2.5', 2500],
      ['Thu, 01 Jan 2026 00:00:03 GMT', 3000],
      ['bad', 0],
      ['Wed, 31 Dec 2025 00:00:00 GMT', 0],
    ] as const) {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { message: 'private provider payload' } },
          { status: 429, headers: { 'Retry-After': header } }
        )
      );
      const client = createStructuredResponsesClient({
        apiKey: 'synthetic-test-key',
        fetchImpl,
        now: () => now,
      });
      await expect(client(request)).rejects.toMatchObject({
        status: 429,
        retryAfterMs: delay,
        message: 'OpenAI structured request failed (HTTP 429).',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
    const denied = createStructuredResponsesClient({
      apiKey: 'synthetic-test-key',
      fetchImpl: async () => new Response('private', { status: 401 }),
    });
    await expect(denied(request)).rejects.toMatchObject({ status: 401, retryAfterMs: 0 });
  });

  it('rejects missing credentials and malformed requests/results without raw data in errors', async () => {
    expect(() => createStructuredResponsesClient({ apiKey: '' })).toThrow(
      'explicit OpenAI credential'
    );
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ output_text: output }));
    const client = createStructuredResponsesClient({ apiKey: 'synthetic-test-key', fetchImpl });
    await expect(client({ ...request, model: '' })).rejects.toThrow(
      'structured request is invalid'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const input of [{ synthetic: true }, true, 1, null, []]) {
      // Exercise the runtime/JavaScript boundary without asserting an invalid typed request.
      const pending: unknown = Reflect.apply(client, undefined, [{ ...request, input }]);
      await expect(pending).rejects.toThrow('structured request is invalid');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    const invalidResults: readonly unknown[] = [
      null,
      {},
      { output_text: 'private invalid JSON' },
      { output_text: 123 },
      { output: [{ content: [{ type: 'output_text' }] }] },
    ];
    for (const payload of invalidResults) {
      const bad = createStructuredResponsesClient({
        apiKey: 'synthetic-test-key',
        fetchImpl: async () => Response.json(payload),
      });
      await expect(bad(request)).rejects.toThrow(StructuredResponseError);
      await expect(bad(request)).rejects.not.toThrow(/private/);
    }
    const network = createStructuredResponsesClient({
      apiKey: 'synthetic-test-key',
      fetchImpl: async () => {
        throw new Error('private transport');
      },
    });
    await expect(network(request)).rejects.toThrow('failed before a response');
    const malformed = createStructuredResponsesClient({
      apiKey: 'synthetic-test-key',
      fetchImpl: async () => new Response('not JSON'),
    });
    await expect(malformed(request)).rejects.toThrow('envelope is invalid');
  });

  it('uses the normal fetch dependency only when explicitly configured with a key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ output_text: output }));
    vi.stubGlobal('fetch', fetchImpl);
    try {
      await createStructuredResponsesClient({ apiKey: 'synthetic-test-key' })(request);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
