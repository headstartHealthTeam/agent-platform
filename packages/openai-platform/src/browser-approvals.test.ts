import { describe, expect, it } from 'vitest';

import { pendingBrowserApprovals } from './browser-approvals.js';
import { resolveRuntimeConfig } from './config.js';
import { actionSchema } from './operations.js';
import { pendingFunctionCalls } from './pending-functions.js';
import { OpenAIPlatform, planAction } from './platform.js';

const expected = { sessionId: 'session_synthetic', turnId: 'turn_synthetic' };
const approval = {
  type: 'computer_use_approval_request',
  request_id: 'request_synthetic',
  turn_id: expected.turnId,
  request: { type: 'browser_origin_access', origin: 'https://payer.example', reason: 'Read forms' },
};
const session = { id: expected.sessionId, required_actions: [approval] };
const config = resolveRuntimeConfig({
  profile: {
    schemaVersion: 'headstart-capability-profile/v1',
    id: 'synthetic-development',
    revision: 'v1',
    bindings: [
      {
        capabilityId: 'openai.agents.read',
        providerId: 'openai-sdk',
        adapterVersion: '0.1.0',
        options: { organizationId: 'org-synthetic', projectId: 'proj_synthetic' },
      },
    ],
  },
});
function action(decision = 'approve'): unknown {
  const pending = pendingBrowserApprovals(session, expected)[0];
  if (!pending) throw new Error('Missing synthetic request');
  return {
    operation: 'sessions.browser-approval',
    id: pending.sessionId,
    turnId: pending.turnId,
    requestId: pending.requestId,
    expectedRequestFingerprint: pending.fingerprint,
    response: { type: 'browser_origin_access', decision },
  };
}
function fixture(
  current: unknown = session,
  fail = false
): { platform: OpenAIPlatform; requests: Request[] } {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === 'POST') {
      if (fail) throw new Error('private-provider-payload');
      return new Response(null, { status: 202 });
    }
    return Response.json(
      request.url.endsWith('/session_synthetic') ? current : { data: [], has_more: false },
      { headers: { 'openai-project': config.target.projectId } }
    );
  };
  return { platform: new OpenAIPlatform(config, 'synthetic-invalid-key', transport), requests };
}

describe('Agents API native browser contract', () => {
  it.each([undefined, true, false])(
    'preserves the hosted desktop and screenshot setting (%s)',
    async (screenshots) => {
      const tools = [
        { type: 'web_search', mode: 'live', context_size: 'high' },
        {
          type: 'computer_use',
          ...(screenshots === undefined ? {} : { include_screenshots: screenshots }),
        },
      ];
      const body = {
        agent: { model: 'synthetic-model', tools },
        environment: {
          type: 'openai_hosted',
          desktop: { enabled: true },
          network: { access: 'enabled' },
        },
      };
      const input = { operation: 'sessions.create', body };
      const { platform, requests } = fixture();
      await platform.apply(input, {
        apply: true,
        digest: planAction(config.target, input).digest,
        allowBillable: true,
      });
      expect(await requests[1]?.json()).toEqual({ ...body, metadata: {}, stream: false });
      expect(requests[1]?.url).toBe('https://api.openai.com/v1/agents/sessions');
    }
  );

  it('uses current pending state rather than saved history and never executes a request on read', async () => {
    expect(
      pendingBrowserApprovals({ ...session, required_actions: [], items: [approval] }, expected)
    ).toEqual([]);
    expect(() =>
      pendingBrowserApprovals({ id: expected.sessionId, items: [approval] }, expected)
    ).toThrow('Invalid pending browser');
    const { platform, requests } = fixture();
    expect(
      (
        await platform.read({
          operation: 'sessions.pending-browser-approvals',
          id: expected.sessionId,
          turnId: expected.turnId,
        })
      ).data
    ).toEqual({ data: pendingBrowserApprovals(session, expected) });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(pendingFunctionCalls(session, expected)).toEqual([]);
  });

  it.each(['approve', 'deny', 'cancel'])(
    'submits exact %s through Agents session events, without a turn_id in the event',
    async (decision) => {
      const input = action(decision);
      const { platform, requests } = fixture();
      const plan = planAction(config.target, input);
      expect(plan.billable).toBe(true);
      let journalCalls = 0;
      await platform.apply(
        input,
        { apply: true, digest: plan.digest, allowBillable: true },
        {
          beforeDispatch: async () => {
            journalCalls++;
            expect(requests.map((request) => request.method)).toEqual(['GET', 'GET']);
          },
        }
      );
      expect(journalCalls).toBe(1);
      expect(await requests[2]?.json()).toEqual({
        events: [
          {
            type: 'agent.session.input.computer_use_approval_request_result',
            request_id: approval.request_id,
            response: { type: 'browser_origin_access', decision },
          },
        ],
      });
      expect(requests[2]?.url).toBe(
        'https://api.openai.com/v1/agents/sessions/session_synthetic/events'
      );
    }
  );

  it.each([
    {},
    { ...session, id: 'session_other' },
    { ...session, required_actions: [] },
    { ...session, required_actions: [approval, approval] },
    { ...session, required_actions: [{ ...approval, turn_id: 'turn_other' }] },
    { ...session, required_actions: [{ ...approval, request_id: 'request_other' }] },
    {
      ...session,
      required_actions: [
        { ...approval, request: { ...approval.request, origin: 'https://other.example' } },
      ],
    },
    {
      ...session,
      required_actions: [
        { ...approval, request: { ...approval.request, reason: 'Changed purpose' } },
      ],
    },
    { ...session, required_actions: [{ type: 'future-browser-action' }] },
  ])(
    'rejects changed, missing, ambiguous or unverifiable requests before dispatch',
    async (current) => {
      const input = action();
      const { platform, requests } = fixture(current);
      await expect(
        platform.apply(input, {
          apply: true,
          digest: planAction(config.target, input).digest,
          allowBillable: true,
        })
      ).rejects.toThrow('no response submitted');
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
    }
  );

  it('requires exact approval and inference authority, and never retries an uncertain response', async () => {
    const input = action();
    const { platform, requests } = fixture(session, true);
    const digest = planAction(config.target, input).digest;
    await expect(
      platform.apply(input, { apply: true, digest, allowBillable: false })
    ).rejects.toThrow('authorization');
    expect(requests).toHaveLength(0);
    await expect(
      platform.apply(input, { apply: true, digest, allowBillable: true })
    ).rejects.toThrow('outcome is unknown');
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it('permits cancellation, not credential collection, for sign-in during public research', async () => {
    const authSession = {
      ...session,
      required_actions: [
        {
          ...approval,
          request: {
            type: 'browser_authentication',
            credential_origin: 'https://payer.example',
            reason: null,
            fields: [{ id: 'password', label: 'Password', required: true, type: 'password' }],
            options: [],
          },
        },
      ],
    };
    const pending = pendingBrowserApprovals(authSession, expected)[0];
    if (!pending) throw new Error('Missing synthetic request');
    expect(pending.request).not.toHaveProperty('fields');
    const response = { type: 'browser_authentication', action: 'cancel' };
    const input = {
      operation: 'sessions.browser-approval',
      id: pending.sessionId,
      turnId: pending.turnId,
      requestId: pending.requestId,
      expectedRequestFingerprint: pending.fingerprint,
      response,
    };
    const { platform, requests } = fixture(authSession);
    await platform.apply(input, {
      apply: true,
      digest: planAction(config.target, input).digest,
      allowBillable: true,
    });
    expect(await requests[2]?.json()).toEqual({
      events: [
        {
          type: 'agent.session.input.computer_use_approval_request_result',
          request_id: pending.requestId,
          response,
        },
      ],
    });
    for (const invalid of [
      { ...response, fields: [] },
      { type: 'browser_authentication', action: 'submit', fields: [] },
    ])
      expect(actionSchema.safeParse({ ...input, response: invalid }).success).toBe(false);
  });
});
