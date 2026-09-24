import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:net';

import { z } from 'zod';

import { fingerprint } from './fingerprint.js';
import { selfHostedExecutorConnection } from './self-hosted.js';

export const executorSocket = '/tmp/headstart-agent-executor.sock';
const payloadSchema = z
  .object({
    key: z.string().min(1).max(5000),
    expiresAt: z.number(),
    connection: z
      .object({
        sessionId: z.string(),
        environmentId: z.string(),
        arguments: z.array(z.string()).length(5),
      })
      .strict(),
  })
  .strict();
export type ExecutorSpawn = (args: readonly string[], key: string) => ChildProcess;
const startExecutor: ExecutorSpawn = (args, key) =>
  spawn('codex', [...args], {
    cwd: '/workspace',
    env: {
      PATH: process.env['PATH'],
      HOME: '/home/node',
      HTTPS_PROXY: process.env['HTTPS_PROXY'],
      HTTP_PROXY: process.env['HTTP_PROXY'],
      CODEX_API_KEY: key,
    },
    // Tool output, connection URLs and keys never enter Docker logs or host command receipts.
    stdio: 'ignore',
  });

/** Container-local process owner. It retains no credential file or business state. */
export class ExecutorSupervisor {
  private child: ChildProcess | undefined;
  private identity: string | undefined;
  private argumentsIdentity: string | undefined;
  private pending: Promise<void> = Promise.resolve();
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly start: ExecutorSpawn = startExecutor) {}
  ensure(value: unknown): Promise<void> {
    const next = this.pending.then(() => this.reconcile(value));
    this.pending = next.catch(() => undefined);
    return next;
  }
  private async reconcile(value: unknown): Promise<void> {
    const payload = payloadSchema.parse(value);
    const args = payload.connection.arguments;
    if (
      args[0] !== 'exec-server' ||
      args[1] !== '--remote' ||
      args[3] !== '--environment-id' ||
      args[4] !== payload.connection.environmentId
    )
      throw new Error('Invalid executor arguments');
    selfHostedExecutorConnection(
      {
        id: payload.connection.sessionId,
        environment: {
          type: 'self_hosted',
          id: payload.connection.environmentId,
          remote_url: args[2],
        },
      },
      payload.connection.sessionId
    );
    const duration = payload.expiresAt - Date.now();
    if (duration <= 0 || duration > 2_147_483_647)
      throw new Error('Executor authority expired or unsupported');
    const identity = fingerprint({
      sessionId: payload.connection.sessionId,
      environmentId: payload.connection.environmentId,
      expiresAt: payload.expiresAt,
    });
    if (this.identity && this.identity !== identity) throw new Error('Executor binding changed');
    this.identity = identity;
    this.assertActive(payload.expiresAt);
    const argumentsIdentity = fingerprint(args);
    if (this.child && this.argumentsIdentity === argumentsIdentity) return;
    if (this.child) await this.retireChild(this.child);
    // Rotation cannot extend authority or race a Stop while the old process exits.
    this.assertActive(payload.expiresAt);
    const child = this.start(args, payload.key);
    this.child = child;
    this.argumentsIdentity = argumentsIdentity;
    const ended = (): void => {
      if (this.child === child) {
        this.child = undefined;
        if (this.timer) clearTimeout(this.timer);
      }
    };
    child.once('error', () => {
      // A failed spawn has no process. A kill error is not evidence that a live child exited.
      if (child.pid === undefined) ended();
    });
    child.once('exit', ended);
    this.timer = setTimeout(() => {
      this.stop();
    }, payload.expiresAt - Date.now());
    this.timer.unref();
  }
  private assertActive(expiresAt: number): void {
    if (this.stopped || expiresAt <= Date.now()) throw new Error('Executor stopped or expired');
  }
  private retireChild(child: ChildProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      const ended = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        child.removeListener('exit', ended);
        if (this.child === child) child.kill('SIGKILL');
        // Keep ownership until exit is observed; a later ensure can reconcile, not overlap.
        reject(new Error('Executor replacement awaits confirmed exit'));
      }, 5000);
      child.once('exit', ended);
      child.kill('SIGTERM');
    });
  }
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const child = this.child;
    if (!child) return;
    child.kill('SIGTERM');
    const force = setTimeout(() => {
      if (this.child === child) child.kill('SIGKILL');
    }, 5000);
    force.unref();
  }
}

export function serveExecutor(supervisor = new ExecutorSupervisor()): Server {
  const server = createServer((socket) => {
    let input = '';
    socket.setEncoding('utf8');
    socket.setTimeout(10_000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('data', (data: string) => {
      input += data;
      if (input.length > 16_384) {
        socket.destroy();
        return;
      }
      const boundary = input.indexOf('\n');
      if (boundary < 0) return;
      socket.pause();
      try {
        supervisor
          .ensure(JSON.parse(input.slice(0, boundary)))
          .then(() => socket.end('ready'))
          .catch(() => socket.end('unavailable'));
      } catch {
        socket.end('unavailable');
      }
      input = '';
    });
  });
  server.listen(executorSocket);
  return server;
}
