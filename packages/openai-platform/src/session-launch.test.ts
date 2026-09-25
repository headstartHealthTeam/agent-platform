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
const createOptions = { expectedTarget: receipt.target };
function setup(): {
  session: {
    id: string;
    status: string;
    metadata: { workflow_revision: string; launch_request: string };
  };
  roots: { id: string; session_id: string; subagent_id: null }[];
  platform: {
    apply: Mock<OpenAIPlatform['apply']>;
    read: Mock<OpenAIPlatform['read']>;
    preflight: Mock<OpenAIPlatform['preflight']>;
  };
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
    status: 'in_progress',
    metadata: { workflow_revision: 'revision', launch_request: request.requestId },
  };
  const roots = [{ id: 'turn', session_id: 'session', subagent_id: null }];
  const platform = {
    preflight: vi
      .fn<OpenAIPlatform['preflight']>()
      .mockResolvedValue({ projectId: target.projectId, agentsRead: true }),
    apply: vi
      .fn<OpenAIPlatform['apply']>()
      .mockImplementation(async (action, _approval, options) => {
        await options?.beforeDispatch?.();
        if (actionSchema.parse(action).operation === 'sessions.cancel') session.status = 'idle';
        return { data: session, fingerprint: 'f' };
      }),
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
  it.each(['self_hosted', 'none', 'openai_hosted'])(
    'attaches per-run service credentials without mutating shared settings (%s)',
    async (environment) => {
      const { platform, settings } = setup();
      const server = {
        type: 'mcp',
        server_label: 'source',
        connection_origin: 'service',
        required: true,
        allowed_tools: ['read_inventory'],
        transport: { type: 'http', server_url: 'https://example.com/mcp' },
      };
      const referenceServer = {
        ...server,
        server_label: 'references',
        transport: { type: 'http', server_url: 'https://references.example.com/mcp' },
      };
      const configured = {
        ...settings,
        environment:
          environment === 'self_hosted'
            ? settings.environment
            : environment === 'none'
              ? { type: 'none' }
              : {
                  type: 'openai_hosted',
                  packages: { npm: ['pnpm@9.15.0'] },
                  env: { HEADSTART_TOOLS_ROOT: '/workspace/tools' },
                  files: [{ type: 'inline', path: '/workspace/config.json', data: 'e30=' }],
                  setup_commands: [{ command: 'node --version' }],
                },
        mcpServers: [server, referenceServer],
      };
      const port = new SessionLaunchPort(
        platform,
        target,
        configured,
        Date.now() + 60000,
        ['publish'],
        environment === 'self_hosted' ? { ensure: vi.fn(), stop: vi.fn() } : undefined
      );
      const credential = {
        serverLabel: 'source',
        audience: 'https://example.com/mcp',
        authorization: 'Bearer invented-run-only',
        allowedTools: ['read_inventory'],
      };
      const descriptor = {
        serverLabel: credential.serverLabel,
        audience: credential.audience,
        allowedTools: credential.allowedTools,
      };
      expect(await port.preflightLaunch(request, [descriptor])).toEqual({ target: receipt.target });
      expect(platform.preflight).toHaveBeenCalledTimes(1);
      expect(platform.apply).not.toHaveBeenCalled();
      await port.createSession(request, [credential], createOptions);
      const action = actionSchema.parse(platform.apply.mock.calls[0]?.[0]);
      if (action.operation !== 'sessions.create' || !('agent' in action.body))
        throw new Error('Expected inline session');
      expect(action.body.environment).toEqual(configured.environment);
      expect(action.body.agent.tools).toContainEqual({
        ...server,
        transport: { ...server.transport, authorization: credential.authorization },
      });
      expect(action.body.agent.tools).toContainEqual(referenceServer);
      expect(JSON.stringify(configured)).not.toContain(credential.authorization);
      expect(JSON.stringify(request)).not.toContain(credential.authorization);
    }
  );
  it.each([
    'wrong audience',
    'wrong tools',
    'duplicate',
    'missing',
    'inline secret',
    'environment origin',
  ])('rejects %s before API creation', async (scenario) => {
    const { platform, settings } = setup();
    const server = {
      type: 'mcp',
      server_label: 'source',
      connection_origin: scenario === 'environment origin' ? 'environment' : 'service',
      required: true,
      allowed_tools: ['read_inventory'],
      transport: {
        type: 'http',
        server_url: 'https://example.com/mcp',
        ...(scenario === 'inline secret' ? { authorization: 'Bearer existing' } : {}),
      },
    };
    const credential = {
      serverLabel: 'source',
      audience:
        scenario === 'wrong audience' ? 'https://other.example/mcp' : 'https://example.com/mcp',
      authorization: 'Bearer invented',
      allowedTools: scenario === 'wrong tools' ? ['other'] : ['read_inventory'],
    };
    const credentials =
      scenario === 'missing'
        ? []
        : scenario === 'duplicate'
          ? [credential, credential]
          : [credential];
    const port = new SessionLaunchPort(
      platform,
      target,
      { ...settings, mcpServers: [server] },
      Date.now() + 60000,
      ['publish'],
      { ensure: vi.fn(), stop: vi.fn() }
    );
    await expect(
      port.preflightLaunch(
        request,
        credentials.map((item) => ({
          serverLabel: item.serverLabel,
          audience: item.audience,
          allowedTools: item.allowedTools,
        }))
      )
    ).rejects.toThrow('no session creation');
    expect(platform.preflight).not.toHaveBeenCalled();
    await expect(port.createSession(request, credentials, createOptions)).resolves.toEqual({
      status: 'not-attempted',
      reason: 'validation',
    });
    expect(platform.apply).not.toHaveBeenCalled();
  });
  it('requires a provisioner before self-hosted creation, but never provisions before a durable receipt', async () => {
    const { platform, settings } = setup();
    await expect(
      new SessionLaunchPort(platform, target, settings, Date.now() + 60_000, [
        'publish',
      ]).createSession(request, undefined, createOptions)
    ).resolves.toEqual({ status: 'not-attempted', reason: 'validation' });
    expect(platform.apply).not.toHaveBeenCalled();
    const executor = { ensure: vi.fn(), stop: vi.fn() };
    await new SessionLaunchPort(
      platform,
      target,
      settings,
      Date.now() + 60_000,
      ['publish'],
      executor
    ).createSession(request, undefined, createOptions);
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
    expect(await port.createSession(request, undefined, createOptions)).toEqual({
      status: 'created',
      receipt,
    });
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
    platform.apply.mockImplementation(async (_action, _approval, options) => {
      await options?.beforeDispatch?.();
      throw new Error('uncertain');
    });
    await expect(port.createSession(request, undefined, createOptions)).resolves.toEqual({
      status: 'unknown',
      reason: 'provider-outcome',
    });
    expect(platform.apply).toHaveBeenCalledTimes(1);
    await expect(
      new SessionLaunchPort(platform, target, settings, 0, ['publish']).createSession(
        request,
        undefined,
        createOptions
      )
    ).resolves.toEqual({ status: 'not-attempted', reason: 'validation' });
    await expect(
      new SessionLaunchPort(platform, target, settings, Date.now() + 60_000, []).createSession(
        request,
        undefined,
        createOptions
      )
    ).resolves.toEqual({ status: 'not-attempted', reason: 'validation' });
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
      ).createSession(request, undefined, createOptions)
    ).resolves.toEqual({ status: 'not-attempted', reason: 'validation' });
    await expect(port.inspectSession({ ...receipt, target: 'other' })).rejects.toThrow('target');
    session.metadata.launch_request = 'other';
    await expect(port.inspectSession(receipt)).rejects.toThrow();
    session.metadata.launch_request = request.requestId;
    roots.push({ id: 'other', session_id: 'session', subagent_id: null });
    await expect(port.inspectSession(receipt)).rejects.toThrow('additional roots');
    expect(platform.apply).not.toHaveBeenCalled();
  });
  it.each([
    { scenario: 'valid history', error: null },
    { scenario: 'additional root', error: 'additional roots' },
    { scenario: 'foreign session', error: 'session_id' },
    { scenario: 'invalid turn identity', error: '"id"' },
    { scenario: 'invalid subagent identity', error: 'subagent_id' },
    { scenario: 'nonadvancing cursor', error: 'cursor' },
    { scenario: 'interrupted delivery', error: 'Turn page unavailable' },
  ])(
    'inspects every turn page before recovering an unbound session: $scenario',
    async ({ scenario, error }) => {
      const { platform, session } = setup();
      // Recovery needs only the saved receipt, not launch settings or fresh inference authority.
      const port = new SessionLaunchPort(platform, target, undefined, 0, []);
      const turns = Array.from({ length: 100 }, (_, index) => ({
        id: `turn_${String(index)}`,
        session_id: receipt.sessionId,
        subagent_id: index === 0 ? null : `subagent_${String(index)}`,
      }));
      platform.read.mockImplementation(async (input) => {
        const operation = readSchema.parse(input);
        if (operation.operation === 'sessions.get') return { data: session, fingerprint: 'f' };
        if (operation.operation !== 'sessions.turns') throw new Error('Unexpected operation');
        if (operation.query.after === undefined)
          return {
            data: { data: turns, has_more: true, last_id: 'turn_99' },
            fingerprint: 'f',
          };
        if (operation.query.after !== 'turn_99') throw new Error('Unexpected cursor');
        if (scenario === 'interrupted delivery') throw new Error('Turn page unavailable');
        return {
          data: {
            data: [
              {
                id: scenario === 'invalid turn identity' ? '' : 'turn_100',
                session_id: scenario === 'foreign session' ? 'other' : receipt.sessionId,
                subagent_id:
                  scenario === 'additional root'
                    ? null
                    : scenario === 'invalid subagent identity'
                      ? 100
                      : 'subagent_100',
              },
            ],
            has_more: scenario === 'nonadvancing cursor',
            last_id: 'turn_99',
          },
          fingerprint: 'f',
        };
      });
      const inspected = port.inspectSession(receipt);
      if (error === null)
        await expect(inspected).resolves.toEqual({
          sessionId: receipt.sessionId,
          turnId: 'turn_0',
          target: receipt.target,
          workflowRevision: receipt.workflowRevision,
        });
      else await expect(inspected).rejects.toThrow(error);
      expect(platform.read).toHaveBeenCalledTimes(3);
      expect(platform.read).toHaveBeenLastCalledWith({
        operation: 'sessions.turns',
        id: receipt.sessionId,
        query: { limit: 100, order: 'asc', after: 'turn_99' },
      });
      expect(platform.apply).not.toHaveBeenCalled();
      expect(platform.preflight).not.toHaveBeenCalled();
    }
  );
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
