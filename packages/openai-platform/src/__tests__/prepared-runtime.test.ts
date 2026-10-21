import { describe, expect, it, vi } from 'vitest';

import { parseAction, type Action } from '../operations.js';
import { verifyPreparedRuntime } from '../prepared-runtime.js';

const revision = 'a'.repeat(64);
const fingerprint = 'b'.repeat(64);
function action(
  environment: Record<string, unknown> = {
    type: 'openai_hosted',
    environment_template_id: 'env_template',
  }
): Extract<Action, { operation: 'sessions.create' }> {
  const parsed = parseAction({
    operation: 'sessions.create',
    body: { agent: { model: 'synthetic' }, input: 'synthetic', environment },
  });
  if (parsed.operation !== 'sessions.create') throw new Error('Invalid test action');
  return parsed;
}
describe('prepared hosted runtime', () => {
  it('preserves legacy inline/local launches without a template read', async () => {
    const read = vi.fn();
    await verifyPreparedRuntime({ read }, action(), undefined, undefined, true);
    expect(read).not.toHaveBeenCalled();
  });
  it('verifies the exact provider template snapshot and runtime revision', async () => {
    const read = vi.fn().mockResolvedValue({ data: {}, fingerprint });
    await verifyPreparedRuntime(
      { read },
      action(),
      revision,
      { revision, templateFingerprint: fingerprint },
      false
    );
    expect(read).toHaveBeenCalledWith({ operation: 'templates.get', id: 'env_template' });
    await expect(
      verifyPreparedRuntime(
        { read },
        action(),
        'c'.repeat(64),
        { revision, templateFingerprint: fingerprint },
        false
      )
    ).rejects.toThrow('revision mismatch');
    read.mockResolvedValue({ data: {}, fingerprint: 'd'.repeat(64) });
    await expect(
      verifyPreparedRuntime(
        { read },
        action(),
        revision,
        { revision, templateFingerprint: fingerprint },
        false
      )
    ).rejects.toThrow('template changed');
  });
  it.each(['files', 'packages', 'setup_commands', 'capability_directories'])(
    'rejects a per-run %s replacement',
    async (field) => {
      const read = vi.fn();
      await expect(
        verifyPreparedRuntime(
          { read },
          action({ type: 'openai_hosted', environment_template_id: 'env_template', [field]: null }),
          revision,
          { revision, templateFingerprint: fingerprint },
          false
        )
      ).rejects.toThrow('unmodified hosted template');
      expect(read).not.toHaveBeenCalled();
    }
  );
});
