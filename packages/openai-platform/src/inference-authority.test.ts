import type { AgentInferenceRequest } from '@headstart-health/workflow-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireInferenceAuthority } from './inference-authority.js';

const request: AgentInferenceRequest = {
  operation: 'launch',
  identity: { requestId: 'invented-request', target: 'invented-target', workflowRevision: 'v1' },
};
afterEach(() => vi.useRealTimers());

describe('inference authority', () => {
  it('retains finite development deadlines, including the exact expiration boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    await expect(requireInferenceAuthority(1001, request)).resolves.toBeUndefined();
    for (const expiry of [0, 1000, NaN, Infinity, -Infinity])
      await expect(requireInferenceAuthority(expiry, request)).rejects.toThrow(
        'No current inference authorization'
      );
  });

  it('uses fresh owning-application decisions after a multi-day absence', async () => {
    vi.useFakeTimers();
    const authorize = vi.fn().mockResolvedValue(true);
    await requireInferenceAuthority({ authorize }, request);
    vi.setSystemTime(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await requireInferenceAuthority({ authorize }, request);
    expect(authorize.mock.calls).toEqual([[request], [request]]);
    authorize.mockResolvedValue(false);
    await expect(requireInferenceAuthority({ authorize }, request)).rejects.toThrow(
      'No current inference authorization'
    );
  });

  it('fails closed and sanitizes an unavailable policy without caching approval', async () => {
    const authorize = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('protected application detail'));
    await requireInferenceAuthority({ authorize }, request);
    await expect(requireInferenceAuthority({ authorize }, request)).rejects.toThrow(
      /^No current inference authorization$/
    );
  });
});
