import { connect, type Socket } from 'node:net';

import { executorSocket } from './executor-supervisor.js';

/** Private stdin-to-socket handoff, only invoked by the trusted host's docker exec. */
export function controlExecutor(): void {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data: string) => {
    input += data;
    if (input.length > 16_384) process.exit(1);
  });
  process.stdin.once('end', () => {
    const deadline = Date.now() + 10_000;
    let socket: Socket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = (ready: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (retry) clearTimeout(retry);
      socket?.destroy();
      if (ready) process.stdout.write('ready');
      else process.exitCode = 1;
    };
    const timeout = setTimeout(() => {
      finish(false);
    }, 10_000);
    const attempt = (): void => {
      retry = undefined;
      let connected = false;
      socket = connect(executorSocket);
      const current = socket;
      let response = '';
      current.setEncoding('utf8');
      current.once('connect', () => {
        if (finished || socket !== current) return;
        connected = true;
        current.write(`${input}\n`);
      });
      current.on('data', (data: string) => {
        if (finished || socket !== current) return;
        if (response.length + data.length > 'unavailable'.length) {
          finish(false);
          return;
        }
        response += data;
      });
      current.once('end', () => {
        if (socket === current) finish(response === 'ready');
      });
      current.once('error', (error: NodeJS.ErrnoException) => {
        if (finished || socket !== current) return;
        const starting = error.code === 'ENOENT' || error.code === 'ECONNREFUSED';
        // Never resend bootstrap after connecting: its outcome may already be committed.
        if (!connected && starting && Date.now() + 100 < deadline) retry = setTimeout(attempt, 100);
        else finish(false);
      });
      current.once('close', () => {
        if (socket === current && !retry) finish(false);
      });
    };
    attempt();
  });
}

controlExecutor();
