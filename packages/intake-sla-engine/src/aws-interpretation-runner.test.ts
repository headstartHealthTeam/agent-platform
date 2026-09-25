import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  runAwsInterpretation,
  type AwsInterpretationRunInput,
  type InterpretationSpawnOptions,
} from './aws-interpretation-runner.js';
import { runAwsInterpretationCommand } from './cli-aws-interpretation.js';

class SyntheticChild extends EventEmitter {
  readonly signals: NodeJS.Signals[] = [];
  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    return true;
  }
}
const env = {
  SLA_AI_INTERPRETATION: 'on',
  SLA_INTERPRETER_PROVIDER: 'openai-responses',
  SLA_INTERPRETER_MODEL: 'gpt-5.6-sol',
  OPENAI_API_KEY: 'inherited-synthetic',
};
let directory: string;
beforeEach(async () => {
  directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-aws-run-')));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
function base(): AwsInterpretationRunInput {
  return {
    action: 'preflight',
    runDirectory: directory,
    cliEntrypoint: path.join(directory, 'dist', 'cli.js'),
    profile: 'synthetic-profile',
    region: 'us-east-1',
    secretId: 'synthetic/secret',
    env,
    executeAws: async () => ({
      stdout: JSON.stringify({ SecretString: 'synthetic-approved-key' }),
    }),
  };
}
describe('approved AWS interpretation child', () => {
  it('composes the command without exposing exception bodies or interpreting unknown actions', async () => {
    const run = vi.fn<(input: AwsInterpretationRunInput) => Promise<number>>(async () => 2);
    const args = [
      '--action',
      'preflight',
      '--run-dir',
      directory,
      '--profile',
      'synthetic-profile',
      '--region',
      'us-east-1',
      '--secret-id',
      'synthetic/secret',
    ];
    expect(await runAwsInterpretationCommand(args, run)).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: '',
    });
    expect(run.mock.calls[0]?.[0]).toMatchObject({
      action: 'preflight',
      runDirectory: directory,
      profile: 'synthetic-profile',
    });
    for (const invalid of [
      [],
      ['--action', 'unknown'],
      ['--action', 'interpret', '--run-dir', directory],
    ]) {
      expect(await runAwsInterpretationCommand(invalid, run)).toEqual({
        exitCode: 1,
        stdout: '',
        stderr: '{"code":"AWS_OPENAI_RUN_FAILED"}\n',
      });
    }
    run.mockRejectedValueOnce(new Error('private diagnostic body'));
    expect((await runAwsInterpretationCommand(args, run)).stderr).toBe(
      '{"code":"AWS_OPENAI_RUN_FAILED"}\n'
    );
    run.mockRejectedValueOnce(new Error('AWS_OPENAI_CREDENTIAL_UNAVAILABLE'));
    expect((await runAwsInterpretationCommand(args, run)).stderr).toBe(
      '{"code":"AWS_OPENAI_CREDENTIAL_UNAVAILABLE"}\n'
    );
    await runAwsInterpretationCommand(
      ['--action', 'interpret', '--run-dir', directory, '--prior-run-dir', 'prior'],
      run
    );
    expect(run.mock.lastCall?.[0].priorRunDirectory).toBe('prior');
  });
  it('launches a real synthetic Node child with the default spawn and no provider access', async () => {
    const entrypoint = path.join(directory, 'synthetic-child.mjs');
    const receipt = path.join(directory, 'synthetic-child-receipt.json');
    await fs.writeFile(
      entrypoint,
      `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({ approved: process.env.OPENAI_API_KEY === 'synthetic-approved-key', args: process.argv.slice(2), cwd: process.cwd() }));\n`
    );
    expect(await runAwsInterpretation({ ...base(), cliEntrypoint: entrypoint })).toBe(0);
    expect(JSON.parse(await fs.readFile(receipt, 'utf8'))).toEqual({
      approved: true,
      args: ['review:ai-preflight', '--run-dir', directory],
      cwd: directory,
    });
  });
  it('launches only the selected built route with private paths and ephemeral environment', async () => {
    for (const action of ['preflight', 'interpret'] as const) {
      const child = new SyntheticChild();
      const spawnChild = vi.fn(
        (_command: string, _args: readonly string[], options: InterpretationSpawnOptions) => {
          expect(options.env['OPENAI_API_KEY']).toBe('synthetic-approved-key');
          expect(options.env['SLA_APPROVED_CREDENTIAL_SOURCE']).toBe(
            'aws-secrets-manager:synthetic/secret'
          );
          queueMicrotask(() => child.emit('close', 0));
          return child;
        }
      );
      const input = {
        ...base(),
        action,
        priorRunDirectory: path.join(directory, 'prior'),
        spawnChild,
      };
      expect(await runAwsInterpretation(input)).toBe(0);
      const call = spawnChild.mock.calls[0];
      expect(call?.[0]).toBe(process.execPath);
      expect(call?.[1]).toEqual([
        input.cliEntrypoint,
        action === 'preflight' ? 'review:ai-preflight' : 'review:interpret-delta',
        '--run-dir',
        directory,
        ...(action === 'interpret' ? ['--prior-run-dir', input.priorRunDirectory] : []),
      ]);
      expect(call?.[2]).toMatchObject({ cwd: path.dirname(input.cliEntrypoint), stdio: 'inherit' });
      expect(call?.[2].env['OPENAI_API_KEY']).toBeUndefined();
      expect(JSON.stringify(call?.[1])).not.toContain('synthetic-approved-key');
      expect(env.OPENAI_API_KEY).toBe('inherited-synthetic');
    }
  });
  it('forwards both cancellation signals and returns the child exit status', async () => {
    const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
    for (const code of [2, null]) {
      const child = new SyntheticChild();
      const result = await runAwsInterpretation({
        ...base(),
        spawnChild: () => {
          queueMicrotask(() => {
            process.emit('SIGINT');
            process.emit('SIGTERM');
            child.emit('close', code);
          });
          return child;
        },
      });
      expect(result).toBe(code ?? 1);
      expect(child.signals).toEqual(['SIGINT', 'SIGTERM']);
    }
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(before);
  });
  it('cleans the environment and listeners after launch errors', async () => {
    const child = new SyntheticChild();
    let captured: NodeJS.ProcessEnv | undefined;
    await expect(
      runAwsInterpretation({
        ...base(),
        spawnChild: (_command, _args, options) => {
          captured = options.env;
          queueMicrotask(() => {
            child.emit('error', new Error('synthetic launch failure'));
            child.emit('close', null);
          });
          return child;
        },
      })
    ).rejects.toThrow('synthetic launch failure');
    expect(captured?.['OPENAI_API_KEY']).toBeUndefined();
    await expect(
      runAwsInterpretation({
        ...base(),
        spawnChild: () => {
          throw new Error('synchronous launch failure');
        },
      })
    ).rejects.toThrow('synchronous launch failure');
  });
  it('rejects invalid runs before credential retrieval and never falls back after AWS failure', async () => {
    const executeAws = vi.fn(base().executeAws);
    await expect(
      runAwsInterpretation({ ...base(), action: 'interpret', executeAws })
    ).rejects.toThrow('Invalid interpretation');
    await fs.writeFile(path.join(directory, 'publication-readback.json'), '{}');
    await expect(runAwsInterpretation({ ...base(), executeAws })).rejects.toThrow('immutable');
    expect(executeAws).not.toHaveBeenCalled();
    await fs.unlink(path.join(directory, 'publication-readback.json'));
    const spawnChild = vi.fn(() => new SyntheticChild());
    await expect(
      runAwsInterpretation({
        ...base(),
        executeAws: async () => {
          throw new Error('synthetic private body');
        },
        spawnChild,
      })
    ).rejects.toThrow('AWS_OPENAI_CREDENTIAL_UNAVAILABLE');
    expect(spawnChild).not.toHaveBeenCalled();
  });
});
