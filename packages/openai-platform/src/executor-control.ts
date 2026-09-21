import { connect } from 'node:net';

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
    const socket = connect(executorSocket);
    const timeout = setTimeout(() => {
      socket.destroy();
      process.exitCode = 1;
    }, 10_000);
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.write(`${input}\n`));
    socket.once('data', (data: string) => {
      if (data === 'ready') process.stdout.write('ready');
      else process.exitCode = 1;
      socket.destroy();
    });
    socket.once('error', () => {
      process.exitCode = 1;
    });
    socket.once('close', () => {
      clearTimeout(timeout);
    });
  });
}

controlExecutor();
