import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CodexSdkExecutor, type CodexTurnResult } from './executor.js';

interface CapturedInvocation {
  args: string[];
  input: string;
}

const temporaryDirectories: string[] = [];

const createFakeCodexExecutable = (directory: string): string => {
  const scriptFile = path.join(directory, 'exec');
  const captureScript = `
const fs = require('node:fs');
const path = require('node:path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(
    process.env.FAKE_CODEX_CAPTURE,
    JSON.stringify({ args: [path.basename(process.argv[1]), ...process.argv.slice(2)], input }),
  );
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'thread-synthetic' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'item.completed',
    item: { id: 'item-synthetic', type: 'agent_message', text: '{"status":"ok"}' },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 3, cached_input_tokens: 0, output_tokens: 2 },
  }) + '\\n');
});
`;
  fs.writeFileSync(scriptFile, captureScript);
  return process.execPath;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('CodexSdkExecutor SDK subprocess contract', () => {
  it('passes the declared policy to the Codex CLI and consumes its JSON event stream', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headstart-codex-sdk-'));
    temporaryDirectories.push(directory);
    const captureFile = path.join(directory, 'invocation.json');
    const executable = createFakeCodexExecutable(directory);
    const executor = new CodexSdkExecutor({
      codexPathOverride: executable,
      environment: { FAKE_CODEX_CAPTURE: captureFile },
    });
    const originalWorkingDirectory = process.cwd();

    const result = await (async (): Promise<CodexTurnResult> => {
      try {
        process.chdir(directory);
        return await executor.execute({
          prompt: 'Return one synthetic status object.',
          outputSchema: {
            type: 'object',
            properties: { status: { type: 'string' } },
            required: ['status'],
            additionalProperties: false,
          },
          workingDirectory: directory,
          model: 'synthetic-model',
          reasoningEffort: 'medium',
          sandbox: 'read-only',
          networkAccess: 'disabled',
          timeoutSeconds: 5,
          emitEvents: false,
        });
      } finally {
        process.chdir(originalWorkingDirectory);
      }
    })();

    const captured = JSON.parse(fs.readFileSync(captureFile, 'utf8')) as CapturedInvocation;
    expect(result).toEqual({
      threadId: 'thread-synthetic',
      finalResponse: '{"status":"ok"}',
      usage: {
        input_tokens: 3,
        cached_input_tokens: 0,
        cache_write_input_tokens: 0,
        output_tokens: 2,
      },
    });
    expect(captured.input).toBe('Return one synthetic status object.');
    expect(captured.args).toEqual(
      expect.arrayContaining([
        'exec',
        '--experimental-json',
        '--model',
        'synthetic-model',
        '--sandbox',
        'read-only',
        '--cd',
        directory,
        '--output-schema',
      ])
    );
    expect(captured.args).toContain('model_reasoning_effort="medium"');
    expect(captured.args).toContain('sandbox_workspace_write.network_access=false');
    expect(captured.args).toContain('approval_policy="never"');
  });
});
