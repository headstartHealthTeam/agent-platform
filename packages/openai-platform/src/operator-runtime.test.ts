import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSchema } from './operations.js';
import { OperatorItems } from './operator-items.js';
import {
  OperatorRuntimePort,
  type OperatorBinding,
  type OperatorCommand,
} from './operator-runtime.js';
import { fingerprint, type OpenAIPlatform, InputNotSteerableError } from './platform.js';

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
  options: {
    session?: unknown;
    turn?: unknown;
    turns?: unknown[];
    history?: unknown;
    expiry?: number;
    applicationFunctions?: string[];
  } = {}
): {
  platform: {
    [K in 'read' | 'apply' | 'preflight' | 'openOperatorObservation']: ReturnType<
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
    preflight: vi.fn<OpenAIPlatform['preflight']>(),
    read: vi.fn<OpenAIPlatform['read']>(async (input) => {
      const parsed = readSchema.parse(input);
      if (parsed.operation === 'sessions.turns' && parsed.query.after && options.turns) {
        const index = options.turns.findIndex(
          (turn) =>
            typeof turn === 'object' &&
            turn !== null &&
            'id' in turn &&
            turn.id === parsed.query.after
        );
        const data = { data: options.turns.slice(index + 1), has_more: false };
        return { data, fingerprint: fingerprint(data) };
      }
      const data =
        parsed.operation === 'sessions.get'
          ? (options.session ?? {
              id: 'session_a',
              metadata: { workflow_revision: 'revision_a' },
              required_actions: [question],
            })
          : parsed.operation === 'sessions.turns'
            ? {
                data: options.turns ?? [
                  options.turn ?? {
                    id: 'turn_a',
                    session_id: 'session_a',
                    subagent_id: null,
                    status: 'in_progress',
                  },
                ],
                has_more: false,
              }
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
  const port = new OperatorRuntimePort(
    platform,
    target,
    options.expiry,
    options.applicationFunctions
  );
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
  it.each(['failed', 'cancelled', 'completed'])(
    'explicitly continues the exact %s root in the same session',
    async (status) => {
      const roots = [{ id: 'turn_a', session_id: 'session_a', subagent_id: null, status }];
      const f = fixture({ expiry: Date.now() + 60_000, turns: roots });
      const command: OperatorCommand = {
        id: 'continuation_a',
        kind: 'continue',
        expectedTurnId: 'turn_a',
        questionId: null,
        callFingerprint: null,
        text: 'Continue the investigation.',
      };
      try {
        await expect(f.port.send(binding, { ...command, expectedTurnId: 'wrong' })).rejects.toThrow(
          'exact ended turn'
        );
        f.platform.apply.mockRejectedValueOnce(new Error('Lost response'));
        await expect(f.port.send(binding, command)).rejects.toThrow('Lost response');
        roots.push({
          id: 'turn_b',
          session_id: 'session_a',
          subagent_id: null,
          status: 'in_progress',
        });
        await f.port.recover(binding, command);
        expect(f.platform.apply.mock.calls[1]).toEqual(f.platform.apply.mock.calls[0]);
        expect(f.platform.apply.mock.calls[1]?.[0]).toMatchObject({
          operation: 'sessions.send',
          id: binding.sessionId,
          input: command.text,
          idempotencyKey: command.id,
        });
        await expect(
          f.port.send(binding, { ...command, id: 'new', expectedTurnId: 'turn_b' })
        ).rejects.toThrow('exact ended turn');
      } finally {
        f.port.close();
      }
    }
  );
  it('does not turn a present refusal into proof that an earlier message was never delivered', async () => {
    const f = fixture({ expiry: Date.now() + 60_000 });
    try {
      f.platform.apply.mockRejectedValue(new InputNotSteerableError());
      await expect(
        f.port.recover(binding, {
          ...reply,
          kind: 'guidance',
          questionId: null,
          callFingerprint: null,
        })
      ).rejects.toThrow('Earlier delivery remains unconfirmed');
    } finally {
      f.port.close();
    }
  });
  it('recovers a lost message acknowledgement using the original key and unchanged payload', async () => {
    const f = fixture({ expiry: Date.now() + 60_000 });
    const command: OperatorCommand = {
      ...reply,
      kind: 'guidance',
      questionId: null,
      callFingerprint: null,
    };
    try {
      f.platform.apply.mockRejectedValueOnce(new Error('Lost response'));
      await expect(f.port.send(binding, command)).rejects.toThrow('Lost response');
      await f.port.recover(binding, command);
      expect(f.platform.apply.mock.calls[1]).toEqual(f.platform.apply.mock.calls[0]);
      expect(f.platform.apply.mock.calls[1]?.[0]).toMatchObject({
        idempotencyKey: command.id,
        input: command.text,
      });
    } finally {
      f.port.close();
    }
  });
  it('recovers only an exact pending answer and reports a changed call without claiming delivery', async () => {
    const f = fixture({ expiry: Date.now() + 60_000 });
    try {
      const current = await f.port.snapshot(binding);
      const command = { ...reply, callFingerprint: current.items.at(-1)?.callFingerprint ?? '' };
      await f.port.recover(binding, command);
      expect(f.platform.apply).toHaveBeenCalledOnce();
      expect(await f.port.recover(binding, reply)).toEqual({
        status: 'superseded',
        reason: 'question_closed',
      });
      expect(f.platform.apply).toHaveBeenCalledOnce();
    } finally {
      f.port.close();
    }
  });
  it('can reconcile a closed question after inference authority expires without sending anything', async () => {
    const f = fixture({
      session: {
        id: 'session_a',
        metadata: { workflow_revision: 'revision_a' },
        required_actions: [],
      },
    });
    try {
      expect(await f.port.recover(binding, reply)).toEqual({
        status: 'superseded',
        reason: 'question_closed',
      });
      expect(f.platform.apply).not.toHaveBeenCalled();
    } finally {
      f.port.close();
    }
  });
  it('provides independent read-only history without opening an observer or granting inference', async () => {
    const f = fixture();
    expect(await f.port.history(binding, null)).toMatchObject({ items: [], hasMore: false });
    expect(f.platform.openOperatorObservation).not.toHaveBeenCalled();
    expect(f.platform.apply).not.toHaveBeenCalled();
    await expect(f.port.history({ ...binding, target: 'wrong' }, null)).rejects.toThrow(
      'Wrong runtime target'
    );
    f.port.close();
    await expect(f.port.history(binding, null)).rejects.toThrow('closed');
  });
  it('keeps application tool arguments out of the operator view and preserves human questions', async () => {
    const f = fixture({
      applicationFunctions: ['read_case'],
      session: {
        id: binding.sessionId,
        metadata: { workflow_revision: binding.workflowRevision },
        required_actions: [
          question,
          {
            ...question,
            call_id: 'call_read',
            name: 'read_case',
            arguments: { privateRecord: 'invented' },
          },
        ],
      },
    });
    const view = await f.port.snapshot(binding);
    expect(view.pendingQuestionIds).toEqual(['call_a']);
    expect(JSON.stringify(view)).not.toContain('privateRecord');
    const pending = await f.port.pendingFunctions(binding);
    expect(pending).toMatchObject([
      { callId: 'call_read', name: 'read_case', arguments: { privateRecord: 'invented' } },
    ]);
    expect(f.platform.apply).not.toHaveBeenCalled();
    f.port.close();
  });
  it('delivers a saved application result only to its exact current call', async () => {
    const f = fixture({
      expiry: Date.now() + 10_000,
      applicationFunctions: ['read_case'],
      session: {
        id: binding.sessionId,
        metadata: { workflow_revision: binding.workflowRevision },
        required_actions: [{ ...question, name: 'read_case', arguments: {} }],
      },
    });
    const call = (await f.port.pendingFunctions(binding))[0];
    if (!call) throw new Error('Missing test call');
    await f.port.completeFunction(binding, call, { success: true, output: 'invented result' });
    expect(f.platform.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'sessions.tool-result',
        id: binding.sessionId,
        turnId: binding.turnId,
        callId: call.callId,
        functionName: 'read_case',
        expectedCallFingerprint: call.fingerprint,
        result: { success: true, output: 'invented result' },
      }),
      expect.objectContaining({ allowBillable: true })
    );
    await expect(
      f.port.completeFunction(
        binding,
        { ...call, fingerprint: 'changed' },
        { success: false, error: 'Unavailable' }
      )
    ).rejects.toThrow('no longer pending');
    f.port.close();
  });
  it('never executes application tools or implicitly authorizes inference', async () => {
    const f = fixture();
    expect(await f.port.pendingFunctions(binding)).toEqual([]);
    await expect(
      f.port.completeFunction(
        binding,
        {
          ...binding,
          callId: 'call_a',
          name: 'ask_operator',
          arguments: {},
          fingerprint: 'a'.repeat(64),
        },
        { success: true, output: 'test' }
      )
    ).rejects.toThrow('authorization');
    await expect(f.port.pendingFunctions({ ...binding, target: 'wrong' })).rejects.toThrow(
      'target'
    );
    expect(() => new OperatorRuntimePort(f.platform, target, 0, ['ask_operator'])).toThrow(
      'Human questions'
    );
    const ended = fixture({
      turn: {
        id: binding.turnId,
        session_id: binding.sessionId,
        subagent_id: null,
        status: 'cancelled',
      },
      applicationFunctions: ['read_case'],
    });
    expect(await ended.port.pendingFunctions(binding)).toEqual([]);
    f.port.close();
    ended.port.close();
    await expect(f.port.pendingFunctions(binding)).rejects.toThrow('closed');
  });
  it('preserves later-turn tool failure visibility without inventing pending work or business failure', async () => {
    const root = {
      id: 'turn_a',
      session_id: 'session_a',
      subagent_id: null,
      status: 'completed',
    };
    const f = fixture({
      session: {
        id: 'session_a',
        metadata: { workflow_revision: 'revision_a' },
        required_actions: [],
      },
      turns: [root, { ...root, id: 'turn_b' }],
      history: {
        has_more: false,
        data: [
          {
            ...question,
            id: 'call_b',
            turn_id: 'turn_b',
            call_id: 'call_b',
            status: 'failed',
          },
          {
            id: 'output_b',
            turn_id: 'turn_b',
            call_id: 'call_b',
            type: 'function_call_output',
            status: 'failed',
            error: 'The managed agent session has no active turn.',
          },
        ],
      },
    });
    try {
      expect(await f.port.snapshot(binding)).toMatchObject({
        status: 'idle',
        currentTurnId: 'turn_b',
        pendingQuestionIds: [],
        items: [
          {
            id: 'call_b',
            kind: 'tool',
            text: 'The agent could not complete a question request. Check the agent’s update before continuing.',
            final: true,
          },
        ],
      });
      expect(f.platform.apply).not.toHaveBeenCalled();
    } finally {
      f.port.close();
    }
  });
  it('returns a definitive refusal but never retries an uncertain write or answers the pending tool instead', async () => {
    const f = fixture({ expiry: Date.now() + 60_000 });
    const command: OperatorCommand = {
      id: 'message_a',
      kind: 'guidance',
      questionId: null,
      callFingerprint: null,
      text: 'Check the corrected license.',
    };
    try {
      f.platform.apply.mockRejectedValueOnce(new InputNotSteerableError());
      expect(await f.port.send(binding, command)).toEqual({
        status: 'rejected',
        reason: 'not_steerable',
      });
      f.platform.apply.mockRejectedValueOnce(new Error('Unknown delivery'));
      await expect(f.port.send(binding, { ...command, id: 'message_b' })).rejects.toThrow(
        'Unknown delivery'
      );
      expect(f.platform.apply).toHaveBeenCalledTimes(2);
      expect((await f.port.snapshot(binding)).pendingQuestionIds).toEqual(['call_a']);
    } finally {
      f.port.close();
    }
  });
  it('sends idempotent guidance without resolving a question, and follows successive root turns after recovery', async () => {
    const roots = [
      { id: 'turn_a', session_id: 'session_a', subagent_id: null, status: 'in_progress' },
    ];
    const options = {
      turns: roots,
      expiry: Date.now() + 60_000,
      session: {
        id: 'session_a',
        metadata: { workflow_revision: 'revision_a' },
        required_actions: [question],
      },
    };
    const f = fixture(options);
    const guidance: OperatorCommand = {
      id: 'correction_a',
      kind: 'guidance',
      questionId: null,
      callFingerprint: null,
      text: 'Use the corrected license.',
    };
    try {
      await f.port.send(binding, guidance);
      expect(f.platform.apply).toHaveBeenLastCalledWith(
        {
          operation: 'sessions.send',
          id: binding.sessionId,
          input: guidance.text,
          idempotencyKey: guidance.id,
        },
        expect.objectContaining({ allowBillable: true })
      );
      expect((await f.port.snapshot(binding)).pendingQuestionIds).toEqual(['call_a']);
      await expect(f.port.send(binding, { ...guidance, questionId: 'call_a' })).rejects.toThrow(
        'not an answer'
      );
      options.session.required_actions = [];
      Object.assign(roots[0] ?? {}, { status: 'completed' });
      expect((await f.port.snapshot(binding)).status).toBe('idle');
      await f.port.send(binding, { ...guidance, id: 'correction_b' });
      roots.push({
        id: 'turn_b',
        session_id: 'session_a',
        subagent_id: null,
        status: 'in_progress',
      });
      options.session.required_actions = [{ ...question, turn_id: 'turn_b', call_id: 'call_b' }];
      const current = await f.port.snapshot(binding);
      expect(current).toMatchObject({
        status: 'waiting',
        currentTurnId: 'turn_b',
        pendingQuestionIds: ['call_b'],
      });
      f.fail();
      await Promise.resolve();
      expect(await f.port.snapshot(binding)).toEqual(current);
      await f.port.send(binding, {
        ...reply,
        questionId: 'call_b',
        callFingerprint: current.items.at(-1)?.callFingerprint ?? '',
      });
      expect(f.platform.apply).toHaveBeenLastCalledWith(
        expect.objectContaining({
          operation: 'sessions.tool-result',
          turnId: 'turn_b',
          callId: 'call_b',
        }),
        expect.anything()
      );
      Object.assign(roots[1] ?? {}, { status: 'cancelled' });
      await expect(f.port.send(binding, guidance)).rejects.toThrow('separate continuation');
      expect(f.platform.apply).toHaveBeenCalledTimes(3);
    } finally {
      f.port.close();
    }
  });
  it('rejects overlapping, foreign, duplicate and unanchored root histories', async () => {
    const root = { id: 'turn_a', session_id: 'session_a', subagent_id: null, status: 'completed' };
    for (const turns of [
      [],
      [{ ...root, id: 'other' }],
      [root, { ...root, id: 'turn_b', session_id: 'other' }],
      [
        { ...root, status: 'in_progress' },
        { ...root, id: 'turn_b' },
      ],
      [root, root],
    ]) {
      const f = fixture({ turns });
      try {
        await expect(f.port.snapshot(binding)).rejects.toThrow('provenance');
      } finally {
        f.port.close();
      }
    }
  });
  it.each(['failed', 'cancelled'])(
    'reads an existing continuation after an older %s root without starting or replaying work',
    async (status) => {
      const f = fixture({
        turns: [
          { id: 'turn_a', session_id: 'session_a', subagent_id: null, status },
          { id: 'turn_b', session_id: 'session_a', subagent_id: null, status: 'completed' },
        ],
      });
      try {
        expect((await f.port.snapshot(binding)).status).toBe('idle');
        expect(f.platform.apply).not.toHaveBeenCalled();
      } finally {
        f.port.close();
      }
    }
  );
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
          status === 'in_progress' ? 'running' : status === 'completed' ? 'idle' : status
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
      'authorization'
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
