import { ChildProcess, spawn } from 'node:child_process';
import type * as ChildProcesses from 'node:child_process';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { dockerCommand } from './executor-process.js';

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof ChildProcesses>()),
  spawn: vi.fn(),
}));

function fixture(): {
  child: ChildProcess;
  output: PassThrough;
  input: PassThrough;
  kill: MockInstance<ChildProcess['kill']>;
} {
  const child = new ChildProcess();
  const input = new PassThrough();
  const output = new PassThrough();
  child.stdin = input;
  child.stdout = output;
  const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
  vi.mocked(spawn).mockReturnValue(child);
  return { child, output, input, kill };
}
describe('trusted Docker process boundary', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('passes secret input only through stdin and returns bounded successful output', async () => {
    const { child, input, output } = fixture();
    let received = '';
    input.on('data', (data: Buffer) => {
      received += data.toString();
    });
    const result = dockerCommand(['exec', '-i', 'invented'], 'private-invented-value');
    output.write('ready');
    child.emit('close', 0);
    expect(await result).toBe('ready');
    expect(received).toBe('private-invented-value');
    expect(spawn).toHaveBeenCalledWith(
      'docker',
      ['exec', '-i', 'invented'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'ignore'] })
    );
    expect(JSON.stringify(vi.mocked(spawn).mock.calls)).not.toContain('private-invented-value');
  });
  it('kills oversized or timed-out I/O and settles only when the child closes', async () => {
    vi.useFakeTimers();
    const { child, output, kill } = fixture();
    const result = dockerCommand(['inspect']);
    const rejected = expect(result).rejects.toThrow('Local executor operation failed');
    output.write('x'.repeat(65_537));
    expect(kill).toHaveBeenCalledWith('SIGKILL');
    vi.advanceTimersByTime(30_000);
    child.emit('close', 1);
    await rejected;
  });
  it('redacts process failures and missing Docker without forwarding error payloads', async () => {
    const { child } = fixture();
    const result = dockerCommand(['inspect']);
    const rejected = expect(result).rejects.toThrow('Local executor operation failed');
    child.emit('error', new Error('private detail'));
    child.emit('close', -1);
    await rejected;
  });
});
