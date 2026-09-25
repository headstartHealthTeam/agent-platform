import type {
  AgentCredentialVault,
  AgentSessionCreateOptions,
} from '@headstart-health/workflow-contracts';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';

import { resolveRuntimeConfig } from './config.js';
import { fingerprint, OpenAIPlatform } from './platform.js';
import { SessionLaunchPort } from './session-launch.js';

const target = { organizationId: 'org-synthetic', projectId: 'proj_synthetic' };
const request = {
  requestId: '00000000-0000-4000-8000-000000000001',
  workflowRevision: 'revision',
  input: 'Inspect invented evidence.',
  definition: { instructions: 'Invented instructions.', tools: [] },
};
const identity = {
  target: fingerprint(target),
  requestId: request.requestId,
  workflowRevision: request.workflowRevision,
};
const credential = {
  serverLabel: 'headstart',
  audience: 'https://mcp.example.com/mcp',
  authorization: 'Bearer invented-run-token',
  allowedTools: ['get_file_original'],
};
const settings = {
  model: 'synthetic-model',
  reasoning: { effort: 'high' },
  environment: {
    type: 'openai_hosted',
    network: { access: 'restricted', allowed_domains: ['mcp.example.com'] },
  },
  mcpServers: [
    {
      type: 'mcp',
      server_label: credential.serverLabel,
      connection_origin: 'service',
      required: true,
      allowed_tools: credential.allowedTools,
      transport: { type: 'http', server_url: credential.audience },
    },
  ],
  runtimeCredentials: [
    { serverLabel: credential.serverLabel, environmentVariable: 'HEADSTART_MCP_AUTHORIZATION' },
  ],
};
const publicCredential = {
  id: 'cred_synthetic',
  vault_id: 'vault_synthetic',
  auth: {
    type: 'environment_variable',
    secret_name: 'HEADSTART_MCP_AUTHORIZATION',
    networking: { type: 'limited', allowed_hosts: ['mcp.example.com'] },
  },
};

interface FixtureState {
  retained: AgentCredentialVault | undefined;
  credentials: unknown[];
  hasMore: boolean;
  fail: string;
  wrongProject: boolean;
  wrongVault: boolean;
  wrongCredential: boolean;
}
function fixture(): {
  calls: { path: string; method: string; body: unknown; headers: Headers }[];
  state: FixtureState;
  platform: OpenAIPlatform;
  retain: Mock<(vault: AgentCredentialVault) => Promise<void>>;
  dispatch: Mock<() => Promise<undefined>>;
  options: () => AgentSessionCreateOptions;
  port: (profile?: unknown) => SessionLaunchPort;
} {
  const calls: { path: string; method: string; body: unknown; headers: Headers }[] = [];
  const state: FixtureState = {
    retained: undefined,
    credentials: [],
    hasMore: false,
    fail: '',
    wrongProject: false,
    wrongVault: false,
    wrongCredential: false,
  };
  const metadata = {
    managed_by: 'headstart-agent-runtime',
    launch_request: request.requestId,
    workflow_revision: request.workflowRevision,
    runtime_target: identity.target,
  };
  function vaultResponse(): Response {
    if (state.fail === 'vault') throw new Error(credential.authorization);
    return Response.json({
      id: 'vault_synthetic',
      metadata: {
        ...metadata,
        launch_request: state.wrongVault
          ? '00000000-0000-4000-8000-000000000002'
          : request.requestId,
      },
    });
  }
  function credentialResponse(): Response {
    state.credentials = [publicCredential]; // Mutation may commit before its reply is lost.
    if (state.fail === 'credential') throw new Error(credential.authorization);
    return Response.json({
      ...publicCredential,
      vault_id: state.wrongCredential ? 'vault_other' : 'vault_synthetic',
    });
  }
  const transport: typeof fetch = async (input, init) => {
    const httpRequest = new Request(input, init);
    const path = new URL(httpRequest.url).pathname;
    const body: unknown = httpRequest.method === 'POST' ? await httpRequest.json() : null;
    calls.push({ path, method: httpRequest.method, body, headers: httpRequest.headers });
    if (path === '/v1/agents')
      return Response.json(
        { data: [], has_more: false },
        {
          headers: { 'openai-project': state.wrongProject ? 'proj_other' : target.projectId },
        }
      );
    if (path === '/v1/vaults' || path === '/v1/vaults/vault_synthetic') return vaultResponse();
    if (path === '/v1/vaults/vault_synthetic/credentials' && httpRequest.method === 'GET')
      return Response.json({ data: state.credentials, has_more: state.hasMore });
    if (path.startsWith('/v1/vaults/vault_synthetic/credentials') && httpRequest.method === 'POST')
      return credentialResponse();
    if (path === '/v1/agents/sessions' && httpRequest.method === 'POST') {
      if (state.fail === 'session') throw new Error(credential.authorization);
      return Response.json({
        id: 'session_synthetic',
        metadata: {
          launch_request: request.requestId,
          workflow_revision: request.workflowRevision,
        },
      });
    }
    throw new Error('Unexpected synthetic request');
  };
  const config = resolveRuntimeConfig({
    profile: {
      schemaVersion: 'headstart-capability-profile/v1',
      id: 'synthetic',
      revision: 'v1',
      bindings: [
        {
          capabilityId: 'openai.agents.read',
          providerId: 'openai-sdk',
          adapterVersion: '0.1.0',
          options: target,
        },
      ],
    },
  });
  const platform = new OpenAIPlatform(config, 'synthetic-application-key', transport);
  const retain = vi.fn(async (vault: AgentCredentialVault) => {
    state.retained = vault;
  });
  const dispatch = vi.fn(async () => undefined);
  const options = (): AgentSessionCreateOptions => ({
    expectedTarget: identity.target,
    retainCredentialVault: retain,
    beforeDispatch: dispatch,
    ...(state.retained ? { credentialVault: state.retained } : {}),
  });
  const port = (profile: unknown = settings): SessionLaunchPort =>
    new SessionLaunchPort(platform, target, profile, Date.now() + 60_000, []);
  return { calls, state, platform, retain, dispatch, options, port };
}

describe('hosted run credential delivery through the official SDK transport', () => {
  it('journals the vault before installing the existing MCP credential, then launches once with its ID', async () => {
    const f = fixture();
    f.retain.mockImplementation(async (vault) => {
      expect(f.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
      f.state.retained = vault;
    });
    expect(await f.port().createSession(request, [credential], f.options())).toMatchObject({
      status: 'created',
    });
    const writes = f.calls.filter((call) => call.method === 'POST');
    expect(writes.map((call) => call.path)).toEqual([
      '/v1/vaults',
      '/v1/vaults/vault_synthetic/credentials',
      '/v1/agents/sessions',
    ]);
    expect(writes[1]?.body).toEqual({
      name: 'HEADSTART_MCP_AUTHORIZATION',
      auth: {
        type: 'environment_variable',
        secret_name: 'HEADSTART_MCP_AUTHORIZATION',
        secret_value: credential.authorization,
        networking: { type: 'limited', allowed_hosts: ['mcp.example.com'] },
      },
    });
    for (const call of writes) {
      expect(call.headers.get('openai-beta')).toBe('agents=v1');
      expect(call.headers.get('authorization')).toBe('Bearer synthetic-application-key');
      expect(call.headers.get('openai-project')).toBe(target.projectId);
    }
    const body = z
      .object({
        vault_ids: z.array(z.string()),
        environment: z.unknown(),
        metadata: z.unknown(),
        agent: z.object({
          tools: z.array(z.object({ transport: z.object({ authorization: z.string() }) })),
        }),
      })
      .parse(writes[2]?.body);
    expect(body.vault_ids).toEqual(['vault_synthetic']);
    expect(body.environment).toEqual(settings.environment);
    expect(body.agent.tools[0]?.transport.authorization).toBe(credential.authorization);
    expect(
      JSON.stringify({
        environment: body.environment,
        metadata: body.metadata,
        retained: f.state.retained,
        request,
      })
    ).not.toContain(credential.authorization);
    expect(f.dispatch).toHaveBeenCalledTimes(1);
  });
  it('resumes saved setup after a lost credential reply without making a second vault or duplicating credentials', async () => {
    const f = fixture();
    f.state.fail = 'credential';
    expect(await f.port().createSession(request, [credential], f.options())).toEqual({
      status: 'not-attempted',
      reason: 'preflight',
    });
    expect(f.dispatch).not.toHaveBeenCalled();
    f.state.fail = '';
    expect(
      await f
        .port()
        .createSession(
          request,
          [{ ...credential, authorization: 'Bearer replacement-before-dispatch' }],
          f.options()
        )
    ).toMatchObject({ status: 'created' });
    expect(
      f.calls.filter((call) => call.path === '/v1/vaults' && call.method === 'POST')
    ).toHaveLength(1);
    const update = f.calls.find((call) => call.path.endsWith('/credentials/cred_synthetic'));
    expect(update?.body).toEqual({
      auth: { type: 'environment_variable', secret_value: 'Bearer replacement-before-dispatch' },
    });
    expect(f.dispatch).toHaveBeenCalledTimes(1);
  });
  it('requires explicit template overrides instead of trusting hidden inherited credential settings', async () => {
    const f = fixture();
    const template = { type: 'openai_hosted', environment_template_id: 'template_synthetic' };
    for (const environment of [template, { ...template, network: settings.environment.network }]) {
      expect(
        await f.port({ ...settings, environment }).createSession(request, [credential], f.options())
      ).toEqual({ status: 'not-attempted', reason: 'validation' });
    }
    expect(f.calls).toHaveLength(0);
    const explicit = { ...template, env: {}, network: settings.environment.network };
    expect(
      await f
        .port({ ...settings, environment: explicit })
        .createSession(request, [credential], f.options())
    ).toMatchObject({ status: 'created' });
  });
  it('checks template overrides for environment-name collisions and unavailable MCP hosts', async () => {
    const f = fixture();
    for (const overrides of [
      {
        env: { HEADSTART_MCP_AUTHORIZATION: 'not-a-vault-value' },
        network: settings.environment.network,
      },
      { env: {}, network: { access: 'restricted', allowed_domains: ['other.example.com'] } },
    ]) {
      const environment = {
        type: 'openai_hosted',
        environment_template_id: 'template_synthetic',
        ...overrides,
      };
      expect(
        await f.port({ ...settings, environment }).createSession(request, [credential], f.options())
      ).toEqual({ status: 'not-attempted', reason: 'validation' });
    }
    expect(f.calls).toHaveLength(0);
  });
  it('never installs a secret when durable receipt acknowledgement fails', async () => {
    const f = fixture();
    f.retain.mockRejectedValue(new Error('lost database acknowledgement'));
    expect(await f.port().createSession(request, [credential], f.options())).toEqual({
      status: 'not-attempted',
      reason: 'preflight',
    });
    expect(f.calls.filter((call) => call.method === 'POST').map((call) => call.path)).toEqual([
      '/v1/vaults',
    ]);
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('retains setup but does not replay an uncertain session create', async () => {
    const f = fixture();
    f.state.fail = 'session';
    expect(await f.port().createSession(request, [credential], f.options())).toEqual({
      status: 'unknown',
      reason: 'provider-outcome',
    });
    expect(f.calls.filter((call) => call.path === '/v1/agents/sessions')).toHaveLength(1);
    expect(f.state.retained).toEqual({
      kind: 'openai-credential-vault',
      id: 'vault_synthetic',
      ...identity,
    });
  });
  it.each(['wrongProject', 'wrongVault', 'wrongCredential'] as const)(
    'blocks dispatch on %s without exposing provider errors',
    async (fault) => {
      const f = fixture();
      Object.assign(f.state, { [fault]: true });
      const result = await f.port().createSession(request, [credential], f.options());
      expect(result).toEqual({ status: 'not-attempted', reason: 'preflight' });
      expect(f.dispatch).not.toHaveBeenCalled();
      expect(f.calls.some((call) => call.path === '/v1/agents/sessions')).toBe(false);
    }
  );
  it.each(['missing-retainer', 'missing-dispatch'] as const)(
    'does not provision without %s',
    async (fault) => {
      const f = fixture();
      const options =
        fault === 'missing-retainer'
          ? { expectedTarget: identity.target, beforeDispatch: f.dispatch }
          : { expectedTarget: identity.target, retainCredentialVault: f.retain };
      expect(await f.port().createSession(request, [credential], options)).toEqual({
        status: 'not-attempted',
        reason: 'validation',
      });
      expect(f.calls).toHaveLength(0);
    }
  );
  it.each([
    { environment: { type: 'none' } },
    { environment: { type: 'openai_hosted', network: { access: 'disabled' } } },
    {
      environment: {
        type: 'openai_hosted',
        network: { access: 'restricted', allowed_domains: ['other.example.com'] },
      },
    },
    {
      environment: {
        type: 'openai_hosted',
        env: { HEADSTART_MCP_AUTHORIZATION: 'not-a-secret-in-settings' },
      },
    },
    {
      runtimeCredentials: [
        { serverLabel: 'other', environmentVariable: 'HEADSTART_MCP_AUTHORIZATION' },
      ],
    },
    { runtimeCredentials: [{ serverLabel: 'headstart', environmentVariable: 'OPENAI_API_KEY' }] },
    { runtimeCredentials: [...settings.runtimeCredentials, ...settings.runtimeCredentials] },
  ])('rejects incompatible runtime configuration before provider calls: %j', async (override) => {
    const f = fixture();
    await expect(
      f.port({ ...settings, ...override }).preflightLaunch(request, [
        {
          serverLabel: credential.serverLabel,
          audience: credential.audience,
          allowedTools: credential.allowedTools,
        },
      ])
    ).rejects.toThrow('preflight failed');
    expect(f.calls).toHaveLength(0);
  });
  it.each(['duplicate', 'other-name', 'other-host', 'incomplete'] as const)(
    'does not overwrite conflicting %s vault contents',
    async (fault) => {
      const f = fixture();
      f.state.retained = { kind: 'openai-credential-vault', id: 'vault_synthetic', ...identity };
      f.state.credentials =
        fault === 'duplicate'
          ? [publicCredential, publicCredential]
          : [
              {
                ...publicCredential,
                auth: {
                  ...publicCredential.auth,
                  secret_name:
                    fault === 'other-name' ? 'UNRELATED' : publicCredential.auth.secret_name,
                  networking: {
                    type: 'limited',
                    allowed_hosts: [
                      fault === 'other-host' ? 'other.example.com' : 'mcp.example.com',
                    ],
                  },
                },
              },
            ];
      f.state.hasMore = fault === 'incomplete';
      expect(await f.port().createSession(request, [credential], f.options())).toEqual({
        status: 'not-attempted',
        reason: 'preflight',
      });
      expect(f.calls.some((call) => call.method === 'POST')).toBe(false);
    }
  );
  it("refuses another run's saved vault before retrieving it", async () => {
    const f = fixture();
    f.state.retained = {
      kind: 'openai-credential-vault',
      id: 'vault_other',
      ...identity,
      requestId: 'other',
    };
    expect(await f.port().createSession(request, [credential], f.options())).toEqual({
      status: 'not-attempted',
      reason: 'preflight',
    });
    expect(f.calls.map((call) => call.path)).toEqual(['/v1/agents']);
  });
});
