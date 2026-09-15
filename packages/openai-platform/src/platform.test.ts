import { describe, expect, it, vi } from 'vitest';

import { resolveConfig } from './config.js';
import { actionSchema } from './operations.js';
import { fingerprint, OpenAIPlatform, planAction, summarize } from './platform.js';

export const localConfig = {
  profile: {
    schemaVersion: 'headstart-capability-profile/v1',
    id: 'synthetic-development',
    revision: 'v1',
    bindings: [
      {
        capabilityId: 'openai.agents.read',
        providerId: 'openai-sdk',
        adapterVersion: '0.1.0',
        credentialRef: 'synthetic',
        options: { organizationId: 'org-synthetic', projectId: 'proj_synthetic' },
      },
    ],
  },
  credentials: {
    synthetic: {
      account: 'headstarthealth.1password.com',
      expectedEmail: 'synthetic@example.com',
      vault: 'synthetic-vault',
      item: 'synthetic-item',
      field: 'credential',
    },
  },
};
const config = resolveConfig(localConfig);
const current = {
  id: 'agent_synthetic',
  model: 'synthetic-model',
  instructions: 'private instructions',
};
const secret = 'synthetic-credential-not-valid';

function fixture(
  options: {
    project?: string;
    fail?: boolean;
    failOnMutation?: boolean;
    failOnRead?: boolean;
    status?: number;
  } = {}
): {
  platform: OpenAIPlatform;
  requests: Request[];
} {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (
      options.fail ||
      (options.failOnMutation && request.method !== 'GET') ||
      (options.failOnRead && requests.length > 1)
    ) {
      throw new Error(secret);
    }
    const url = new URL(request.url);
    const page = { object: 'list', data: [current], has_more: false };
    const data =
      url.pathname.endsWith('/agent_synthetic') || url.pathname.endsWith('/template_synthetic')
        ? current
        : page;
    if (url.pathname.endsWith('/events')) {
      return new Response(null, { status: 204 });
    }
    return Response.json(data, {
      status: options.status ?? 200,
      headers: { 'openai-project': options.project ?? 'proj_synthetic' },
    });
  };
  return { platform: new OpenAIPlatform(config, secret, transport), requests };
}

describe('OpenAI access boundary', () => {
  it('reuses profile binding and rejects unsupported or incomplete configuration', () => {
    expect(config.target.projectId).toBe('proj_synthetic');
    expect(() => resolveConfig({})).toThrow('Invalid local');
    const wrong = structuredClone(localConfig);
    const binding = wrong.profile.bindings[0];
    if (binding === undefined) {
      throw new Error('missing fixture');
    }
    binding.adapterVersion = 'other';
    expect(() => resolveConfig(wrong)).toThrow('Unsupported');
    expect(() => resolveConfig({ ...localConfig, credentials: {} })).toThrow('Unsupported');
  });

  it('resolves the same logical binding to each developer without a credential fallback', () => {
    const teammate = structuredClone(localConfig);
    teammate.credentials.synthetic.expectedEmail = 'teammate@example.com';
    teammate.credentials.synthetic.vault = 'teammate-vault';
    teammate.credentials.synthetic.item = 'teammate-item';
    const resolved = resolveConfig(teammate);
    expect(resolved.target).toEqual(config.target);
    expect(resolved.binding.credentialRef).toEqual(config.binding.credentialRef);
    expect(resolved.credential.item).toBe('teammate-item');
    expect(config.credential.item).toBe('synthetic-item');
    expect(() =>
      resolveConfig({ ...localConfig, credentials: { other: teammate.credentials.synthetic } })
    ).toThrow('Unsupported');
  });

  it('sets exact project, organization, beta header and rejects redirects', async () => {
    const { platform, requests } = fixture();
    await expect(platform.preflight()).resolves.toEqual({
      projectId: 'proj_synthetic',
      agentsRead: true,
    });
    const request = requests[0];
    expect(request?.headers.get('authorization')).toBe(`Bearer ${secret}`);
    expect(request?.headers.get('openai-organization')).toBe('org-synthetic');
    expect(request?.headers.get('openai-project')).toBe('proj_synthetic');
    expect(request?.headers.get('openai-beta')).toBe('agents=v1');
    expect(request?.redirect).toBe('error');
  });

  it('ignores ambient OpenAI routing and fails closed on wrong target or access', async () => {
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.invalid');
    try {
      const { platform, requests } = fixture({ project: 'proj_wrong' });
      await expect(platform.preflight()).rejects.toThrow('preflight failed');
      expect(requests[0]?.url).toContain('https://api.openai.com/v1/');
      await expect(fixture({ status: 403 }).platform.preflight()).rejects.toThrow(
        'preflight failed'
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ['models.list', '/models'],
    ['agents.list', '/agents'],
    ['agents.get', '/agents/agent_synthetic'],
    ['sessions.list', '/agents/sessions'],
    ['sessions.get', '/agents/sessions/agent_synthetic'],
    ['sessions.turns', '/agents/sessions/agent_synthetic/turns'],
    ['sessions.items', '/agents/sessions/agent_synthetic/items'],
    ['templates.list', '/agents/environments/templates'],
    ['templates.get', '/agents/environments/templates/agent_synthetic'],
  ])('routes %s as one bounded read after preflight', async (operation, path) => {
    const { platform, requests } = fixture();
    const input =
      operation.endsWith('.get') || operation === 'sessions.turns' || operation === 'sessions.items'
        ? { operation, id: 'agent_synthetic' }
        : { operation };
    const result = await platform.read(input);
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1]?.url ?? '').pathname).toBe(`/v1${path}`);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain('_client');
  });

  it('rejects malformed reads and actions before contacting provider', async () => {
    const { platform, requests } = fixture();
    await expect(
      platform.read({ operation: 'agents.list', query: { limit: 1000 } })
    ).rejects.toThrow('Invalid');
    expect(() =>
      planAction(config.target, {
        operation: 'agents.create',
        body: { model: 'm', unauthorized: true },
      })
    ).toThrow('Invalid');
    expect(requests).toHaveLength(0);
  });

  it('does not output raw error payloads or retry failures', async () => {
    const { platform, requests } = fixture({ fail: true });
    await expect(platform.preflight()).rejects.not.toThrow(secret);
    expect(requests).toHaveLength(1);
  });

  it('stops on failed readback or uncertain writes without replay', async () => {
    const readFailure = fixture({ failOnRead: true });
    await expect(
      readFailure.platform.read({ operation: 'agents.get', id: 'agent_synthetic' })
    ).rejects.toThrow('read failed');
    const staleFailure = fixture({ failOnRead: true });
    const staleAction = {
      operation: 'agents.delete',
      id: 'agent_synthetic',
      expectedFingerprint: fingerprint(current),
    };
    await expect(
      staleFailure.platform.apply(staleAction, {
        apply: true,
        digest: planAction(config.target, staleAction).digest,
        allowBillable: false,
      })
    ).rejects.toThrow('no mutation attempted');
    expect(staleFailure.requests.every((request) => request.method === 'GET')).toBe(true);
    const mutation = fixture({ failOnMutation: true });
    const action = { operation: 'agents.create', body: { model: 'synthetic-model' } };
    await expect(
      mutation.platform.apply(action, {
        apply: true,
        digest: planAction(config.target, action).digest,
        allowBillable: false,
      })
    ).rejects.toThrow('outcome is unknown');
    expect(mutation.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it('binds approval to target and exact body and separately gates billing', async () => {
    const { platform, requests } = fixture();
    const action = {
      operation: 'sessions.create',
      body: {
        agent_id: 'agent_synthetic',
        environment: { type: 'none' },
        input: 'synthetic input',
      },
    };
    const plan = planAction(config.target, action);
    expect(plan.billable).toBe(true);
    await expect(
      platform.apply(action, { apply: true, digest: plan.digest, allowBillable: false })
    ).rejects.toThrow('billable');
    await expect(
      platform.apply(action, { apply: false, digest: plan.digest, allowBillable: true })
    ).rejects.toThrow('approval');
    await expect(
      platform.apply(action, { apply: true, digest: 'wrong', allowBillable: true })
    ).rejects.toThrow('approval');
    expect(requests).toHaveLength(0);
    expect(planAction({ ...config.target, projectId: 'proj_different' }, action).digest).not.toBe(
      plan.digest
    );
    await platform.apply(action, { apply: true, digest: plan.digest, allowBillable: true });
    expect(requests.at(-1)?.method).toBe('POST');
  });

  const actions = [
    {
      operation: 'agents.create',
      body: {
        model: 'synthetic-model',
        name: 'Synthetic',
        instructions: 'text',
        metadata: { source: 'synthetic' },
        reasoning: { effort: 'low', summary: 'auto' },
        tools: [{ type: 'web_search' }],
      },
    },
    {
      operation: 'agents.update',
      id: 'agent_synthetic',
      expectedFingerprint: fingerprint(current),
      body: { name: null },
    },
    {
      operation: 'agents.delete',
      id: 'agent_synthetic',
      expectedFingerprint: fingerprint(current),
    },
    {
      operation: 'sessions.send',
      id: 'session_synthetic',
      input: 'synthetic message',
      idempotencyKey: 'synthetic-request',
    },
    { operation: 'sessions.cancel', id: 'session_synthetic' },
    { operation: 'sessions.delete', id: 'session_synthetic' },
    {
      operation: 'templates.create',
      body: { name: 'Synthetic', network: { access: 'disabled' }, skills: [] },
    },
    {
      operation: 'templates.update',
      id: 'template_synthetic',
      expectedFingerprint: fingerprint(current),
      body: { name: 'replacement' },
    },
    {
      operation: 'templates.delete',
      id: 'template_synthetic',
      expectedFingerprint: fingerprint(current),
    },
  ];
  it.each(actions)('executes approved $operation through the official SDK', async (input) => {
    const { platform, requests } = fixture();
    const plan = planAction(config.target, input);
    await platform.apply(input, { apply: true, digest: plan.digest, allowBillable: true });
    expect(requests.at(-1)?.method).toBe(input.operation.endsWith('.delete') ? 'DELETE' : 'POST');
    if (input.operation === 'sessions.send') {
      expect(requests.at(-1)?.headers.get('idempotency-key')).toBe('synthetic-request');
    }
  });

  it('blocks stale changes and preserves omitted update fields', async () => {
    const { platform, requests } = fixture();
    const action = {
      operation: 'agents.update',
      id: 'agent_synthetic',
      expectedFingerprint: fingerprint({ stale: true }),
      body: { name: null },
    };
    const plan = planAction(config.target, action);
    await expect(
      platform.apply(action, { apply: true, digest: plan.digest, allowBillable: false })
    ).rejects.toThrow('changed since');
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(actionSchema.parse(action)).toEqual(action);
  });

  it('summarizes safely and fingerprints key order deterministically', () => {
    expect(fingerprint({ b: 2, a: [1, null] })).toBe(fingerprint({ a: [1, null], b: 2 }));
    expect(
      summarize({
        id: 'synthetic',
        instructions: secret,
        metadata: { secret },
        has_more: false,
        data: [current],
      })
    ).toEqual({ id: 'synthetic', has_more: false, data: [{ id: 'agent_synthetic' }] });
    expect(summarize([current])).toEqual({ count: 1 });
    expect(summarize(null)).toBeNull();
  });
});
