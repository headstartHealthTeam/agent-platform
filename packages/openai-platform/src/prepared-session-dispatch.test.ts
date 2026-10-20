import type {
  AgentInferenceAuthorizer,
  AgentSessionReceipt,
} from '@headstart-health/workflow-contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveRuntimeConfig } from './config.js';
import type { InferenceAuthority } from './inference-authority.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import { fingerprint, OpenAIPlatform } from './platform.js';

const config = resolveRuntimeConfig({
  profile: {
    schemaVersion: 'headstart-capability-profile/v1',
    id: 'synthetic-prepared-start',
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
const receipt: AgentSessionReceipt = {
  sessionId: 'session_synthetic',
  target: fingerprint(config.target),
  workflowRevision: 'revision_synthetic',
  requestId: '10000000-0000-4000-8000-000000000001',
};
const environmentPath = '/v1/agents/environments/environment_synthetic';

function fixture(
  authority: InferenceAuthority,
  onFinalEnvironmentRead: () => void = () => undefined
): { port: OperatorRuntimePort; requests: Request[]; calls: string[] } {
  const requests: Request[] = [];
  const calls: string[] = [];
  let environmentReads = 0;
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    requests.push(request);
    calls.push(`${request.method} ${path}`);
    expect(request.headers.get('OpenAI-Project')).toBe(config.target.projectId);
    expect(request.headers.get('OpenAI-Organization')).toBe(config.target.organizationId);
    if (request.method === 'POST') return new Response(null, { status: 204 });
    let data: unknown = { data: [], has_more: false };
    if (path === `/v1/agents/sessions/${receipt.sessionId}`) {
      data = {
        id: receipt.sessionId,
        status: 'idle',
        metadata: {
          launch_request: receipt.requestId,
          workflow_revision: receipt.workflowRevision,
          deferred_input: receipt.requestId,
        },
        environment: { type: 'openai_hosted', id: 'environment_synthetic' },
      };
    }
    if (path === environmentPath) {
      environmentReads += 1;
      if (environmentReads === 2) onFinalEnvironmentRead();
      data = {
        object: 'agent.environment',
        id: 'environment_synthetic',
        type: 'openai_hosted',
        status: 'connected',
      };
    }
    return Response.json(data, { headers: { 'openai-project': config.target.projectId } });
  };
  return {
    requests,
    calls,
    port: new OperatorRuntimePort(
      new OpenAIPlatform(config, 'synthetic-invalid-key', transport),
      config.target,
      authority
    ),
  };
}

afterEach(() => vi.useRealTimers());

describe('prepared first-turn dispatch at the pinned SDK boundary', () => {
  it.each(['revocation', 'deadline', 'close'] as const)(
    'sends no message when %s occurs during the final environment read',
    async (change) => {
      vi.useFakeTimers();
      const authorize = vi.fn<AgentInferenceAuthorizer['authorize']>().mockResolvedValue(true);
      const f = fixture(change === 'deadline' ? Date.now() + 60_000 : { authorize }, () => {
        if (change === 'revocation') authorize.mockResolvedValue(false);
        if (change === 'deadline') vi.advanceTimersByTime(60_000);
        if (change === 'close') f.port.close();
      });
      const journal = vi.fn(async () => undefined);
      try {
        const result = await f.port.startPreparedSession(receipt, 'Read restored files.', journal);
        expect(f.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
        expect(result).toEqual({ status: 'not-attempted' });
        expect(journal).toHaveBeenCalledOnce();
        expect(f.calls.filter((call) => call === `GET ${environmentPath}`)).toHaveLength(2);
      } finally {
        f.port.close();
      }
    }
  );

  it('does not dispatch if the port closes during the final authority check', async () => {
    const authorize = vi.fn<AgentInferenceAuthorizer['authorize']>().mockResolvedValue(true);
    const f = fixture({ authorize });
    authorize.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      f.port.close();
      return true;
    });
    try {
      const result = await f.port.startPreparedSession(
        receipt,
        'Read restored files.',
        async () => {
          // Retain the application-owned dispatch journal exactly once.
        }
      );
      expect(f.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
      expect(result).toEqual({ status: 'not-attempted' });
    } finally {
      f.port.close();
    }
  });

  it('posts exactly once with no provider reads after the final authorization', async () => {
    const authorize = vi.fn<AgentInferenceAuthorizer['authorize']>().mockResolvedValue(true);
    const f = fixture({ authorize });
    authorize.mockImplementation(async () => {
      f.calls.push('authorize');
      return true;
    });
    const journal = vi.fn(async () => {
      f.calls.push('journal');
    });
    try {
      expect(await f.port.startPreparedSession(receipt, 'Read restored files.', journal)).toEqual({
        status: 'accepted',
      });
      expect(f.calls.slice(-3)).toEqual([
        `GET ${environmentPath}`,
        'authorize',
        `POST /v1/agents/sessions/${receipt.sessionId}/events`,
      ]);
      expect(journal).toHaveBeenCalledOnce();
      expect(authorize).toHaveBeenCalledTimes(2);
      const posts = f.requests.filter((request) => request.method === 'POST');
      expect(posts).toHaveLength(1);
      expect(posts[0]?.headers.get('Idempotency-Key')).toBe(`initial-${receipt.requestId}`);
      expect(await posts[0]?.json()).toEqual({
        events: [
          {
            type: 'agent.session.input.message',
            input: [
              { role: 'user', content: [{ type: 'input_text', text: 'Read restored files.' }] },
            ],
          },
        ],
      });
    } finally {
      f.port.close();
    }
  });
});
