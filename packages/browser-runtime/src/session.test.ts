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
  it('preserves a safe authentication phase while withholding the watch viewer', async () => {
    const { session, connection } = fixture();
    await session.startHumanControl();
    vi.mocked(connection.inspect).mockRejectedValueOnce(
      new BrowserSessionError('human_control', 'authentication')
    );
    await expect(session.resumeAutomation()).rejects.toMatchObject({
      code: 'dispatch_uncertain',
      phase: 'authentication',
    });
    expect(connection.watch).not.toHaveBeenCalled();
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
    await pending;
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
