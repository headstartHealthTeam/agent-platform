import { describe, expect, it, vi } from 'vitest';

import { resolveConfig, resolveRuntimeConfig } from './config.js';
import { actionSchema } from './operations.js';
import { createOperatorRuntimePort, protocol, adapterVersion } from './operator-module.js';
import { pendingFunctionCalls } from './pending-functions.js';
import {
  fingerprint,
  OpenAIPlatform,
  planAction,
  summarize,
  InputNotSteerableError,
} from './platform.js';

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

describe('standalone operator factory', () => {
  it('uses the same live target check with a service-supplied key and no workstation reference', async () => {
    const serviceConfig = {
      profile: {
        ...localConfig.profile,
        bindings: localConfig.profile.bindings.map(
          ({ credentialRef: _reference, ...binding }) => binding
        ),
      },
    };
    const requests: Request[] = [];
    const transport: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json(
        { data: [], has_more: false },
        {
          headers: { 'openai-project': config.target.projectId },
        }
      );
    };
    const port = createOperatorRuntimePort({
      config: serviceConfig,
      apiKey: 'synthetic-service-key',
      fetchImplementation: transport,
    });
    port.close();
    expect(requests).toHaveLength(0);
    await new OpenAIPlatform(
      resolveRuntimeConfig(serviceConfig),
      'synthetic-service-key',
      transport
    ).preflight();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-service-key');
    expect(requests[0]?.headers.get('openai-organization')).toBe('org-synthetic');
    expect(requests[0]?.headers.get('openai-project')).toBe('proj_synthetic');
    expect(() => resolveConfig(serviceConfig)).toThrow('Invalid local');
    expect(() => resolveRuntimeConfig({ ...serviceConfig, apiKey: 'not-config-data' })).toThrow(
      'configuration'
    );
    const wrong = structuredClone(serviceConfig);
    for (const binding of wrong.profile.bindings)
      binding.options.projectId = 'missing-project-prefix';
    expect(() => resolveRuntimeConfig(wrong)).toThrow('Unsupported');
  });
  it('keeps transport construction credential-free until explicitly configured', () => {
    expect(protocol).toBe('headstart-openai-operator/v1');
    expect(adapterVersion).toBe('0.9.0');
    const fetchImplementation = vi.fn<typeof fetch>();
    for (const billableUntil of [undefined, '2026-09-17T12:00:00Z']) {
      const port = createOperatorRuntimePort({
        config: localConfig,
        apiKey: 'synthetic-invalid-key',
        ...(billableUntil === undefined ? {} : { billableUntil }),
        fetchImplementation,
      });
      port.close();
    }
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(() =>
      createOperatorRuntimePort({
        config: localConfig,
        apiKey: 'synthetic-invalid-key',
        billableUntil: 'invalid',
      })
    ).toThrow('expiry');
    expect(() =>
      createOperatorRuntimePort({ config: {}, apiKey: 'synthetic-invalid-key' })
    ).toThrow('configuration');
  });
});
const pendingCall = {
  type: 'function_call',
  turn_id: 'turn_synthetic',
  call_id: 'call_synthetic',
  name: 'ask_operator',
  arguments: { question: 'Which synthetic document should be used?' },
};
const pendingSession = { id: 'session_synthetic', required_actions: [pendingCall] };
const replyAction = {
  operation: 'sessions.tool-result',
  id: pendingSession.id,
  turnId: pendingCall.turn_id,
  callId: pendingCall.call_id,
  functionName: pendingCall.name,
  expectedCallFingerprint: fingerprint({
    sessionId: pendingSession.id,
    turnId: pendingCall.turn_id,
    callId: pendingCall.call_id,
    name: pendingCall.name,
    arguments: pendingCall.arguments,
  }),
  result: { success: true, output: JSON.stringify({ answer: 'Use the corrected synthetic CV.' }) },
};
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
    refusal?: { status: number; code: string };
    failOnRead?: boolean;
    status?: number;
    session?: unknown;
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
    const data = url.pathname.endsWith('/session_synthetic')
      ? (options.session ?? pendingSession)
      : url.pathname.endsWith('/agent_synthetic') || url.pathname.endsWith('/template_synthetic')
        ? current
        : page;
    if (url.pathname.endsWith('/events')) {
      if (options.refusal)
        return Response.json(
          { error: { code: options.refusal.code, message: secret, type: 'invalid_request_error' } },
          { status: options.refusal.status }
        );
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
  it.each([400, 409, 500])(
    'classifies only definitive steering refusals without retaining sensitive provider errors (%s)',
    async (status) => {
      const f = fixture({ refusal: { status, code: 'active_turn_not_steerable' } });
      const action = {
        operation: 'sessions.send',
        id: 'session_synthetic',
        input: 'Synthetic correction',
        idempotencyKey: 'message_a',
      };
      const outcome = f.platform.apply(action, {
        apply: true,
        digest: planAction(config.target, action).digest,
        allowBillable: true,
      });
      await expect(outcome).rejects.toThrow(
        status === 500 ? 'outcome is unknown' : 'No input was accepted'
      );
      await expect(outcome).rejects.not.toThrow(secret);
      if (status !== 500) await expect(outcome).rejects.toBeInstanceOf(InputNotSteerableError);
      expect(f.requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    }
  );
  it.each([false, true])(
    'projects the official content stream and requires recovery at close (malformed=%s)',
    async (malformed) => {
      const payload = {
        event_id: 'event_synthetic',
        session_id: malformed ? 'wrong' : 'session_synthetic',
        turn_id: 'turn_synthetic',
        type: 'agent.session.turn.item.done',
        item: {
          id: 'item_synthetic',
          turn_id: 'turn_synthetic',
          type: 'message',
          role: 'assistant',
          phase: 'commentary',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Checking the synthetic CV.' }],
        },
      };
      const transport: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).pathname.endsWith('/events'))
          return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
            headers: { 'content-type': 'text/event-stream' },
          });
        return Response.json(
          { data: [], has_more: false },
          { headers: { 'openai-project': 'proj_synthetic' } }
        );
      };
      const platform = new OpenAIPlatform(config, secret, transport);
      const observed = await platform.openOperatorObservation({
        sessionId: 'session_synthetic',
        turnId: 'turn_synthetic',
      });
      await expect(observed.completion).rejects.toThrow('recover saved state');
      expect(observed.items.values()).toHaveLength(malformed ? 0 : 1);
      observed.close();
    }
  );
  it('reads pending functions from current session state, not history', async () => {
    const { platform, requests } = fixture();
    const result = await platform.read({
      operation: 'sessions.pending-functions',
      id: pendingSession.id,
      turnId: pendingCall.turn_id,
    });
    expect(result.data).toEqual({
      data: pendingFunctionCalls(pendingSession, {
        sessionId: pendingSession.id,
        turnId: pendingCall.turn_id,
      }),
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/v1/agents',
      '/v1/agents/sessions/session_synthetic',
    ]);
  });

  it('reads an idle empty action list but rejects an omitted list through the actual SDK', async () => {
    const request = {
      operation: 'sessions.pending-functions',
      id: pendingSession.id,
      turnId: pendingCall.turn_id,
    };
    const idle = { id: pendingSession.id, status: 'idle' };
    const empty = fixture({ session: { ...idle, required_actions: [] } });
    expect((await empty.platform.read(request)).data).toEqual({ data: [] });
    const missing = fixture({ session: idle });
    await expect(missing.platform.read(request)).rejects.toThrow('OpenAI read failed');
    expect(missing.requests.every((entry) => entry.method === 'GET')).toBe(true);
  });

  it.each([
    { success: true, output: JSON.stringify({ answer: 'Use the corrected synthetic CV.' }) },
    { success: false, error: 'The operator cannot resolve this evidence gap.' },
  ])(
    'submits an exact approved function result only after checking pending state',
    async (result) => {
      const { platform, requests } = fixture();
      const action = { ...replyAction, result };
      const plan = planAction(config.target, action);
      expect(plan.billable).toBe(true);
      await platform.apply(action, { apply: true, digest: plan.digest, allowBillable: true });
      expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
        ['GET', '/v1/agents'],
        ['GET', '/v1/agents/sessions/session_synthetic'],
        ['POST', '/v1/agents/sessions/session_synthetic/events'],
      ]);
      expect(await requests[2]?.json()).toEqual({
        events: [
          {
            type: 'agent.session.input.tool_result',
            turn_id: pendingCall.turn_id,
            call_id: pendingCall.call_id,
            ...result,
          },
        ],
      });
    }
  );

  it.each([
    { id: pendingSession.id, status: 'idle' },
    { id: pendingSession.id, status: 'idle', required_actions: null },
    { ...pendingSession, id: 'session_other' },
    { ...pendingSession, required_actions: [] },
    { ...pendingSession, required_actions: [{ ...pendingCall, turn_id: 'turn_other' }] },
    { ...pendingSession, required_actions: [{ ...pendingCall, call_id: 'call_other' }] },
    { ...pendingSession, required_actions: [{ ...pendingCall, name: 'unexpected_function' }] },
    {
      ...pendingSession,
      required_actions: [{ ...pendingCall, arguments: { question: 'Changed' } }],
    },
    { ...pendingSession, required_actions: [pendingCall, pendingCall] },
  ])(
    'rejects missing, changed, wrong-identity or duplicate pending questions without a POST',
    async (session) => {
      const { platform, requests } = fixture({ session });
      await expect(
        platform.apply(replyAction, {
          apply: true,
          digest: planAction(config.target, replyAction).digest,
          allowBillable: true,
        })
      ).rejects.toThrow('no result submitted');
      expect(requests).toHaveLength(2);
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
    }
  );

  it('does not submit a result after a failed pending read or replay an uncertain POST', async () => {
    for (const failOnRead of [true, false]) {
      const { platform, requests } = fixture({ failOnRead, failOnMutation: !failOnRead });
      await expect(
        platform.apply(replyAction, {
          apply: true,
          digest: planAction(config.target, replyAction).digest,
          allowBillable: true,
        })
      ).rejects.toThrow(failOnRead ? 'no result submitted' : 'outcome is unknown');
      expect(requests.filter((request) => request.method === 'POST')).toHaveLength(
        failOnRead ? 0 : 1
      );
    }
  });

  it('requires separate billable approval and binds the answer payload to its plan', async () => {
    const { platform, requests } = fixture();
    const plan = planAction(config.target, replyAction);
    await expect(
      platform.apply(replyAction, { apply: true, digest: plan.digest, allowBillable: false })
    ).rejects.toThrow('billable');
    await expect(
      platform.apply(
        { ...replyAction, result: { success: true, output: 'Changed answer' } },
        {
          apply: true,
          digest: plan.digest,
          allowBillable: true,
        }
      )
    ).rejects.toThrow('Exact plan');
    expect(requests).toHaveLength(0);
  });

  it.each([
    { success: true },
    { success: true, output: 'answer', error: 'both' },
    { success: true, output: { answer: 'not serialized' } },
    { success: true, output: 'x'.repeat(16 * 1024 * 1024 + 1) },
    { success: false, error: '' },
    { success: false, output: 'answer' },
  ])('rejects ambiguous or unsupported function-result payloads', (result) => {
    expect(actionSchema.safeParse({ ...replyAction, result }).success).toBe(false);
  });

  it('retrieves the exact session turn without inferring completion from session status', async () => {
    const { platform, requests } = fixture();
    await platform.read({
      operation: 'sessions.turn.get',
      id: 'session_synthetic',
      turnId: 'turn_synthetic',
    });
    expect(new URL(requests[1]?.url ?? '').pathname).toBe(
      '/v1/agents/sessions/session_synthetic/turns/turn_synthetic'
    );
    expect(requests).toHaveLength(2);
  });

  it.each(['sessions.items', 'sessions.turns'])(
    'preserves explicit order and pagination for %s recovery reads',
    async (operation) => {
      const { platform, requests } = fixture();
      await platform.read({
        operation,
        id: 'session_synthetic',
        query: { limit: 5, after: 'previous', order: 'asc' },
      });
      const query = new URL(requests[1]?.url ?? '').searchParams;
      expect(Object.fromEntries(query)).toEqual({ limit: '5', after: 'previous', order: 'asc' });
      expect(requests).toHaveLength(2);
      await expect(
        platform.read({ operation, id: 'session_synthetic', query: { order: 'invalid' } })
      ).rejects.toThrow('Invalid');
    }
  );

  it('opens a read-only SDK stream before consumption and strips private content', async () => {
    const requests: Request[] = [];
    const transport: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (new URL(request.url).pathname.endsWith('/agents')) {
        return Response.json(
          { data: [], has_more: false },
          { headers: { 'openai-project': 'proj_synthetic' } }
        );
      }
      return new Response(
        [
          {
            type: 'agent.session.idle',
            event_id: 'e1',
            session: { id: 'session_synthetic', status: 'idle', instructions: secret },
          },
          { type: 'agent.session.turn.output_text.delta', event_id: 'e2', delta: secret },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(''),
        { headers: { 'content-type': 'text/event-stream' } }
      );
    };
    const platform = new OpenAIPlatform(config, secret, transport);
    const observation = await platform.openSessionObservation(
      { sessionId: 'session_synthetic' },
      new AbortController().signal
    );
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1]?.url ?? '').pathname).toBe(
      '/v1/agents/sessions/session_synthetic/events'
    );
    const events = [];
    for await (const event of observation.events) events.push(event);
    expect(events).toEqual([
      { kind: 'session', eventId: 'e1', sessionId: 'session_synthetic', status: 'idle' },
    ]);
    observation.close();
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('fails observation safely and does not retry, mutate or expose provider errors', async () => {
    const { platform, requests } = fixture({ failOnRead: true });
    await expect(
      platform.openSessionObservation(
        { sessionId: 'session_synthetic' },
        new AbortController().signal
      )
    ).rejects.toThrow('Unable to open session observation; no provider payload was emitted.');
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('sanitizes operator stream-open failures without retaining provider causes or retrying', async () => {
    const { platform, requests } = fixture({
      refusal: { status: 503, code: 'synthetic_stream_unavailable' },
    });
    const observation = platform.openOperatorObservation({
      sessionId: 'session_synthetic',
      turnId: 'turn_synthetic',
    });
    await expect(observation).rejects.toThrow(
      'Unable to open operator observation; no provider payload was emitted.'
    );
    await expect(observation).rejects.not.toThrow(secret);
    await expect(observation).rejects.not.toHaveProperty('cause');
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it.each(['close', 'abort'])(
    'tears down a pending observation with %s without cancelling the run',
    async (method) => {
      const requests: Request[] = [];
      const controller = new AbortController();
      let transportAborted = false;
      const transport: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (new URL(request.url).pathname.endsWith('/agents')) {
          return Response.json(
            { data: [], has_more: false },
            { headers: { 'openai-project': 'proj_synthetic' } }
          );
        }
        const body = new ReadableStream<Uint8Array>({
          start(stream): void {
            const event = {
              type: 'agent.session.in_progress',
              event_id: 'e1',
              session: { id: 'session_synthetic', status: 'in_progress' },
            };
            stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
            request.signal.addEventListener(
              'abort',
              () => {
                transportAborted = true;
                stream.error(new DOMException('Aborted', 'AbortError'));
              },
              { once: true }
            );
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      };
      const platform = new OpenAIPlatform(config, secret, transport);
      const observation = await platform.openSessionObservation(
        { sessionId: 'session_synthetic' },
        controller.signal
      );
      const events = observation.events[Symbol.asyncIterator]();
      await expect(events.next()).resolves.toMatchObject({
        done: false,
        value: { status: 'in_progress' },
      });
      const pending = events.next();
      if (method === 'close') observation.close();
      else controller.abort();
      await expect(pending).resolves.toEqual({ done: true, value: undefined });
      expect(transportAborted).toBe(true);
      expect(requests).toHaveLength(2);
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
    }
  );

  it('rejects malformed and already-aborted observation requests without network access', async () => {
    const { platform, requests } = fixture();
    await expect(
      platform.openSessionObservation({ sessionId: '../unsafe' }, new AbortController().signal)
    ).rejects.toThrow('Invalid');
    const controller = new AbortController();
    controller.abort();
    await expect(
      platform.openSessionObservation({ sessionId: 'session_synthetic' }, controller.signal)
    ).rejects.toThrow('aborted');
    expect(requests).toHaveLength(0);
  });

  it('closes only the observer and requires recovery after a malformed streamed event', async () => {
    const requests: Request[] = [];
    const transport: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (new URL(request.url).pathname.endsWith('/agents')) {
        return Response.json(
          { data: [], has_more: false },
          { headers: { 'openai-project': 'proj_synthetic' } }
        );
      }
      return new Response(
        `data: ${JSON.stringify({ type: 'agent.session.turn.completed', event_id: 'e1', error: secret })}\n\n`,
        { headers: { 'content-type': 'text/event-stream' } }
      );
    };
    const platform = new OpenAIPlatform(config, secret, transport);
    const observation = await platform.openSessionObservation(
      { sessionId: 'session_synthetic' },
      new AbortController().signal
    );
    await expect(observation.events[Symbol.asyncIterator]().next()).rejects.toThrow(
      'Session observation interrupted; recover session and turn state before continuing.'
    );
    observation.close();
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it.each(['agents.create', 'agents.update'])('accepts dotted model names for %s', (operation) => {
    const request = {
      operation,
      body: { model: 'gpt-4.5-preview' },
      ...(operation === 'agents.update'
        ? { id: 'agent_synthetic', expectedFingerprint: 'a'.repeat(64) }
        : {}),
    };
    expect(actionSchema.safeParse(request).success).toBe(true);
    expect(actionSchema.safeParse({ ...request, body: { model: '' } }).success).toBe(false);
    expect(actionSchema.safeParse({ ...request, body: { model: 'x'.repeat(201) } }).success).toBe(
      false
    );
    expect(
      actionSchema.safeParse({
        operation: 'agents.delete',
        id: 'agent.invalid',
        expectedFingerprint: 'a'.repeat(64),
      }).success
    ).toBe(false);
  });

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

  it.each(['sessions.create', 'templates.create', 'templates.update'])(
    'sends hosted setup unchanged through the SDK for %s',
    async (operation) => {
      const { platform, requests } = fixture();
      const setup = {
        packages: { npm: ['pnpm@9.15.0'], python: [], system: ['poppler-utils'] },
        env: { HEADSTART_TOOLS_ROOT: '/workspace/tools' },
        files: [
          { type: 'file_id', path: '/workspace/tools.tar.gz', file_id: 'file_synthetic' },
          { type: 'inline', path: '/workspace/config.json', data: 'e30=' },
        ],
        setup_commands: [
          { command: 'tar -xzf tools.tar.gz' },
          { command: 'node --version', cwd: '/workspace' },
        ],
      };
      const body =
        operation === 'sessions.create'
          ? {
              agent_id: 'agent_synthetic',
              environment: { type: 'openai_hosted', ...setup },
            }
          : setup;
      const action = {
        operation,
        body,
        ...(operation === 'templates.update'
          ? { id: 'template_synthetic', expectedFingerprint: fingerprint(current) }
          : {}),
      };
      const plan = planAction(config.target, action);
      const changed = {
        ...setup,
        setup_commands: [{ command: 'node --help' }],
      };
      const changedAction = {
        ...action,
        body:
          operation === 'sessions.create'
            ? { ...body, environment: { type: 'openai_hosted', ...changed } }
            : changed,
      };
      await expect(
        platform.apply(changedAction, { apply: true, digest: plan.digest, allowBillable: true })
      ).rejects.toThrow('approval');
      expect(requests).toHaveLength(0);
      await platform.apply(action, { apply: true, digest: plan.digest, allowBillable: true });
      const sent = requests.at(-1);
      expect(sent?.method).toBe('POST');
      expect(await sent?.json()).toEqual(
        operation === 'sessions.create' ? { ...body, metadata: {}, stream: false } : body
      );
    }
  );

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

  it.each([
    { agent_id: 'agent_synthetic' },
    {
      agent: {
        model: 'gpt-6-astra',
        instructions: 'Use only the isolated synthetic workspace.',
        reasoning: { effort: 'high' },
        tools: [],
      },
    },
  ])('creates a self-hosted session without prematurely submitting work', async (agent) => {
    const { platform, requests } = fixture();
    const body = {
      ...agent,
      environment: { type: 'self_hosted', workspace_directory: '/workspace' },
    };
    const action = { operation: 'sessions.create', body };
    const plan = planAction(config.target, action);
    expect(plan.billable).toBe(true);
    await expect(
      platform.apply(action, { apply: true, digest: plan.digest, allowBillable: false })
    ).rejects.toThrow('billable');
    expect(requests).toHaveLength(0);
    await platform.apply(action, { apply: true, digest: plan.digest, allowBillable: true });
    expect(requests).toHaveLength(2);
    const request = requests.at(-1);
    expect(request?.url).toBe('https://api.openai.com/v1/agents/sessions');
    expect(await request?.json()).toEqual({ ...body, metadata: {}, stream: false });
  });

  it('binds self-hosted location and inline model settings to exact approval', async () => {
    const { platform, requests } = fixture();
    const body = {
      agent: { model: 'gpt-6-astra', reasoning: { effort: 'high' } },
      environment: { type: 'self_hosted', workspace_directory: '/workspace' },
    };
    const action = { operation: 'sessions.create', body };
    const approved = planAction(config.target, action).digest;
    for (const changed of [
      { ...body, environment: { ...body.environment, workspace_directory: '/other' } },
      { ...body, agent: { ...body.agent, reasoning: { effort: 'xhigh' } } },
    ]) {
      await expect(
        platform.apply(
          { ...action, body: changed },
          { apply: true, digest: approved, allowBillable: true }
        )
      ).rejects.toThrow('approval');
    }
    expect(requests).toHaveLength(0);
  });

  it('connects native MCP from the session environment with credentials absent from the approval summary', async () => {
    const { platform, requests } = fixture();
    const mcp = {
      type: 'mcp',
      server_label: 'invented-source',
      connection_origin: 'environment',
      transport: {
        type: 'http',
        server_url: 'http://localhost:3004/mcp',
        authorization: 'Bearer invented-session-value',
      },
      allowed_tools: ['get_invented_record'],
      required: true,
    };
    const body = {
      agent: { model: 'gpt-6-astra', tools: [mcp] },
      environment: { type: 'self_hosted', workspace_directory: '/workspace' },
    };
    const action = { operation: 'sessions.create', body };
    const plan = planAction(config.target, action);
    expect(JSON.stringify(plan)).not.toContain('invented-session-value');
    await platform.apply(action, { apply: true, digest: plan.digest, allowBillable: true });
    expect(await requests.at(-1)?.json()).toEqual({ ...body, metadata: {}, stream: false });
    expect(actionSchema.safeParse({ operation: 'agents.create', body: body.agent }).success).toBe(
      false
    );
    expect(
      actionSchema.safeParse({
        operation: 'sessions.create',
        body: { ...body, input: 'Invented', environment: { type: 'none' } },
      }).success
    ).toBe(false);
    for (const changed of [
      { ...mcp, connection_origin: 'service' },
      { ...mcp, transport: { ...mcp.transport, server_url: 'http://remote.example.invalid/mcp' } },
      {
        ...mcp,
        transport: { ...mcp.transport, server_url: 'https://user:secret@example.invalid/mcp' },
      },
      {
        ...mcp,
        transport: { ...mcp.transport, authorization: 'Bearer invented\r\nHeader: injected' },
      },
    ])
      expect(
        actionSchema.safeParse({
          operation: 'sessions.create',
          body: { ...body, agent: { ...body.agent, tools: [changed] } },
        }).success
      ).toBe(false);
  });

  it('rejects ambiguous agent selection, missing none input and executor secrets or mounts', () => {
    const agent = { model: 'synthetic-model' };
    const environment = { type: 'self_hosted', workspace_directory: '/workspace' };
    for (const body of [
      { environment },
      { agent: {}, environment },
      { agent, agent_id: 'agent_synthetic', environment },
      { agent, environment: { type: 'none' } },
      { agent, environment: { ...environment, CODEX_API_KEY: 'not-a-real-key' } },
      { agent, environment: { ...environment, environment_template_id: 'template_synthetic' } },
      { agent, environment: { ...environment, capability_directories: ['/private'] } },
      { agent, environment: { ...environment, network: { access: 'enabled' } } },
    ]) {
      expect(actionSchema.safeParse({ operation: 'sessions.create', body }).success).toBe(false);
    }
    for (const workspace_directory of [
      '',
      '/',
      'workspace',
      '/workspace/../private',
      '/work/./x',
      '/work//x',
      '/work/',
      '/work\\private',
      '/work\nprivate',
      '/work\u007f',
    ]) {
      expect(
        actionSchema.safeParse({
          operation: 'sessions.create',
          body: { agent, environment: { ...environment, workspace_directory } },
        }).success
      ).toBe(false);
    }
    expect(
      actionSchema.safeParse({
        operation: 'sessions.create',
        body: { agent, environment: { type: 'none' }, input: 'bounded synthetic task' },
      }).success
    ).toBe(true);
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
