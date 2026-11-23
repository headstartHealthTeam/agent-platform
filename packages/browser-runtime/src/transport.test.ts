import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrowserSocket } from './transport.js';

const fake = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  class Socket {
    static instances: Socket[] = [];
    listeners = new Map<string, { handler: Listener; once: boolean }[]>();
    send = vi.fn();
    ping = vi.fn();
    terminate = vi.fn(() => {
      this.emit('close');
    });
    constructor(
      public readonly url: string,
      public readonly options: unknown
    ) {
      Socket.instances.push(this);
    }
    on(event: string, handler: Listener): void {
      this.add(event, handler, false);
    }
    once(event: string, handler: Listener): void {
      this.add(event, handler, true);
    }
    off(event: string, handler: Listener): void {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((entry) => entry.handler !== handler)
      );
    }
    emit(event: string, ...args: unknown[]): void {
      for (const entry of this.listeners.get(event) ?? []) {
        if (entry.once) this.off(event, entry.handler);
        entry.handler(...args);
      }
    }
    private add(event: string, handler: Listener, once: boolean): void {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), { handler, once }]);
    }
  }
  return { Socket };
});
vi.mock('ws', () => ({ default: fake.Socket }));

function socket(): InstanceType<typeof fake.Socket> {
  const value = fake.Socket.instances.at(-1);
  if (!value) throw new Error('Missing socket');
  return value;
}
afterEach(() => {
  vi.useRealTimers();
  fake.Socket.instances.length = 0;
});
describe('owned websocket transport', () => {
  it('uses bounded handshake, exact destination, bounded payload and no redirects', async () => {
    const pending = BrowserSocket.connect('wss://example.test?token=synthetic');
    const remote = socket();
    expect(remote.options).toEqual({
      followRedirects: false,
      handshakeTimeout: 15_000,
      perMessageDeflate: false,
      maxPayload: 4_194_304,
    });
    remote.emit('open');
    const transport = await pending;
    transport.send('synthetic command');
    expect(remote.send).toHaveBeenCalledWith('synthetic command');
    transport.close();
    await transport.closed;
  });
  it.each(['error', 'close'])(
    'settles a failed %s handshake without leaking its error or URL',
    async (event) => {
      const pending = BrowserSocket.connect('wss://example.test?token=synthetic');
      const rejection = expect(pending).rejects.toThrow('Browser session: dispatch_uncertain');
      socket().emit(event, new Error('private diagnostic'));
      await rejection;
      expect(socket().terminate).toHaveBeenCalledOnce();
    }
  );
  it('forwards only text messages and settles ownership on close', async () => {
    const pending = BrowserSocket.connect('wss://example.test');
    const remote = socket();
    remote.emit('open');
    const transport = await pending;
    transport.onmessage = vi.fn();
    transport.onclose = vi.fn();
    remote.emit('message', Buffer.from('one'), false);
    remote.emit('message', [Buffer.from('t'), Buffer.from('wo')], false);
    remote.emit('message', Uint8Array.from([116, 104, 114, 101, 101]).buffer, false);
    expect(transport.onmessage).toHaveBeenNthCalledWith(1, 'one');
    expect(transport.onmessage).toHaveBeenNthCalledWith(2, 'two');
    expect(transport.onmessage).toHaveBeenNthCalledWith(3, 'three');
    remote.emit('error', new Error('private'));
    remote.emit('message', Buffer.from('binary'), true);
    await transport.closed;
    expect(transport.onclose).toHaveBeenCalledOnce();
    expect(transport.onmessage).toHaveBeenCalledTimes(3);
  });
  it('limits total handshake time and settles closure if a subscriber throws', async () => {
    vi.useFakeTimers();
    const slow = expect(BrowserSocket.connect('wss://example.test')).rejects.toThrow(
      'dispatch_uncertain'
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await slow;
    expect(socket().terminate).toHaveBeenCalledOnce();
    const opening = BrowserSocket.connect('wss://example.test');
    socket().emit('open');
    const transport = await opening;
    transport.onclose = (): void => {
      throw new Error('Observer failed');
    };
    transport.close();
    await transport.closed;
  });
  it('terminates a half-open socket after an unanswered heartbeat', async () => {
    vi.useFakeTimers();
    const pending = BrowserSocket.connect('wss://example.test');
    const remote = socket();
    remote.emit('open');
    const transport = await pending;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.ping).toHaveBeenCalledOnce();
    remote.emit('pong');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(remote.ping).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    await transport.closed;
    expect(remote.terminate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(remote.ping).toHaveBeenCalledTimes(2);
  });
});
