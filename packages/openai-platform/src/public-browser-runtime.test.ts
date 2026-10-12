import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveRuntimeConfig } from './config.js';
import { fingerprint } from './fingerprint.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { OpenAIPlatform } from './platform.js';

const dns = vi.hoisted(() => ({
  lookup:
    vi.fn<
      (
        hostname: string,
        options: { all: true; verbatim: true }
      ) => Promise<{ address: string; family: number }[]>
    >(),
}));
vi.mock('node:dns/promises', () => dns);
const config = resolveRuntimeConfig({
  profile: {
    schemaVersion: 'headstart-capability-profile/v1',
    id: 'synthetic-browser',
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
const binding = {
  sessionId: 'session_a',
  turnId: 'turn_a',
  target: fingerprint(config.target),
  workflowRevision: 'revision_a',
};
const approval = {
  type: 'computer_use_approval_request',
  request_id: 'request_a',
  turn_id: 'turn_a',
  request: {
    type: 'browser_origin_access',
    origin: 'https://payer.example',
    reason: 'Read current forms',
  },
};

function fixture(
  options: { mode?: string; status?: string; expiry?: number; failPost?: boolean } = {}
): {
  port: OperatorRuntimePort;
  requests: Request[];
  current: { id: string; metadata: Record<string, string>; required_actions: unknown[] };
} {
  dns.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  const requests: Request[] = [];
  const current = {
    id: binding.sessionId,
    metadata: {
      workflow_revision: binding.workflowRevision,
      research_mode: options.mode ?? 'public-browser',
    },
    required_actions: [approval] as unknown[],
  };
  const fetchImplementation: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === 'POST') {
      if (options.failPost) throw new Error('private upstream error');
      return new Response(null, { status: 202 });
    }
    return Response.json(
      request.url.endsWith('/session_a')
        ? current
        : request.url.includes('/turns')
          ? {
              data: [
                {
                  id: binding.turnId,
                  session_id: binding.sessionId,
                  subagent_id: null,
                  status: options.status ?? 'waiting',
                },
              ],
              has_more: false,
            }
          : { data: [], has_more: false },
      { headers: { 'openai-project': config.target.projectId } }
    );
  };
  return {
    requests,
    current,
    port: new OperatorRuntimePort(
      new OpenAIPlatform(config, 'synthetic-invalid-key', fetchImplementation),
      config.target,
      options.expiry ?? Date.now() + 60000
    ),
  };
}
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('automatic public browser request delivery', () => {
  it('recovers current requests read-only and sends the automatically derived decision after the owner journals it', async () => {
    const { port, requests } = fixture();
    const [pending] = await port.pendingPublicBrowserRequests(binding);
    if (!pending) throw new Error('Missing request');
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    const journal = vi.fn(async () => {
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
    });
    // The caller's untrusted copy cannot replace the freshly read origin or reason.
    const result = await port.answerPublicBrowserRequest(
      binding,
      {
        ...pending,
        request: {
          type: 'browser_origin_access',
          origin: 'https://localhost',
          reason: 'Changed local copy',
        },
      },
      journal
    );
    expect(result.response).toEqual({ type: 'browser_origin_access', decision: 'approve' });
    expect(journal).toHaveBeenCalledExactlyOnceWith(result);
    expect(dns.lookup).toHaveBeenCalledWith('payer.example', { all: true, verbatim: true });
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    expect(await requests.at(-1)?.json()).toEqual({
      events: [
        {
          type: 'agent.session.input.computer_use_approval_request_result',
          request_id: 'request_a',
          response: result.response,
        },
      ],
    });
    port.close();
  });
  it.each(['stopped', 'expired', 'closed', 'changed', 'unknown'])(
    'does not continue past %s authority or delivery state',
    async (scenario) => {
      vi.useFakeTimers();
      const { port, requests, current } = fixture({ failPost: scenario === 'unknown' });
      const [pending] = await port.pendingPublicBrowserRequests(binding);
      if (!pending) throw new Error('Missing request');
      if (scenario === 'changed') current.required_actions = [];
      if (scenario === 'closed') port.close();
      const journal = vi.fn(async () => {
        if (scenario === 'stopped') throw new Error('Stop retained by owner');
        if (scenario === 'expired') vi.advanceTimersByTime(61000);
      });
      await expect(port.answerPublicBrowserRequest(binding, pending, journal)).rejects.toThrow();
      expect(requests.filter((request) => request.method === 'POST')).toHaveLength(
        scenario === 'unknown' ? 1 : 0
      );
      port.close();
    }
  );
  it('rejects a credentialed session and an unrelated binding before approval', async () => {
    const { port, requests } = fixture({ mode: 'source-reader' });
    await expect(port.pendingPublicBrowserRequests(binding)).rejects.toThrow();
    await expect(
      port.pendingPublicBrowserRequests({ ...binding, target: 'other' })
    ).rejects.toThrow('target');
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    port.close();
  });
  it.each(['completed', 'failed', 'cancelled'])(
    'ignores residual browser requests on a %s root',
    async (status) => {
      const { port } = fixture({ status });
      expect(await port.pendingPublicBrowserRequests(binding)).toEqual([]);
      port.close();
    }
  );
  it('bounds a stalled DNS lookup without responding or involving Ops', async () => {
    vi.useFakeTimers();
    const { port, requests } = fixture();
    const [pending] = await port.pendingPublicBrowserRequests(binding);
    if (!pending) throw new Error('Missing request');
    dns.lookup.mockImplementation(() => new Promise(() => undefined));
    const journal = vi.fn();
    const rejection = expect(
      port.answerPublicBrowserRequest(binding, pending, journal)
    ).rejects.toThrow('lookup unavailable');
    await vi.advanceTimersByTimeAsync(5001);
    await rejection;
    expect(journal).not.toHaveBeenCalled();
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    port.close();
  });
});
