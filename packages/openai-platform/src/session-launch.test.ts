import type { AgentLaunchRequest } from '@headstart-health/workflow-contracts';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { actionSchema, readSchema } from './operations.js';
import { fingerprint, type OpenAIPlatform } from './platform.js';
import { SessionLaunchPort } from './session-launch.js';

const target = { organizationId: 'org-invented', projectId: 'proj_invented' };
const request: AgentLaunchRequest = {
  requestId: 'e248b74d-cbac-489b-9552-b5ac2697198d',
  workflowRevision: 'revision',
  input: 'Inspect this invented case.',
  definition: {
    instructions: 'Use only the scoped tools.',
    tools: [
      {
        type: 'function',
        name: 'publish',
        description: 'Save an invented result.',
        parameters: { type: 'object' },
      },
    ],
  },
};
const receipt = {
  sessionId: 'session',
  target: fingerprint(target),
  workflowRevision: request.workflowRevision,
  requestId: request.requestId,
};
function setup(): {
  session: { id: string; metadata: { workflow_revision: string; launch_request: string } };
  roots: { id: string; session_id: string; subagent_id: null }[];
  platform: { apply: Mock<OpenAIPlatform['apply']>; read: Mock<OpenAIPlatform['read']> };
  settings: {
    model: string;
    reasoning: { effort: string };
    environment: { type: string; workspace_directory: string };
    mcpServers: unknown[];
  };
  port: SessionLaunchPort;
} {
  const session = {
    id: 'session',
    metadata: { workflow_revision: 'revision', launch_request: request.requestId },
  };
  const roots = [{ id: 'turn', session_id: 'session', subagent_id: null }];
  const platform = {
    apply: vi.fn<OpenAIPlatform['apply']>().mockResolvedValue({ data: session, fingerprint: 'f' }),
    read: vi.fn<OpenAIPlatform['read']>().mockImplementation(async (operation) => ({
      data:
        readSchema.parse(operation).operation === 'sessions.get'
          ? session
          : { data: roots, has_more: false },
      fingerprint: 'f',
    })),
  };
  const settings = {
    model: 'synthetic-model',
    reasoning: { effort: 'high' },
    environment: { type: 'self_hosted', workspace_directory: '/workspace' },
    mcpServers: [],
  };
  return {
    platform,
    settings,
    session,
    roots,
    port: new SessionLaunchPort(platform, target, settings, Date.now() + 60_000, ['publish'], {
      ensure: vi.fn(),
      stop: vi.fn(),
    }),
  };
}
describe('application session launch', () => {
  it('requires a provisioner before self-hosted creation, but never provisions before a durable receipt', async () => {
    const { platform, settings } = setup();
    await expect(
      new SessionLaunchPort(platform, target, settings, Date.now() + 60_000, [
        'publish',
      ]).createSession(request)
    ).rejects.toThrow('executor is not configured');
    expect(platform.apply).not.toHaveBeenCalled();
    const executor = { ensure: vi.fn(), stop: vi.fn() };
    await new SessionLaunchPort(
      platform,
      target,
      settings,
      Date.now() + 60_000,
      ['publish'],
      executor
    ).createSession(request);
    expect(executor.ensure).not.toHaveBeenCalled();
  });
  it('starts the exact owned environment and reconnects only for a current connection request', async () => {
    const { platform, settings } = setup();
    const executor = { ensure: vi.fn(), stop: vi.fn() };
    const expiry = Date.now() + 60_000;
    const port = new SessionLaunchPort(platform, target, settings, expiry, ['publish'], executor);
    const session = {
      id: 'session',
      metadata: { workflow_revision: 'revision', launch_request: request.requestId },
      status: 'idle',
      environment: {
        type: 'self_hosted',
        id: 'env-invented',
        remote_url: 'https://api.openai.com/v1/agents/api/connect/invented',
      },
      required_actions: [{ type: 'function_call' }],
    };
    platform.read.mockResolvedValue({ data: session, fingerprint: 'f' });
    await port.reconcileEnvironment(receipt, 'start');
    expect(executor.ensure).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session', environmentId: 'env-invented' }),
      expiry
    );
    executor.ensure.mockClear();
    await port.reconcileEnvironment(receipt, 'reconcile');
    expect(executor.ensure).not.toHaveBeenCalled();
    expect(executor.stop).not.toHaveBeenCalled(); // Idle/function waits must retain compute.
    session.required_actions = [{ type: 'environment_connection' }];
    await port.reconcileEnvironment(receipt, 'reconcile');
    expect(executor.ensure).toHaveBeenCalledTimes(1);
    session.status = 'failed';
    await port.reconcileEnvironment(receipt, 'reconcile');
    expect(executor.stop).toHaveBeenCalledWith('session');
    session.environment.type = 'openai';
    session.status = 'idle';
    executor.ensure.mockClear();
    await port.reconcileEnvironment(receipt, 'start');
    expect(executor.ensure).not.toHaveBeenCalled();
    session.metadata.launch_request = 'foreign';
    await expect(port.reconcileEnvironment(receipt, 'reconcile')).rejects.toThrow();
    await expect(
      port.reconcileEnvironment({ ...receipt, target: 'foreign' }, 'stop')
    ).rejects.toThrow('target');
    expect(platform.apply).not.toHaveBeenCalled();
  });
  it('releases only owned compute on Stop/expiry even when the provider is unavailable', async () => {
    const { platform, settings } = setup();
    const executor = { ensure: vi.fn(), stop: vi.fn() };
    const port = new SessionLaunchPort(platform, target, settings, 0, ['publish'], executor);
    platform.read.mockRejectedValue(new Error('provider offline'));
    await port.reconcileEnvironment(receipt, 'stop');
    await expect(port.reconcileEnvironment(receipt, 'start')).rejects.toThrow('expired');
    expect(executor.stop).toHaveBeenCalledTimes(2);
    expect(executor.ensure).not.toHaveBeenCalled();
    expect(platform.read).not.toHaveBeenCalled();
    expect(platform.apply).not.toHaveBeenCalled();
  });
  it('creates exactly once with canonical instructions and durable caller correlation', async () => {
    const { port, platform } = setup();
    expect(await port.createSession(request)).toEqual(receipt);
    expect(platform.apply).toHaveBeenCalledTimes(1);
    const call = platform.apply.mock.calls[0];
    if (!call) throw new Error('Expected session creation');
    expect(actionSchema.parse(call[0])).toMatchObject({
      operation: 'sessions.create',
      body: {
        input: request.input,
        metadata: { workflow_revision: 'revision', launch_request: request.requestId },
        agent: { instructions: request.definition.instructions, tools: request.definition.tools },
      },
    });
    expect(call[1].allowBillable).toBe(true);
    expect(await port.inspectSession(receipt)).toEqual({
      sessionId: 'session',
      turnId: 'turn',
      target: receipt.target,
      workflowRevision: 'revision',
    });
    expect(platform.apply).toHaveBeenCalledTimes(1);
  });
  it('does not replay a failed create and rejects missing authority and undeclared handlers', async () => {
    const { port, platform, settings } = setup();
    platform.apply.mockRejectedValue(new Error('uncertain'));
    await expect(port.createSession(request)).rejects.toThrow('uncertain');
    expect(platform.apply).toHaveBeenCalledTimes(1);
    await expect(
      new SessionLaunchPort(platform, target, settings, 0, ['publish']).createSession(request)
    ).rejects.toThrow('expired');
    await expect(
      new SessionLaunchPort(platform, target, settings, Date.now() + 60_000, []).createSession(
        request
      )
    ).rejects.toThrow('Unregistered');
  });
  it('rejects configuration masquerading as MCP, wrong provenance, and ambiguous roots', async () => {
    const { port, platform, settings, session, roots } = setup();
    await expect(
      new SessionLaunchPort(
        platform,
        target,
        { ...settings, mcpServers: [request.definition.tools[0]] },
        Date.now() + 60_000,
        ['publish']
      ).createSession(request)
    ).rejects.toThrow('Only native MCP');
    await expect(port.inspectSession({ ...receipt, target: 'other' })).rejects.toThrow('target');
    session.metadata.launch_request = 'other';
    await expect(port.inspectSession(receipt)).rejects.toThrow();
    session.metadata.launch_request = request.requestId;
    roots.push({ id: 'other', session_id: 'session', subagent_id: null });
    await expect(port.inspectSession(receipt)).rejects.toThrow('additional roots');
    expect(platform.apply).not.toHaveBeenCalled();
  });
  it('waits without resending if the root is not yet visible, and cancels only the owned session', async () => {
    const { port, platform, roots } = setup();
    roots.length = 0;
    expect(await port.inspectSession(receipt)).toBeNull();
    await port.cancelSession(receipt);
    expect(platform.apply).toHaveBeenCalledWith(
      { operation: 'sessions.cancel', id: 'session' },
      expect.objectContaining({ allowBillable: false })
    );
  });
});
