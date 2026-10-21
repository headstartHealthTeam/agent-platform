import type { AgentInferenceAuthorizer } from '@headstart-health/workflow-contracts';
import { describe, expect, it, vi } from 'vitest';

import { resolveRuntimeConfig } from './config.js';
import { fingerprint } from './fingerprint.js';
import { createOperatorRuntimePort } from './operator-module.js';

const config = {
  profile: {
    schemaVersion: 'headstart-capability-profile/v1',
    id: 'synthetic-environment-observation',
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
};
const receipt = {
  target: fingerprint(resolveRuntimeConfig(config).target),
  sessionId: 'session_synthetic',
  workflowRevision: 'revision_synthetic',
  requestId: 'e248b74d-cbac-489b-9552-b5ac2697198d',
};
function fixture(
  state: Record<string, unknown> = {},
  failure?: 'missing' | 'network'
): {
  requests: Request[];
  port: ReturnType<typeof createOperatorRuntimePort>;
  session: {
    id: string;
    metadata: { workflow_revision: string; launch_request: string };
    environment: { type: string; id: string };
  };
  authorize: ReturnType<typeof vi.fn<AgentInferenceAuthorizer['authorize']>>;
} {
  const requests: Request[] = [];
  const session = {
    id: receipt.sessionId,
    metadata: { workflow_revision: receipt.workflowRevision, launch_request: receipt.requestId },
    environment: { type: 'openai_hosted', id: 'environment_synthetic' },
  };
  const authorize = vi
    .fn<AgentInferenceAuthorizer['authorize']>()
    .mockRejectedValue(new Error('No inference authorized'));
  const port = createOperatorRuntimePort({
    config,
    apiKey: 'synthetic-invalid-key',
    inferenceAuthorizer: { authorize },
    fetchImplementation: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path.endsWith('/environments/environment_synthetic')) {
        if (failure === 'network') throw new Error('Protected provider response');
        if (failure === 'missing')
          return Response.json(
            { error: { message: 'Protected provider response' } },
            { status: 404 }
          );
        return Response.json({
          id: 'environment_synthetic',
          object: 'agent.environment',
          type: 'openai_hosted',
          status: 'connected',
          files: [{ privateContent: 'not-returned' }],
          ...state,
        });
      }
      return Response.json(
        path.endsWith('/sessions/session_synthetic') ? session : { data: [], has_more: false },
        { headers: { 'openai-project': 'proj_synthetic' } }
      );
    },
  });
  return { requests, port, session, authorize };
}

describe('verified environment observation', () => {
  it.each(['pending', 'ready', 'connected', 'disconnected', 'suspended', 'expired', 'failed'])(
    'reports exact %s state through the installed SDK without inference or resource mutation',
    async (status) => {
      const f = fixture({ status });
      try {
        expect(await f.port.inspectEnvironment(receipt)).toEqual({
          type: 'openai_hosted',
          environmentId: 'environment_synthetic',
          status,
        });
        expect(f.requests.every((request) => request.method === 'GET')).toBe(true);
        expect(
          f.requests.filter((request) =>
            new URL(request.url).pathname.endsWith('/environments/environment_synthetic')
          )
        ).toHaveLength(1);
        expect(f.authorize).not.toHaveBeenCalled();
      } finally {
        f.port.close();
      }
    }
  );
  it.each([
    { id: 'another_environment' },
    { type: 'self_hosted' },
    { status: 'future-state' },
    { status: null },
    { object: 'another.resource' },
  ])('does not turn malformed or unrelated state into evidence of expiry: %j', async (state) => {
    const f = fixture(state);
    try {
      await expect(f.port.inspectEnvironment(receipt)).rejects.toThrow(
        'Environment state is unconfirmed'
      );
      expect(f.requests.every((request) => request.method === 'GET')).toBe(true);
    } finally {
      f.port.close();
    }
  });
  it.each(['missing', 'network'] as const)(
    'does not treat %s as permission to replace a session',
    async (failure) => {
      const f = fixture({}, failure);
      try {
        await expect(f.port.inspectEnvironment(receipt)).rejects.toThrow(
          /^Environment state is unconfirmed; retain the existing execution$/
        );
        expect(f.requests.every((request) => request.method === 'GET')).toBe(true);
      } finally {
        f.port.close();
      }
    }
  );
  it('validates target and launch provenance before looking up any environment', async () => {
    const f = fixture();
    try {
      await expect(f.port.inspectEnvironment({ ...receipt, target: 'other' })).rejects.toThrow(
        'target'
      );
      expect(f.requests).toEqual([]);
      f.session.metadata.launch_request = 'another_request';
      await expect(f.port.inspectEnvironment(receipt)).rejects.toThrow();
      expect(f.requests.some((request) => request.url.includes('/environments/'))).toBe(false);
    } finally {
      f.port.close();
    }
  });
  it('reports no compute without inventing an environment lookup', async () => {
    const f = fixture();
    f.session.environment.type = 'none';
    try {
      expect(await f.port.inspectEnvironment(receipt)).toEqual({ type: 'none' });
      expect(f.requests.some((request) => request.url.includes('/environments/'))).toBe(false);
    } finally {
      f.port.close();
    }
  });
});
