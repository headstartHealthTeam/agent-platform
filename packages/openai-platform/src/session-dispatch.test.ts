import type { AgentLaunchRequest } from '@headstart-health/workflow-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveConfig } from './config.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { OpenAIPlatform, fingerprint } from './platform.js';
import { SessionLaunchPort } from './session-launch.js';

const target = { organizationId: 'org-synthetic', projectId: 'proj_synthetic' };
const config = resolveConfig({
  profile: {
    schemaVersion: 'headstart-capability-profile/v1',
    id: 'synthetic',
    revision: 'v1',
    bindings: [
      {
        capabilityId: 'openai.agents.read',
        providerId: 'openai-sdk',
        adapterVersion: '0.1.0',
        credentialRef: 'synthetic',
        options: target,
      },
    ],
  },
  credentials: {
    synthetic: {
      account: 'headstarthealth.1password.com',
      expectedEmail: 'synthetic@example.com',
      vault: 'synthetic',
      item: 'synthetic',
      field: 'credential',
    },
  },
});
const request: AgentLaunchRequest = {
  requestId: 'e248b74d-cbac-489b-9552-b5ac2697198d',
  workflowRevision: 'revision',
  definition: { instructions: 'Synthetic only.', tools: [] },
  input: 'Inspect an invented case.',
};
const expectedTarget = fingerprint(target);
const session = {
  id: 'session_synthetic',
  status: 'in_progress',
  created_at: 1_790_000_000,
  metadata: { launch_request: request.requestId, workflow_revision: request.workflowRevision },
};
const settings = {
  model: 'synthetic-model',
  reasoning: { effort: 'high' },
  environment: { type: 'none' },
  mcpServers: [],
};
function fixture(
  options: {
    projectId?: string;
    mutationStatus?: number;
    mutationBody?: unknown;
    loseResponse?: boolean;
    readStatus?: number;
    sessionStatus?: string;
    cancelReadback?: unknown;
    cancelReadFailure?: boolean;
  } = {}
): { port: OperatorRuntimePort; platform: OpenAIPlatform; calls: string[] } {
  const calls: string[] = [];
  let cancellationAccepted = false;
  const transport: typeof fetch = async (input, init) => {
    const incoming = new Request(input, init);
    const path = new URL(incoming.url).pathname;
    calls.push(`${incoming.method} ${path}`);
    expect(incoming.headers.get('OpenAI-Project')).toBe(target.projectId);
    expect(incoming.headers.get('OpenAI-Organization')).toBe(target.organizationId);
    if (incoming.method === 'POST' && options.loseResponse)
      throw new Error('private failure payload');
    if (path.endsWith('/events')) {
      cancellationAccepted = true;
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/session_synthetic') && cancellationAccepted && options.cancelReadFailure)
      throw new Error('private readback failure');
    const body =
      incoming.method === 'POST'
        ? (options.mutationBody ?? session)
        : path.endsWith('/session_synthetic')
          ? cancellationAccepted
            ? (options.cancelReadback ?? { ...session, status: 'idle' })
            : { ...session, status: options.sessionStatus ?? session.status }
          : { data: [], has_more: false };
    return Response.json(body, {
      status:
        incoming.method === 'POST' ? (options.mutationStatus ?? 200) : (options.readStatus ?? 200),
      headers: {
        'openai-project': options.projectId ?? target.projectId,
        'x-request-id': 'req_synthetic',
      },
    });
  };
  const platform = new OpenAIPlatform(config, 'synthetic-invalid-key', transport);
  return {
    platform,
    calls,
    port: new OperatorRuntimePort(platform, target, Date.now() + 60_000, [], settings),
  };
}
afterEach(() => vi.useRealTimers());
describe('session dispatch certainty at the official SDK boundary', () => {
  it('exposes recovery through the shared runtime port and never creates after close', async () => {
    const f = fixture();
    expect(await f.port.inspectLaunchCandidate(expectedTarget, session.id)).toEqual({
      status: 'candidate',
      candidate: {
        sessionId: session.id,
        target: expectedTarget,
        requestId: request.requestId,
        workflowRevision: request.workflowRevision,
        createdAt: session.created_at,
      },
    });
    expect(
      await f.port.discoverLaunchCandidates({
        target: expectedTarget,
        requestId: request.requestId,
        workflowRevision: request.workflowRevision,
      })
    ).toEqual({ candidates: [], nextAfter: null });
    f.port.close();
    expect(await f.port.createSession(request, undefined, { expectedTarget })).toEqual({
      status: 'not-attempted',
      reason: 'validation',
    });
    expect(f.calls.every((call) => call.startsWith('GET'))).toBe(true);
    expect(() => f.port.inspectLaunchCandidate(expectedTarget, session.id)).toThrow('closed');
  });
  it('validates target before credentials and journals after provider reads immediately before the one POST', async () => {
    const f = fixture();
    expect(await f.port.preflightLaunch(request)).toEqual({ target: expectedTarget });
    expect(f.calls).toEqual(['GET /v1/agents']);
    const result = await f.port.createSession(request, undefined, {
      expectedTarget,
      beforeDispatch: async () => {
        expect(f.calls).toEqual(['GET /v1/agents', 'GET /v1/agents']);
        f.calls.push('journal creating');
      },
    });
    expect(result).toEqual({
      status: 'created',
      receipt: {
        requestId: request.requestId,
        workflowRevision: request.workflowRevision,
        sessionId: session.id,
        target: expectedTarget,
      },
      providerRequestId: 'req_synthetic',
    });
    expect(f.calls).toEqual([
      'GET /v1/agents',
      'GET /v1/agents',
      'journal creating',
      'POST /v1/agents/sessions',
    ]);
  });
  it('proves local validation failures before provider reads or dispatch callback', async () => {
    const f = fixture();
    const beforeDispatch = vi.fn<() => Promise<void>>();
    expect(
      await f.port.createSession(request, undefined, { expectedTarget: 'other', beforeDispatch })
    ).toEqual({ status: 'not-attempted', reason: 'validation' });
    expect(await f.port.createSession(request)).toEqual({
      status: 'not-attempted',
      reason: 'validation',
    });
    expect(
      await f.port.createSession({ ...request, requestId: 'invalid' }, undefined, {
        expectedTarget,
        beforeDispatch,
      })
    ).toEqual({ status: 'not-attempted', reason: 'validation' });
    expect(f.calls).toEqual([]);
    expect(beforeDispatch).not.toHaveBeenCalled();
  });
  it('proves a wrong provider target never reaches the dispatch boundary', async () => {
    const f = fixture({ projectId: 'proj_other' });
    await expect(f.port.preflightLaunch(request)).rejects.toThrow('no session creation');
    const beforeDispatch = vi.fn<() => Promise<void>>();
    expect(
      await f.port.createSession(request, undefined, { expectedTarget, beforeDispatch })
    ).toEqual({ status: 'not-attempted', reason: 'preflight' });
    expect(beforeDispatch).not.toHaveBeenCalled();
    expect(f.calls.every((call) => call.startsWith('GET'))).toBe(true);
  });
  it('does not dispatch after a rejected durable-journal callback, including an uncertain database ack', async () => {
    const f = fixture();
    expect(
      await f.port.createSession(request, undefined, {
        expectedTarget,
        beforeDispatch: async () => {
          f.calls.push('database may have saved creating');
          throw new Error('private database connection details');
        },
      })
    ).toEqual({ status: 'not-attempted', reason: 'before-dispatch' });
    expect(f.calls).toEqual(['GET /v1/agents', 'database may have saved creating']);
  });
  it.each([false, true])(
    'never retries provider uncertainty after dispatch (lost response=%s)',
    async (loseResponse) => {
      const f = fixture({
        loseResponse,
        mutationStatus: 503,
        mutationBody: { error: { message: 'private provider failure', type: 'internal_error' } },
      });
      expect(await f.port.createSession(request, undefined, { expectedTarget })).toEqual({
        status: 'unknown',
        reason: 'provider-outcome',
        ...(loseResponse ? {} : { providerRequestId: 'req_synthetic' }),
      });
      expect(f.calls).toEqual(['GET /v1/agents', 'POST /v1/agents/sessions']);
    }
  );
  it('retains an untrusted candidate ID when the create response cannot establish ownership', async () => {
    const f = fixture({ mutationBody: { id: 'session_hint', metadata: null } });
    expect(await f.port.createSession(request, undefined, { expectedTarget })).toEqual({
      status: 'unknown',
      reason: 'invalid-response',
      candidateSessionId: 'session_hint',
      providerRequestId: 'req_synthetic',
    });
    expect(f.calls).toEqual(['GET /v1/agents', 'POST /v1/agents/sessions']);
  });
  it('rechecks inference authority after the journal callback without dispatching an expired request', async () => {
    vi.useFakeTimers();
    const f = fixture();
    expect(
      await f.port.createSession(request, undefined, {
        expectedTarget,
        beforeDispatch: async () => {
          vi.setSystemTime(Date.now() + 61_000);
        },
      })
    ).toEqual({ status: 'not-attempted', reason: 'before-dispatch' });
    expect(f.calls).toEqual(['GET /v1/agents']);
  });
  it('does not treat an empty but unfinished SDK page as a completed discovery pass', async () => {
    const transport: typeof fetch = async (input, init) => {
      const incoming = new Request(input, init);
      expect(incoming.method).toBe('GET');
      return Response.json(
        { data: [], has_more: true },
        { headers: { 'openai-project': target.projectId } }
      );
    };
    const platform = new OpenAIPlatform(config, 'synthetic-invalid-key', transport);
    const port = new SessionLaunchPort(platform, target, undefined, 0, []);
    await expect(
      port.discoverLaunchCandidates({ ...request, target: expectedTarget })
    ).rejects.toThrow('cursor must not advance');
  });
  it('maps only an actual missing resource to missing, not a project preflight 404', async () => {
    const f = fixture({ readStatus: 404 });
    await expect(f.port.inspectLaunchCandidate(expectedTarget, session.id)).rejects.toThrow(
      'unconfirmed'
    );
    const platform = new OpenAIPlatform(config, 'synthetic-invalid-key', async (input, init) => {
      const incoming = new Request(input, init);
      const missing = new URL(incoming.url).pathname.endsWith('/session_synthetic');
      return Response.json(
        missing ? { error: { message: 'private' } } : { data: [], has_more: false },
        { status: missing ? 404 : 200, headers: { 'openai-project': target.projectId } }
      );
    });
    expect(
      await new SessionLaunchPort(platform, target, undefined, 0, []).inspectLaunchCandidate(
        expectedTarget,
        session.id
      )
    ).toEqual({ status: 'missing' });
  });
});

describe('verified session cleanup without hosted/local divergence', () => {
  const receipt = {
    sessionId: session.id,
    target: expectedTarget,
    requestId: request.requestId,
    workflowRevision: request.workflowRevision,
  };
  it.each(['idle', 'failed'])(
    'does not send redundant cancellation for already-quiescent %s sessions',
    async (sessionStatus) => {
      const f = fixture({ sessionStatus });
      await f.port.cancelSession(receipt);
      expect(f.calls).toEqual(['GET /v1/agents', 'GET /v1/agents/sessions/session_synthetic']);
    }
  );
  it.each(['idle', 'failed'])(
    'requires a fresh %s readback after cancellation acceptance',
    async (status) => {
      const f = fixture({ cancelReadback: { ...session, status } });
      await f.port.cancelSession(receipt);
      expect(f.calls).toEqual([
        'GET /v1/agents',
        'GET /v1/agents/sessions/session_synthetic',
        'GET /v1/agents',
        'POST /v1/agents/sessions/session_synthetic/events',
        'GET /v1/agents',
        'GET /v1/agents/sessions/session_synthetic',
      ]);
    }
  );
  it.each(['in_progress', 'requires_action', 'cancelled', undefined])(
    'never equates acceptance or malformed %s status with confirmed quiescence',
    async (status) => {
      const f = fixture({ cancelReadback: { ...session, status } });
      await expect(f.port.cancelSession(receipt)).rejects.toThrow('quiescence is unconfirmed');
      expect(f.calls.filter((call) => call.startsWith('POST'))).toHaveLength(1);
      expect(f.calls.filter((call) => call.endsWith('/session_synthetic'))).toHaveLength(2);
    }
  );
  it('revalidates exact launch metadata after cancellation and sanitizes readback failures', async () => {
    for (const options of [
      { cancelReadback: { ...session, status: 'idle', metadata: {} } },
      { cancelReadFailure: true },
    ]) {
      const f = fixture(options);
      await expect(f.port.cancelSession(receipt)).rejects.toThrow('quiescence is unconfirmed');
      expect(f.calls.filter((call) => call.startsWith('POST'))).toHaveLength(1);
    }
  });
  it('never retries an unconfirmed cancellation inside one cleanup attempt', async () => {
    const f = fixture({ loseResponse: true });
    await expect(f.port.cancelSession(receipt)).rejects.toThrow('quiescence is unconfirmed');
    expect(f.calls.filter((call) => call.startsWith('POST'))).toHaveLength(1);
    expect(f.calls.filter((call) => call.endsWith('/session_synthetic'))).toHaveLength(1);
  });
  it('does not cancel a foreign target or session even when it appears idle', async () => {
    const f = fixture({ sessionStatus: 'idle' });
    await expect(f.port.cancelSession({ ...receipt, target: 'other' })).rejects.toThrow(
      'quiescence is unconfirmed'
    );
    expect(f.calls).toEqual([]);
    await expect(
      f.port.cancelSession({ ...receipt, requestId: '063dd72e-193f-4478-9aee-86ee24ab7edc' })
    ).rejects.toThrow('quiescence is unconfirmed');
    expect(f.calls.every((call) => call.startsWith('GET'))).toBe(true);
  });
});
