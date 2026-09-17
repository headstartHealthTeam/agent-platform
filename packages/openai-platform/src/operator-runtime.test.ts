import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSchema } from './operations.js';
import { OperatorItems } from './operator-items.js';
import {
  OperatorRuntimePort,
  type OperatorBinding,
  type OperatorCommand,
} from './operator-runtime.js';
import { fingerprint, type OpenAIPlatform } from './platform.js';

const target = { organizationId: 'org-synthetic', projectId: 'proj_synthetic' };
const binding: OperatorBinding = {
  sessionId: 'session_a',
  turnId: 'turn_a',
  target: fingerprint(target),
  workflowRevision: 'revision_a',
};
const question = {
  type: 'function_call',
  turn_id: 'turn_a',
  call_id: 'call_a',
  name: 'ask_operator',
  arguments: { question: 'Which invented office should be used?' },
};
const reply: OperatorCommand = {
  id: 'command_a',
  kind: 'reply',
  questionId: 'call_a',
  callFingerprint: 'a'.repeat(64),
  text: 'Office B',
};

function fixture(
  options: { session?: unknown; turn?: unknown; history?: unknown; expiry?: number } = {}
): {
  platform: {
    [K in 'read' | 'apply' | 'openOperatorObservation']: ReturnType<
      typeof vi.fn<OpenAIPlatform[K]>
    >;
  };
  port: OperatorRuntimePort;
  close: ReturnType<typeof vi.fn<() => void>>;
  fail: () => void;
} {
  let rejectObservation: ((reason: Error) => void) | undefined;
  const close = vi.fn<() => void>();
  const platform = {
    read: vi.fn<OpenAIPlatform['read']>(async (input) => {
      const parsed = readSchema.parse(input);
      const data =
        parsed.operation === 'sessions.get'
          ? (options.session ?? {
              id: 'session_a',
              metadata: { workflow_revision: 'revision_a' },
              required_actions: [question],
            })
          : parsed.operation === 'sessions.turn.get'
            ? (options.turn ?? {
                id: 'turn_a',
                session_id: 'session_a',
                subagent_id: null,
                status: 'in_progress',
              })
            : (options.history ?? { data: [], has_more: false });
      return { data, fingerprint: fingerprint(data) };
    }),
    apply: vi
      .fn<OpenAIPlatform['apply']>()
      .mockResolvedValue({ data: {}, fingerprint: fingerprint({}) }),
    openOperatorObservation: vi.fn<OpenAIPlatform['openOperatorObservation']>(async () => ({
      items: new OperatorItems('session_a', 'turn_a'),
      close,
      completion: new Promise<void>((_resolve, reject) => {
        rejectObservation = reject;
      }),
    })),
  };
  const port = new OperatorRuntimePort(platform, target, options.expiry);
  return {
    platform,
    port,
    close,
    fail: (): void => {
      rejectObservation?.(new Error('Synthetic disconnect'));
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('operator runtime adapter', () => {
  it('coalesces observations, recovers pending questions and does not derive pending work from history', async () => {
    const f = fixture();
    try {
      const [a, b] = await Promise.all([f.port.snapshot(binding), f.port.snapshot(binding)]);
      expect(a).toEqual(b);
      expect(a).toMatchObject({
        status: 'waiting',
        pendingQuestionIds: ['call_a'],
        items: [{ text: question.arguments.question, kind: 'question', final: true }],
      });
      expect(a.items[0]?.callFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(f.platform.openOperatorObservation).toHaveBeenCalledTimes(1);
      f.fail();
      await Promise.resolve();
      await f.port.snapshot(binding);
      expect(f.platform.openOperatorObservation).toHaveBeenCalledTimes(2);
      await expect(f.port.snapshot({ ...binding, turnId: 'turn_b' })).rejects.toThrow(
        'binding changed'
      );
    } finally {
      f.port.close();
    }
  });
  it.each(['completed', 'cancelled', 'failed', 'in_progress'] as const)(
    'uses authoritative root status %s',
    async (status) => {
      const f = fixture({
        session: {
          id: 'session_a',
          metadata: { workflow_revision: 'revision_a' },
          required_actions: [],
        },
        turn: { id: 'turn_a', session_id: 'session_a', subagent_id: null, status },
      });
      try {
        expect((await f.port.snapshot(binding)).status).toBe(
          status === 'in_progress' ? 'running' : status
        );
      } finally {
        f.port.close();
      }
    }
  );
  it.each([
    {
      session: { id: 'wrong', metadata: { workflow_revision: 'revision_a' }, required_actions: [] },
    },
    { session: { id: 'session_a', metadata: {}, required_actions: [] } },
    {
      session: {
        id: 'session_a',
        metadata: { workflow_revision: 'revision_a' },
        required_actions: [{ ...question, name: 'write_business_data' }],
      },
    },
    {
      session: {
        id: 'session_a',
        metadata: { workflow_revision: 'revision_a' },
        required_actions: [{ ...question, arguments: { invented: true } }],
      },
    },
    { turn: { id: 'wrong', session_id: 'session_a', subagent_id: null, status: 'in_progress' } },
    { history: { data: [], has_more: true } },
  ])('fails closed for changed or unsupported run content', async (options) => {
    const f = fixture(options);
    try {
      await expect(f.port.snapshot(binding)).rejects.toThrow();
      expect(f.platform.apply).not.toHaveBeenCalled();
    } finally {
      f.port.close();
    }
  });
  it('guards writes by target, provenance and bounded billing authorization', async () => {
    const f = fixture();
    await expect(f.port.snapshot({ ...binding, target: 'wrong' })).rejects.toThrow('target');
    await expect(f.port.send({ ...binding, target: 'wrong' }, reply)).rejects.toThrow('target');
    await expect(f.port.send(binding, reply)).rejects.toThrow('authorization');
    await expect(f.port.send(binding, { ...reply, kind: 'guidance' })).rejects.toThrow(
      'dispatch contract'
    );
    await expect(f.port.send({ ...binding, workflowRevision: 'wrong' }, reply)).rejects.toThrow(
      'provenance'
    );
    expect(f.platform.apply).not.toHaveBeenCalled();
    await f.port.send(binding, { ...reply, kind: 'stop' });
    expect(f.platform.apply).toHaveBeenLastCalledWith(
      { operation: 'sessions.cancel', id: 'session_a' },
      expect.objectContaining({ allowBillable: false })
    );
    const allowed = fixture({ expiry: Date.now() + 1000 });
    await allowed.port.send(binding, reply);
    expect(allowed.platform.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'sessions.tool-result',
        turnId: 'turn_a',
        callId: 'call_a',
        expectedCallFingerprint: reply.callFingerprint,
      }),
      expect.objectContaining({ allowBillable: true })
    );
    await expect(allowed.port.send(binding, { ...reply, questionId: null })).rejects.toThrow(
      'authorization'
    );
  });
  it('closes idle observations without sending cancellation', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.port.snapshot(binding);
    await vi.advanceTimersByTimeAsync(45001);
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.platform.apply).not.toHaveBeenCalled();
    f.port.close();
  });
  it('closes an observation that finishes opening after shutdown and refuses further work', async () => {
    const f = fixture();
    let release: (() => void) | undefined;
    const opening = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.platform.openOperatorObservation.mockImplementation(async () => {
      await opening;
      return {
        items: new OperatorItems('session_a', 'turn_a'),
        close: f.close,
        completion: new Promise<void>(() => {
          // The synthetic observer remains open until its separate close callback is invoked.
        }),
      };
    });
    const result = f.port.snapshot(binding);
    f.port.close();
    const rejected = expect(result).rejects.toThrow('closed');
    release?.();
    await rejected;
    expect(f.close).toHaveBeenCalledOnce();
    await expect(f.port.snapshot(binding)).rejects.toThrow('closed');
    await expect(f.port.send(binding, reply)).rejects.toThrow('closed');
    expect(f.platform.read).not.toHaveBeenCalled();
    expect(f.platform.apply).not.toHaveBeenCalled();
  });
  it('counts concurrent stream openings against its observation capacity', async () => {
    const f = fixture();
    let release: (() => void) | undefined;
    const opening = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.platform.openOperatorObservation.mockImplementation(async () => {
      await opening;
      throw new Error('Synthetic opening failure');
    });
    const openings = Array.from({ length: 20 }, (_, index) =>
      f.port.snapshot({ ...binding, sessionId: `session_${String(index)}` })
    );
    const settled = Promise.allSettled(openings);
    await expect(f.port.snapshot(binding)).rejects.toThrow('capacity');
    expect(f.platform.openOperatorObservation).toHaveBeenCalledTimes(20);
    release?.();
    await settled;
    f.port.close();
  });
});
