import type { ConnectionTransport } from 'puppeteer-core';
import WebSocket from 'ws';

import { BrowserSessionError } from './session.js';

/** Owned socket: no redirects/retries; handshake, heartbeat and close are bounded. */
export class BrowserSocket implements ConnectionTransport {
  onmessage?: (message: string) => void;
  onclose?: () => void;
  readonly closed: Promise<void>;
  #heartbeat: ReturnType<typeof setInterval> | undefined;

  private constructor(private readonly socket: WebSocket) {
    this.closed = new Promise((resolve) => {
      socket.once('close', () => {
        clearInterval(this.#heartbeat);
        this.onclose?.();
        resolve();
      });
    });
    socket.on('message', (data, binary) => {
      if (binary) {
        this.close();
        return;
      }
      const bytes = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      this.onmessage?.(bytes.toString('utf8'));
    });
    socket.on('error', () => {
      /* Sanitized by the operation owner; never log a token-bearing URL. */
    });
  }

  static async connect(url: string): Promise<BrowserSocket> {
    const socket = new WebSocket(url, {
      followRedirects: false,
      handshakeTimeout: 15_000,
      perMessageDeflate: false,
      maxPayload: 4_194_304,
    });
    const transport = new BrowserSocket(socket);
    try {
      await new Promise<void>((resolve, reject) => {
        const opened = (): void => {
          cleanup();
          resolve();
        };
        const failed = (): void => {
          cleanup();
          reject(new BrowserSessionError('dispatch_uncertain'));
        };
        const cleanup = (): void => {
          socket.off('open', opened);
          socket.off('error', failed);
          socket.off('close', failed);
        };
        socket.once('open', opened);
        socket.once('error', failed);
        socket.once('close', failed);
      });
      transport.heartbeat();
      return transport;
    } catch {
      transport.close();
      await transport.closed;
      throw new BrowserSessionError('dispatch_uncertain');
    }
  }

  send(message: string): void {
    this.socket.send(message);
  }
  close(): void {
    this.socket.terminate();
  }
  private heartbeat(): void {
    let pending = false;
    this.socket.on('pong', () => {
      pending = false;
    });
    this.#heartbeat = setInterval(() => {
      if (pending) {
        this.close();
        return;
      }
      pending = true;
      this.socket.ping();
    }, 10_000);
    this.#heartbeat.unref();
  }
}
