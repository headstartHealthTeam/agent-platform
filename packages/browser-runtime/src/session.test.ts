import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrowserSessionError, OwnedBrowserSession, type BrowserConnection } from './session.js';

function fixture(): { session: OwnedBrowserSession; connection: BrowserConnection } {
  const connection: BrowserConnection = {
    inspect: vi.fn(async () => ({ text: 'Synthetic form', image: 'synthetic image' })),
    act: vi.fn(async () => undefined),
    watch: vi.fn(async (timeout: number) => ({
      liveURL: 'https://example.test/live',
      liveURLId: 'example',
      timeout,
    })),
    human: vi.fn(async (timeout: number) => ({
      liveURL: 'https://example.test/private',
      liveURLId: 'human',
      timeout,
    })),
    closeViewer: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return { connection, session: new OwnedBrowserSession(connection, Date.now() + 120_000) };
}
afterEach(() => {
  vi.useRealTimers();
});

describe('one owned browser', () => {
  it('keeps private and watch links within the same thirty-minute browser deadline without an earlier artificial expiry', async () => {
    vi.useFakeTimers();
    const { session: initial, connection } = fixture();
    await initial.stop();
    vi.mocked(connection.close).mockClear();
    const end = Date.now() + 1_800_000;
    const session = new OwnedBrowserSession(connection, end, true);
    const privateViewer = await session.startHumanControl();
    expect(privateViewer.notAfter).toBe(end);
    expect(connection.human).toHaveBeenCalledWith(1_800_000);
    await vi.advanceTimersByTimeAsync(120_000);
    const watchViewer = await session.resumeAutomation();
    expect(watchViewer.notAfter).toBe(end);
    expect(connection.watch).toHaveBeenCalledWith(1_680_000);
    await vi.advanceTimersByTimeAsync(1_680_000);
    expect(connection.close).toHaveBeenCalledOnce();
    await expect(session.watch()).rejects.toMatchObject({ code: 'ended' });
  });
  it('keeps native screenshots, actions and uploads blocked during private control', async () => {
    const { session, connection } = fixture();
    connection.inspectComputer = vi.fn(async () => ({ text: 'Draft', image: 'image' }));
    connection.computer = vi.fn(async () => undefined);
    connection.validateComputer = vi.fn(async () => undefined);
    connection.uploadComputer = vi.fn(async () => undefined);
    await session.startHumanControl();
    await expect(session.inspectComputer()).rejects.toMatchObject({ code: 'human_control' });
    await expect(session.computer({ type: 'screenshot' }, [])).rejects.toMatchObject({
      code: 'human_control',
    });
    await expect(session.uploadComputer({ x: 1, y: 1 }, [])).rejects.toMatchObject({
      code: 'human_control',
    });
    expect(connection.inspectComputer).not.toHaveBeenCalled();
    expect(connection.computer).not.toHaveBeenCalled();
    expect(connection.uploadComputer).not.toHaveBeenCalled();
    await session.stop();
  });
  it('lets Stop win while a native action is being validated', async () => {
    const { session, connection } = fixture();
    let finish: (() => void) | undefined;
    connection.validateComputer = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    connection.computer = vi.fn(async () => undefined);
    connection.inspectComputer = vi.fn(async () => ({ text: 'Draft', image: 'image' }));
    const pending = session.computer({ type: 'click', x: 1, y: 1, button: 'left' }, []);
    await session.stop();
    finish?.();
    await expect(pending).rejects.toMatchObject({ code: 'ended' });
    expect(connection.computer).not.toHaveBeenCalled();
  });
  it('honors a private handoff that finishes during native validation', async () => {
    const { session, connection } = fixture();
    let completeValidation: (() => void) | undefined;
    connection.validateComputer = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeValidation = resolve;
        })
    );
    connection.computer = vi.fn(async () => undefined);
    connection.inspectComputer = vi.fn(async () => ({ text: 'Draft', image: 'image' }));
    const pending = session.computer({ type: 'screenshot' }, []);
    await session.startHumanControl();
    completeValidation?.();
    await expect(pending).rejects.toMatchObject({ code: 'human_control' });
    expect(connection.computer).not.toHaveBeenCalled();
    expect(connection.inspectComputer).not.toHaveBeenCalled();
    await session.stop();
  });
  it('preserves only an upload rejection before input, even if the later observation reports the same error', async () => {
    const { session, connection } = fixture();
    const stale = new BrowserSessionError('invalid_action', 'tab-selection');
    const upload = vi.fn().mockRejectedValueOnce(stale).mockResolvedValueOnce(undefined);
    const inspect = vi.fn(async () => ({ text: 'New tab', image: 'fresh image' }));
    connection.uploadComputer = upload;
    connection.inspectComputer = inspect;
    await expect(session.uploadComputer({ x: 2, y: 3 }, [])).rejects.toBe(stale);
    expect(inspect).not.toHaveBeenCalled();
    await expect(session.inspectComputer()).resolves.toHaveProperty('text', 'New tab');
    inspect.mockRejectedValueOnce(stale);
    await expect(session.uploadComputer({ x: 2, y: 3 }, [])).rejects.toMatchObject({
      code: 'dispatch_uncertain',
    });
    await expect(session.inspectComputer()).rejects.toMatchObject({ code: 'ended' });
    await session.stop();
  });

  it.each(['before', 'after'] as const)(
    'classifies a capture failure %s input without exposing the rejected read',
    async (when) => {
      const { session, connection } = fixture();
      const previous = { text: 'Fictional profile', image: 'first' };
      const send = vi.fn();
      connection.validateComputer = async (): Promise<void> => undefined;
      connection.computer = async (_action, _values, checked): Promise<void> => {
        await checked?.();
        send();
      };
      const inspect = vi.fn(async () => previous);
      if (when === 'after') inspect.mockResolvedValueOnce(previous);
      inspect.mockRejectedValueOnce(new Error('unshareable pixels'));
      connection.inspectComputer = inspect;
      try {
        const rejected = session.computer(
          { type: 'click', x: 1, y: 2, button: 'left' },
          [],
          previous
        );
        if (when === 'before') {
          await expect(rejected).rejects.toMatchObject({
            name: 'BrowserSessionError',
            code: 'read_failed',
            phase: 'pre-input-observation',
            message: 'Browser session: read_failed',
          });
          expect(send).not.toHaveBeenCalled();
          await expect(session.inspectComputer()).resolves.toEqual(previous);
          await expect(session.startHumanControl()).resolves.toHaveProperty('liveURLId', 'human');
          await expect(session.inspectComputer()).rejects.toMatchObject({ code: 'human_control' });
        } else {
          await expect(rejected).rejects.toMatchObject({ code: 'dispatch_uncertain' });
          expect(send).toHaveBeenCalledOnce();
          await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'ended' });
        }
      } finally {
        await session.stop();
      }
    }
  );
  it('withholds fresh pixels and input if Stop wins during the reviewed-screen recheck', async () => {
    const { session, connection } = fixture();
    const before = { text: 'Fictional first provider', image: 'first' };
    const sendInput = vi.fn();
    connection.validateComputer = async (): Promise<void> => undefined;
    connection.computer = async (_action, _values, check): Promise<void> => {
      await check?.();
      sendInput();
    };
    connection.inspectComputer = async (): Promise<typeof before> => {
      await session.stop();
      return { text: 'Fictional second provider', image: 'second' };
    };
    await expect(
      session.computer({ type: 'click', x: 1, y: 1, button: 'left' }, [], before)
    ).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(sendInput).not.toHaveBeenCalled();
    await expect(session.inspectComputer()).rejects.toMatchObject({ code: 'ended' });
  });
  it('never repeats a native mutation after its screenshot becomes uncertain', async () => {
    const { session, connection } = fixture();
    connection.validateComputer = vi.fn(async () => undefined);
    connection.computer = vi.fn(async () => undefined);
    connection.inspectComputer = vi.fn(async () => {
      throw new Error('private detail');
    });
    const action = { type: 'click', x: 1, y: 1, button: 'left' };
    await expect(session.computer(action, [])).rejects.toMatchObject({
      code: 'dispatch_uncertain',
    });
    await expect(session.computer(action, [])).rejects.toMatchObject({ code: 'ended' });
    expect(connection.computer).toHaveBeenCalledOnce();
    await session.stop();
  });
  it('requires fresh native validation after an entire private handoff completes', async () => {
    const { session, connection } = fixture();
    let completeValidation: (() => void) | undefined;
    connection.validateComputer = vi
      .fn(async (): Promise<void> => undefined)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            completeValidation = resolve;
          })
      );
    connection.computer = vi.fn(async () => undefined);
    connection.inspectComputer = vi.fn(async () => ({ text: 'Current draft', image: 'image' }));
    const click = { type: 'click', x: 10, y: 10, button: 'left' };
    const pending = session.computer(click, []);
    await session.startHumanControl();
    await session.resumeAutomation();
    completeValidation?.();
    await expect(pending).rejects.toMatchObject({ code: 'human_control' });
    expect(connection.computer).not.toHaveBeenCalled();
    await expect(session.computer(click, [])).resolves.toHaveProperty('text', 'Current draft');
    expect(connection.validateComputer).toHaveBeenCalledTimes(2);
    expect(connection.computer).toHaveBeenCalledOnce();
    await session.stop();
  });
  it('keeps an unacknowledged revocation uncertain even when it carries an origin refusal', async () => {
    const { session, connection } = fixture();
    try {
      await session.startHumanControl();
      vi.mocked(connection.closeViewer).mockRejectedValueOnce(
        new BrowserSessionError('human_control', 'reviewed-origin')
      );
      await expect(session.resumeAutomation()).rejects.toMatchObject({
        code: 'dispatch_uncertain',
      });
      expect(connection.inspect).not.toHaveBeenCalled();
      expect(connection.watch).not.toHaveBeenCalled();
      await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'ended' });
    } finally {
      await session.stop();
    }
  });
  it.each([
    { operation: 'closeViewer', phase: 'handoff-revocation' },
    { operation: 'inspect', phase: 'handoff-observation' },
    { operation: 'watch', phase: 'handoff-viewer' },
  ] as const)(
    'retains only the safe phase for a failed $operation handoff',
    async ({ operation, phase }) => {
      const { session, connection } = fixture();
      await session.startHumanControl();
      const failedOperation =
        operation === 'closeViewer'
          ? connection.closeViewer
          : operation === 'inspect'
            ? connection.inspect
            : connection.watch;
      vi.mocked(failedOperation).mockRejectedValueOnce(new Error('private credential detail'));
      await expect(session.resumeAutomation()).rejects.toMatchObject({
        code: 'dispatch_uncertain',
        phase,
        message: 'Browser session: dispatch_uncertain',
      });
      await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'ended' });
      await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
        code: 'human_control',
      });
      expect(connection.act).not.toHaveBeenCalled();
      await session.stop();
    }
  );
  it('leaves the operator in control to dismiss a known modal before retrying handoff', async () => {
    const { session, connection } = fixture();
    connection.hasPendingDialog = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const viewer = await session.startHumanControl();
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'human_control' });
    expect(await session.startHumanControl()).toEqual(viewer);
    expect(connection.closeViewer).not.toHaveBeenCalled();
    await session.resumeAutomation();
    expect(connection.watch).toHaveBeenCalledOnce();
    await session.stop();
  });
  it('withholds a watch viewer when the handoff shows a dialog or a private link expires', async () => {
    vi.useFakeTimers();
    const { session, connection } = fixture();
    vi.mocked(connection.human).mockResolvedValueOnce({
      liveURLId: 'human',
      liveURL: 'private',
      timeout: 50,
    });
    await session.startHumanControl();
    await vi.advanceTimersByTimeAsync(50);
    await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'ended' });
    vi.mocked(connection.inspect).mockResolvedValueOnce({
      text: 'Dialog',
      image: 'Prior image',
      pauseBatch: true,
    });
    await expect(session.resumeAutomation()).rejects.toMatchObject({
      code: 'human_control',
      phase: 'handoff-observation',
    });
    expect(connection.watch).not.toHaveBeenCalled();
    await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    await session.stop();
  });
  it('preserves a safe authentication phase while withholding the watch viewer', async () => {
    const { session, connection } = fixture();
    const original = await session.startHumanControl();
    vi.mocked(connection.inspect).mockRejectedValueOnce(
      new BrowserSessionError('human_control', 'authentication')
    );
    await expect(session.resumeAutomation()).rejects.toMatchObject({
      code: 'human_control',
      phase: 'authentication',
    });
    expect(connection.watch).not.toHaveBeenCalled();
    await expect(session.inspectComputer()).rejects.toMatchObject({ code: 'human_control' });
    vi.mocked(connection.human).mockResolvedValueOnce({
      liveURLId: 'renewed',
      liveURL: 'https://example.test/private/renewed',
      timeout: 3000,
    });
    expect((await session.startHumanControl()).liveURLId).not.toBe(original.liveURLId);
    await session.resumeAutomation();
    expect(connection.closeViewer).toHaveBeenLastCalledWith('renewed');
    expect(connection.watch).toHaveBeenCalledOnce();
    await session.stop();
  });
  it('excludes automation reads, screenshots and actions throughout initial private control', async () => {
    const { session, connection } = fixture();
    await session.startHumanControl();
    for (const action of [
      { kind: 'inspect' },
      { kind: 'fill', selector: '#name', value: 'Example' },
    ])
      await expect(session.execute(action)).rejects.toMatchObject({ code: 'human_control' });
    await expect(session.watch()).rejects.toMatchObject({ code: 'human_control' });
    expect(connection.inspect).not.toHaveBeenCalled();
    expect(connection.act).not.toHaveBeenCalled();
    expect(connection.watch).not.toHaveBeenCalled();
    await session.resumeAutomation();
    expect(connection.closeViewer).toHaveBeenCalledWith('human');
    expect(vi.mocked(connection.closeViewer).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(connection.inspect).mock.invocationCallOrder[0] ?? 0
    );
    expect(vi.mocked(connection.inspect).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(connection.watch).mock.invocationCallOrder[0] ?? 0
    );
    await session.execute({ kind: 'inspect' });
    expect(connection.inspect).toHaveBeenCalledTimes(2);
    await session.stop();
  });
  it('revokes each old viewer before returning private control without replacing the browser', async () => {
    const { session, connection } = fixture();
    await session.watch();
    await session.startHumanControl();
    expect(connection.closeViewer).toHaveBeenCalledWith('example');
    await expect(session.inspectComputer()).rejects.toMatchObject({ code: 'human_control' });
    await session.resumeAutomation();
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'invalid_action' });
    vi.mocked(connection.human).mockResolvedValueOnce({
      liveURLId: 'second',
      liveURL: 'https://example.test/private/second',
      timeout: 5000,
    });
    await session.startHumanControl();
    expect(connection.human).toHaveBeenCalledTimes(2);
    expect(connection.closeViewer).toHaveBeenCalledTimes(3);
    expect(connection.close).not.toHaveBeenCalled();
    await session.stop();
  });
  it('withholds private control if revoking the old watch viewer fails', async () => {
    const { session, connection } = fixture();
    await session.watch();
    vi.mocked(connection.closeViewer).mockRejectedValueOnce(new Error('Unknown revocation'));
    await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(connection.human).not.toHaveBeenCalled();
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
      code: 'human_control',
    });
    await session.stop();
  });
  it('revokes each watch viewer before issuing its replacement or entering private control', async () => {
    const { session, connection } = fixture();
    const first = await session.watch();
    vi.mocked(connection.watch).mockResolvedValueOnce({
      liveURL: 'https://example.test/next',
      liveURLId: 'next',
      timeout: 5000,
    });
    let revoked: (() => void) | undefined;
    vi.mocked(connection.closeViewer).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          revoked = resolve;
        })
    );
    const renewing = session.watch();
    expect(connection.closeViewer).toHaveBeenCalledWith(first.liveURLId);
    expect(connection.watch).toHaveBeenCalledOnce();
    await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'busy' });
    revoked?.();
    expect((await renewing).liveURLId).toBe('next');
    await session.startHumanControl();
    expect(connection.closeViewer).toHaveBeenNthCalledWith(2, 'next');
    await session.stop();
  });
  it('withholds new viewers and private control when a shared viewer revocation is uncertain', async () => {
    const { session, connection } = fixture();
    const first = await session.watch();
    vi.mocked(connection.closeViewer).mockRejectedValueOnce(new Error('Unknown revocation'));
    await expect(session.watch()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(connection.closeViewer).toHaveBeenCalledWith(first.liveURLId);
    expect(connection.watch).toHaveBeenCalledOnce();
    await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'ended' });
    expect(connection.human).not.toHaveBeenCalled();
    await session.stop();
  });
  it('keeps automation blocked when interactive revocation is uncertain', async () => {
    const { session, connection } = fixture();
    await session.startHumanControl();
    vi.mocked(connection.closeViewer).mockRejectedValueOnce(new Error('private'));
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'ended' });
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
      code: 'human_control',
    });
    expect(connection.watch).not.toHaveBeenCalled();
    expect(connection.inspect).not.toHaveBeenCalled();
    await session.stop();
  });
  it('lets Stop win while the interactive link is being revoked', async () => {
    const { session, connection } = fixture();
    await session.startHumanControl();
    let finish: (() => void) | undefined;
    vi.mocked(connection.closeViewer).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const pending = session.resumeAutomation();
    await expect(session.startHumanControl()).rejects.toMatchObject({ code: 'busy' });
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'busy' });
    await session.stop();
    finish?.();
    await expect(pending).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(connection.watch).not.toHaveBeenCalled();
  });
  it('never exposes a shared viewer when the post-login safety observation fails', async () => {
    const { session, connection } = fixture();
    await session.startHumanControl();
    vi.mocked(connection.inspect).mockRejectedValueOnce(new Error('Still authenticating'));
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(connection.closeViewer).toHaveBeenCalledWith('human');
    expect(connection.watch).not.toHaveBeenCalled();
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
      code: 'human_control',
    });
    await session.stop();
  });
  it('lets Stop win while the post-login observation is still pending', async () => {
    const { session, connection } = fixture();
    await session.startHumanControl();
    let finish: (() => void) | undefined;
    vi.mocked(connection.inspect).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { text: 'Synthetic form', image: 'synthetic image' };
    });
    const pending = session.resumeAutomation();
    await vi.waitFor(() => {
      expect(finish).toBeDefined();
    });
    await session.stop();
    finish?.();
    await expect(pending).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(connection.watch).not.toHaveBeenCalled();
  });
  it('retains private-control receipts when Stop races initial minting', async () => {
    const { session, connection } = fixture();
    let finish:
      ((value: { liveURL: string; liveURLId: string; timeout: number }) => void) | undefined;
    vi.mocked(connection.human).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = session.startHumanControl();
    await session.stop();
    finish?.({ liveURL: 'https://example.test/live', liveURLId: 'human', timeout: 5000 });
    expect((await pending).liveURLId).toBe('human');
    await expect(session.resumeAutomation()).rejects.toMatchObject({ code: 'ended' });
  });
  it('dispatches one action and returns the same browser inspection', async () => {
    const { session, connection } = fixture();
    await expect(
      session.execute({ kind: 'fill', selector: '#name', value: 'Synthetic' })
    ).resolves.toEqual({ text: 'Synthetic form', image: 'synthetic image' });
    expect(connection.act).toHaveBeenCalledTimes(1);
    await session.stop();
  });
  it.each([
    { kind: 'submit' },
    { kind: 'fill', selector: '', value: 'text' },
    { kind: 'inspect', script: 'untrusted' },
  ])('rejects unsupported or extra model input', async (input) => {
    const { session, connection } = fixture();
    await expect(session.execute(input)).rejects.toMatchObject({ code: 'invalid_action' });
    expect(connection.act).not.toHaveBeenCalled();
    await session.stop();
  });
  it('does not replay an uncertain action, including when the subsequent inspection fails', async () => {
    const { session, connection } = fixture();
    vi.mocked(connection.inspect).mockRejectedValueOnce(new Error('private provider failure'));
    await expect(session.execute({ kind: 'click', selector: '#next' })).rejects.toThrow(
      'Browser session: dispatch_uncertain'
    );
    await expect(session.execute({ kind: 'click', selector: '#next' })).rejects.toMatchObject({
      code: 'ended',
    });
    expect(connection.act).toHaveBeenCalledTimes(1);
    await session.stop();
  });
  it('allows another read after a failed read, without performing an action', async () => {
    const { session, connection } = fixture();
    vi.mocked(connection.inspect).mockRejectedValueOnce(new Error('private'));
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({
      code: 'read_failed',
    });
    await expect(session.execute({ kind: 'inspect' })).resolves.toHaveProperty('text');
    expect(connection.act).not.toHaveBeenCalled();
    await session.stop();
  });
  it('rejects overlapping work and lets Stop close an in-flight action', async () => {
    const { session, connection } = fixture();
    let finish: (() => void) | undefined;
    vi.mocked(connection.act).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const pending = session.execute({ kind: 'click', selector: '#next' });
    await expect(session.watch()).rejects.toMatchObject({ code: 'busy' });
    await session.stop();
    expect(connection.close).toHaveBeenCalledTimes(1);
    finish?.();
    await expect(pending).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(connection.inspect).not.toHaveBeenCalled();
    await expect(session.execute({ kind: 'inspect' })).rejects.toMatchObject({ code: 'ended' });
  });
  it('coalesces concurrent Stop and retains uncertain close for reconciliation', async () => {
    const { session, connection } = fixture();
    vi.mocked(connection.close).mockRejectedValueOnce(new Error('private'));
    const closing = [session.stop(), session.stop()];
    await expect(Promise.all(closing)).rejects.toMatchObject({ code: 'dispatch_uncertain' });
    expect(connection.close).toHaveBeenCalledTimes(1);
    await session.stop();
    expect(connection.close).toHaveBeenCalledTimes(2);
  });
  it('uses the original absolute deadline and automatically closes at expiry', async () => {
    vi.useFakeTimers();
    const { session, connection } = fixture();
    const end = session.notAfter;
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await session.watch()).notAfter).toBe(end);
    expect(connection.watch).toHaveBeenCalledWith(100_000);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(connection.close).toHaveBeenCalledTimes(1);
    await expect(session.watch()).rejects.toMatchObject({ code: 'ended' });
  });
  it('does not abandon a known viewer receipt when Stop races it', async () => {
    const { session, connection } = fixture();
    let finish:
      ((value: { liveURL: string; liveURLId: string; timeout: number }) => void) | undefined;
    vi.mocked(connection.watch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = session.watch();
    await session.stop();
    finish?.({ liveURL: 'https://example.test/live', liveURLId: 'same', timeout: 5000 });
    expect((await pending).liveURLId).toBe('same');
  });
  it('rejects invalid or elapsed lifetime', () => {
    const { connection, session } = fixture();
    expect(() => new OwnedBrowserSession(connection, Date.now())).toThrow('ended');
    expect(() => new OwnedBrowserSession(connection, Infinity)).toThrow('ended');
    return session.stop();
  });
});
