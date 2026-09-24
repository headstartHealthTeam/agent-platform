import { describe, expect, it, vi } from 'vitest';

import { readSchema } from './operations.js';
import { fingerprint, OpenAIResourceMissingError, type OpenAIPlatform } from './platform.js';
import { SessionLaunchPort } from './session-launch.js';

const target = { organizationId: 'org-synthetic', projectId: 'proj_synthetic' };
const identity = {
  target: fingerprint(target),
  requestId: 'e248b74d-cbac-489b-9552-b5ac2697198d',
  workflowRevision: 'revision',
};
function session(id: string, matching = true): unknown {
  return {
    id,
    created_at: 1_790_000_000,
    metadata: matching
      ? {
          launch_request: identity.requestId,
          workflow_revision: identity.workflowRevision,
        }
      : {},
    instructions: 'Private content not returned by recovery',
  };
}
function fixture(data: unknown): {
  port: SessionLaunchPort;
  platform: {
    read: ReturnType<typeof vi.fn<OpenAIPlatform['read']>>;
    apply: ReturnType<typeof vi.fn<OpenAIPlatform['apply']>>;
    preflight: ReturnType<typeof vi.fn<OpenAIPlatform['preflight']>>;
  };
} {
  const platform = {
    read: vi.fn<OpenAIPlatform['read']>().mockResolvedValue({ data, fingerprint: 'f' }),
    apply: vi.fn<OpenAIPlatform['apply']>(),
    preflight: vi.fn<OpenAIPlatform['preflight']>(),
  };
  // No launch profile, executor, credential or inference authority is required for recovery.
  return { platform, port: new SessionLaunchPort(platform, target, undefined, 0, []) };
}
describe('read-only launch correlation recovery', () => {
  it('projects only exact session identity and correlation metadata without inference authority', async () => {
    const f = fixture(session('session_a'));
    expect(await f.port.inspectLaunchCandidate(identity.target, 'session_a')).toEqual({
      status: 'candidate',
      candidate: { ...identity, sessionId: 'session_a', createdAt: 1_790_000_000 },
    });
    expect(f.platform.read).toHaveBeenCalledWith({ operation: 'sessions.get', id: 'session_a' });
    expect(f.platform.apply).not.toHaveBeenCalled();
  });
  it.each([null, {}, { launch_request: 'unrelated', workflow_revision: 'revision' }])(
    'returns unrelated only from a valid retrieved resource without launch correlation (%j)',
    async (metadata) => {
      const f = fixture({ id: 'session_a', created_at: 1, metadata });
      expect(await f.port.inspectLaunchCandidate(identity.target, 'session_a')).toEqual({
        status: 'unrelated',
      });
    }
  );
  it('preserves failures and distinguishes a typed missing resource from unavailable reads', async () => {
    const f = fixture(session('wrong_session'));
    await expect(f.port.inspectLaunchCandidate(identity.target, 'session_a')).rejects.toThrow(
      'unconfirmed'
    );
    f.platform.read.mockRejectedValue(new OpenAIResourceMissingError());
    expect(await f.port.inspectLaunchCandidate(identity.target, 'session_a')).toEqual({
      status: 'missing',
    });
    f.platform.read.mockRejectedValue(new Error('private provider error'));
    await expect(f.port.inspectLaunchCandidate(identity.target, 'session_a')).rejects.toThrow(
      'unconfirmed'
    );
    await expect(f.port.inspectLaunchCandidate(identity.target, 'session_a')).rejects.not.toThrow(
      'private'
    );
  });
  it('rejects wrong targets and invalid IDs before reads', async () => {
    const f = fixture(session('session_a'));
    await expect(f.port.inspectLaunchCandidate('foreign', 'session_a')).rejects.toThrow('target');
    await expect(f.port.inspectLaunchCandidate(identity.target, '../other')).rejects.toThrow();
    await expect(
      f.port.discoverLaunchCandidates({ ...identity, target: 'foreign' })
    ).rejects.toThrow('target');
    await expect(f.port.discoverLaunchCandidates(identity, '../other')).rejects.toThrow();
    expect(f.platform.read).not.toHaveBeenCalled();
  });
  it('finds every exact match after a full first page and exposes duplicates without choosing ownership', async () => {
    const f = fixture(null);
    f.platform.read.mockImplementation(async (value) => {
      const read = readSchema.parse(value);
      if (read.operation !== 'sessions.list') throw new Error('Unexpected operation');
      expect(read.query.limit).toBe(100);
      expect(read.query.order).toBe('desc');
      const data =
        read.query.after === undefined
          ? Array.from({ length: 100 }, (_, index) => session(`unrelated_${String(index)}`, false))
          : [session('match_a'), session('match_b')];
      return {
        data: {
          data,
          has_more: read.query.after === undefined,
          last_id: read.query.after === undefined ? 'unrelated_99' : 'match_b',
        },
        fingerprint: 'f',
      };
    });
    const first = await f.port.discoverLaunchCandidates(identity);
    expect(first).toEqual({ candidates: [], nextAfter: 'unrelated_99' });
    if (first.nextAfter === null) throw new Error('Expected continuation');
    const second = await f.port.discoverLaunchCandidates(identity, first.nextAfter);
    expect(second).toEqual({
      candidates: ['match_a', 'match_b'].map((sessionId) => ({
        ...identity,
        sessionId,
        createdAt: 1_790_000_000,
      })),
      nextAfter: null,
    });
    expect(f.platform.read).toHaveBeenCalledTimes(2);
    expect(f.platform.apply).not.toHaveBeenCalled();
  });
  it('requires both request and revision and does not convert an empty observed pass into absence proof', async () => {
    const f = fixture({
      data: [
        {
          id: 'same_request_other_revision',
          created_at: 1,
          metadata: { launch_request: identity.requestId, workflow_revision: 'other' },
        },
      ],
      has_more: false,
      last_id: 'same_request_other_revision',
    });
    expect(await f.port.discoverLaunchCandidates(identity)).toEqual({
      candidates: [],
      nextAfter: null,
    });
    f.platform.read.mockResolvedValue({
      data: { data: [], has_more: false, last_id: null },
      fingerprint: 'f',
    });
    expect(await f.port.discoverLaunchCandidates(identity)).toEqual({
      candidates: [],
      nextAfter: null,
    });
    expect(f.platform.apply).not.toHaveBeenCalled();
  });
  it.each([
    { data: [], has_more: true, last_id: null },
    { data: [session('same')], has_more: true, last_id: 'same' },
    { data: [session('new')], has_more: true, last_id: 'other' },
    { data: [session('new'), session('new')], has_more: false, last_id: 'new' },
    {
      data: [
        { id: 'new', created_at: 'invalid', metadata: { launch_request: identity.requestId } },
      ],
      has_more: false,
      last_id: 'new',
    },
  ])('never advances or falsely completes on malformed/nonadvancing pages (%j)', async (data) => {
    const f = fixture(data);
    await expect(f.port.discoverLaunchCandidates(identity, 'same')).rejects.toThrow(
      'cursor must not advance'
    );
    expect(f.platform.apply).not.toHaveBeenCalled();
  });
});
