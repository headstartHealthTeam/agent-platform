import { spawn } from 'node:child_process';

/** Trusted host-only Docker boundary. Input may contain a secret; never attach process errors. */
export type DockerCommand = (args: readonly string[], input?: string) => Promise<string>;

export const dockerCommand: DockerCommand = (args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', [...args], {
      env: { PATH: process.env['PATH'], HOME: process.env['HOME'] },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let output = '';
    let failed = false;
    const fail = (): void => {
      failed = true;
      child.kill('SIGKILL');
    };
    const timeout = setTimeout(fail, 30_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (failed) return;
      output += chunk;
      if (output.length > 65_536) fail();
    });
    child.stdin.on('error', fail);
    child.once('error', fail);
    // Settle only after the child is gone; do not release provisioning locks around detached I/O.
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (failed || code !== 0) reject(new Error('Local executor operation failed'));
      else resolve(output);
    });
    child.stdin.end(input);
  });
