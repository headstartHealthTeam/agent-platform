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
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly start: ExecutorSpawn = startExecutor) {}
  ensure(value: unknown): void {
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
    const identity = fingerprint({ connection: payload.connection, expiresAt: payload.expiresAt });
    if (this.identity && this.identity !== identity) throw new Error('Executor binding changed');
    this.identity = identity;
    if (this.child) return;
    const child = this.start(args, payload.key);
    this.child = child;
    const ended = (): void => {
      if (this.child === child) {
        this.child = undefined;
        if (this.timer) clearTimeout(this.timer);
      }
    };
    child.once('error', ended);
    child.once('exit', ended);
    this.timer = setTimeout(() => {
      this.stop();
    }, duration);
    this.timer.unref();
  }
  stop(): void {
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
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('data', (data: string) => {
      input += data;
      if (input.length > 16_384) {
        socket.destroy();
        return;
      }
      const boundary = input.indexOf('\n');
      if (boundary < 0) return;
      try {
        supervisor.ensure(JSON.parse(input.slice(0, boundary)));
        socket.end('ready');
      } catch {
        socket.end('unavailable');
      }
      input = '';
    });
  });
  server.listen(executorSocket);
  return server;
}
