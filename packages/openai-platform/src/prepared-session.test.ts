import type {
  AgentInferenceAuthorizer,
  AgentSessionReceipt,
  AgentWorkspaceFile,
} from '@headstart-health/workflow-contracts';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { readSchema, actionSchema } from './operations.js';
import { fingerprint, type OpenAIPlatform } from './platform.js';
import { PreparedSessionPort } from './prepared-session.js';

const target = { organizationId: 'org-fictional', projectId: 'proj_fictional' };
const receipt: AgentSessionReceipt = {
  sessionId: 'session-fictional',
  target: fingerprint(target),
  workflowRevision: 'revision',
  requestId: '10000000-0000-4000-8000-000000000001',
};
function fixture(): {
  session: {
    id: string;
    status: string;
    metadata: { launch_request: string; workflow_revision: string; deferred_input: string };
    environment: { type: string; id: string };
  };
  environment: { object: string; id: string; type: string; status: string };
  turns: unknown[];
  authority: { authorize: Mock<AgentInferenceAuthorizer['authorize']> };
  platform: {
    read: Mock<OpenAIPlatform['read']>;
    apply: Mock<OpenAIPlatform['apply']>;
    stagePreparedSessionFile: Mock<OpenAIPlatform['stagePreparedSessionFile']>;
  };
  file: AgentWorkspaceFile;
  port: PreparedSessionPort;
} {
  const session = {
    id: receipt.sessionId,
    status: 'idle',
    metadata: {
      launch_request: receipt.requestId,
      workflow_revision: receipt.workflowRevision,
      deferred_input: receipt.requestId,
    },
    environment: { type: 'openai_hosted', id: 'environment-fictional' },
  };
  const environment = {
    object: 'agent.environment',
    id: 'environment-fictional',
    type: 'openai_hosted',
    status: 'connected',
  };
  const turns: unknown[] = [];
  const authority = {
    authorize: vi.fn<AgentInferenceAuthorizer['authorize']>().mockResolvedValue(true),
  };
  const platform = {
    read: vi.fn<OpenAIPlatform['read']>().mockImplementation(async (input) => {
      const request = readSchema.parse(input);
      return {
        fingerprint: 'f',
        data:
          request.operation === 'sessions.get'
            ? session
            : request.operation === 'environments.get'
              ? environment
              : { data: turns, has_more: false },
      };
    }),
    apply: vi
      .fn<OpenAIPlatform['apply']>()
      .mockImplementation(async (_action, _approval, options) => {
        await options?.beforeDispatch?.();
        return { data: {}, fingerprint: 'f' };
      }),
    stagePreparedSessionFile: vi
      .fn<OpenAIPlatform['stagePreparedSessionFile']>()
      .mockImplementation(async (environmentId, file, before) => {
        await before();
        return { environmentId, path: file.path, digest: file.digest, size: file.bytes.length };
      }),
  };
  const file = {
    path: `/workspace/restored-context/${receipt.requestId}/0-${'a'.repeat(64)}`,
    digest: `sha256:${'a'.repeat(64)}`,
    bytes: new Uint8Array([1, 2]),
  };
  return {
    session,
    environment,
    turns,
    authority,
    platform,
    file,
    port: new PreparedSessionPort(platform, target, authority),
  };
}
describe('receipt-bound pre-turn restoration', () => {
  it('stages exact originals without inference and starts once using the durable launch identity', async () => {
    const f = fixture();
    const before = vi.fn(async () => undefined);
    const staged = await f.port.stage(receipt, f.file, before);
    expect(staged).toMatchObject({ path: f.file.path, size: 2 });
    expect(f.platform.apply).not.toHaveBeenCalled();
    expect(before).toHaveBeenCalledOnce();
    expect(await f.port.start(receipt, 'Read the retained originals.', before)).toEqual({
      status: 'accepted',
    });
    expect(actionSchema.parse(f.platform.apply.mock.calls[0]?.[0])).toEqual({
      operation: 'sessions.send',
      id: receipt.sessionId,
      input: 'Read the retained originals.',
      idempotencyKey: `initial-${receipt.requestId}`,
    });
    expect(f.authority.authorize).toHaveBeenCalledTimes(2);
  });
  it.each(['pending', 'ready', 'disconnected', 'expired', 'failed', 'suspended'])(
    'does not transfer or infer while workspace is %s',
    async (status) => {
      const f = fixture();
      f.environment.status = status;
      const before = vi.fn(async () => undefined);
      await expect(f.port.stage(receipt, f.file, before)).rejects.toThrow();
      expect(await f.port.start(receipt, 'Resume.', before)).toEqual({ status: 'not-attempted' });
      expect(f.platform.apply).not.toHaveBeenCalled();
      expect(f.platform.stagePreparedSessionFile).not.toHaveBeenCalled();
      expect(before).not.toHaveBeenCalled();
    }
  );
  it.each(['target', 'session', 'marker', 'history', 'path'])(
    'rejects mismatched %s',
    async (kind) => {
      const f = fixture();
      const owned = { ...receipt };
      if (kind === 'target') owned.target = 'another-target';
      if (kind === 'session') f.session.id = 'another-session';
      if (kind === 'marker') f.session.metadata.deferred_input = 'another-attempt';
      if (kind === 'history') f.turns.push({ id: 'prior-turn' });
      if (kind === 'path') f.file.path = '/workspace/runtime/overwrite';
      await expect(f.port.stage(owned, f.file, async () => undefined)).rejects.toThrow();
      expect(f.platform.stagePreparedSessionFile).not.toHaveBeenCalled();
    }
  );
  it('rechecks authorization after the journal and distinguishes an uncertain dispatch', async () => {
    const f = fixture();
    expect(
      await f.port.start(receipt, 'Resume.', async () => {
        f.authority.authorize.mockResolvedValue(false);
      })
    ).toEqual({ status: 'not-attempted' });
    f.authority.authorize.mockResolvedValue(true);
    f.platform.apply.mockImplementation(async (_action, _approval, options) => {
      await options?.beforeDispatch?.();
      throw new Error('private provider diagnostic');
    });
    expect(await f.port.start(receipt, 'Resume.', async () => undefined)).toEqual({
      status: 'unknown',
    });
    expect(f.platform.apply).toHaveBeenCalledTimes(2);
  });
  it('does not cross dispatch when owner persistence fails or another turn appears', async () => {
    const f = fixture();
    expect(
      await f.port.start(receipt, 'Resume.', async () => {
        throw new Error('storage unavailable');
      })
    ).toEqual({ status: 'not-attempted' });
    expect(
      await f.port.start(receipt, 'Resume.', async () => {
        f.turns.push({ id: 'concurrent' });
      })
    ).toEqual({ status: 'not-attempted' });
  });
});
