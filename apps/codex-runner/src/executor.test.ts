import type { ThreadEvent } from '@openai/codex-sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  type CodexClient,
  CodexSdkExecutor,
  type CodexThreadClient,
  type CodexTurnRequest,
} from './executor.js';

const SYNTHETIC_PATH = '/synthetic/bin';
const SYNTHETIC_THREAD_ID = 'synthetic-thread';
const SYNTHETIC_RESPONSE = '{"summary":"Synthetic"}';

const makeRequest = (): CodexTurnRequest => ({
  prompt: 'Return a synthetic result.',
  outputSchema: {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false,
  },
  workingDirectory: '/synthetic/workspace',
  model: 'configured-at-deployment',
  reasoningEffort: 'high',
  sandbox: 'read-only',
  networkAccess: 'disabled',
  timeoutSeconds: 30,
  emitEvents: true,
});

const streamEvents = async function* (events: ThreadEvent[]): AsyncGenerator<ThreadEvent> {
  for (const event of events) {
    yield event;
  }
};

const successEvents: ThreadEvent[] = [
  { type: 'thread.started', thread_id: SYNTHETIC_THREAD_ID },
  { type: 'turn.started' },
  {
    type: 'item.completed',
    item: { id: 'message-1', type: 'agent_message', text: SYNTHETIC_RESPONSE },
  },
  {
    type: 'turn.completed',
    usage: {
      input_tokens: 10,
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: 5,
      reasoning_output_tokens: 1,
    },
  },
];

describe('CodexSdkExecutor', () => {
  it('passes the managed policy to Codex and emits structured events', async () => {
    const runStreamed = vi
      .fn<CodexThreadClient['runStreamed']>()
      .mockResolvedValue({ events: streamEvents(successEvents) });
    const startThread = vi.fn<CodexClient['startThread']>().mockReturnValue({ runStreamed });
    const emit = vi.fn().mockResolvedValue(undefined);
    const executor = new CodexSdkExecutor({
      environment: { PATH: SYNTHETIC_PATH },
      eventSink: { emit },
      client: { startThread },
    });

    const result = await executor.execute(makeRequest());

    expect(startThread).toHaveBeenCalledWith({
      workingDirectory: '/synthetic/workspace',
      model: 'configured-at-deployment',
      modelReasoningEffort: 'high',
      sandboxMode: 'read-only',
      networkAccessEnabled: false,
      approvalPolicy: 'never',
    });
    expect(runStreamed).toHaveBeenCalledOnce();
    const [prompt, options] = runStreamed.mock.calls[0] ?? [];
    expect(prompt).toBe('Return a synthetic result.');
    expect(options?.outputSchema).toEqual(makeRequest().outputSchema);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(emit).toHaveBeenCalledTimes(successEvents.length);
    expect(result).toMatchObject({
      threadId: SYNTHETIC_THREAD_ID,
      finalResponse: SYNTHETIC_RESPONSE,
    });
  });

  it('fails when Codex reports a terminal turn error', async () => {
    const events: ThreadEvent[] = [
      { type: 'thread.started', thread_id: SYNTHETIC_THREAD_ID },
      { type: 'turn.failed', error: { message: 'Synthetic execution failure' } },
    ];
    const runStreamed = vi
      .fn<CodexThreadClient['runStreamed']>()
      .mockResolvedValue({ events: streamEvents(events) });
    const startThread = vi.fn<CodexClient['startThread']>().mockReturnValue({ runStreamed });
    const executor = new CodexSdkExecutor({
      environment: { PATH: SYNTHETIC_PATH },
      client: { startThread },
    });

    await expect(executor.execute(makeRequest())).rejects.toThrow('Synthetic execution failure');
  });

  it('fails closed when the event stream has no final response', async () => {
    const events: ThreadEvent[] = [{ type: 'thread.started', thread_id: SYNTHETIC_THREAD_ID }];
    const runStreamed = vi
      .fn<CodexThreadClient['runStreamed']>()
      .mockResolvedValue({ events: streamEvents(events) });
    const startThread = vi.fn<CodexClient['startThread']>().mockReturnValue({ runStreamed });
    const executor = new CodexSdkExecutor({
      environment: { PATH: SYNTHETIC_PATH },
      client: { startThread },
    });

    await expect(executor.execute(makeRequest())).rejects.toThrow(/without a thread identifier/);
  });
});
