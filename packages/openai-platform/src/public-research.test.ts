import { describe, expect, it, vi } from 'vitest';

import { fingerprint } from './fingerprint.js';
import { actionSchema } from './operations.js';
import { OperatorRuntimePort } from './operator-runtime.js';
import type { OpenAIPlatform } from './platform.js';
import { publicResearchLaunch } from './public-research.js';
import { publicResearchSettings } from './research-launch.js';

it('binds the public browser instructions/tools but leaves research strategy to the agent', () => {
  const first = publicResearchLaunch({
    requestId: 'ba5413e2-bac0-413c-af4e-2b3c5b3645b2',
    brief: 'Find current official blank forms and follow incorporated references.',
  });
  const second = publicResearchLaunch({
    requestId: 'ba5413e2-bac0-413c-af4e-2b3c5b3645b3',
    brief: 'Resolve a different public research question.',
  });
  expect(first.definition).toMatchObject({ research: 'public-browser', tools: [] });
  expect(first.workflowRevision).toBe(fingerprint(first.definition));
  expect(second.workflowRevision).toBe(first.workflowRevision);
  for (const text of [
    'no payer-specific site list',
    'full document retrieval',
    'no Ops approval',
    'complete unchanged originals',
    'no Salesforce',
    'primary agent remains responsible',
  ])
    expect(first.definition.instructions).toContain(text);
});
describe('public environment isolation', () => {
  it('launches from the actual operator port without resolving or copying primary credentials', async () => {
    const target = { organizationId: 'org-synthetic', projectId: 'proj_synthetic' };
    const request = publicResearchLaunch({
      requestId: 'ba5413e2-bac0-413c-af4e-2b3c5b3645b2',
      brief: 'Read current official public sources.',
    });
    const platform = {
      preflight: vi
        .fn<OpenAIPlatform['preflight']>()
        .mockResolvedValue({ projectId: target.projectId, agentsRead: true }),
      apply: vi
        .fn<OpenAIPlatform['apply']>()
        .mockImplementation(async (_action, _approval, options) => {
          await options?.beforeDispatch?.();
          return {
            data: {
              id: 'public_session',
              metadata: {
                workflow_revision: request.workflowRevision,
                launch_request: request.requestId,
              },
            },
            fingerprint: 'synthetic',
          };
        }),
      read: vi.fn<OpenAIPlatform['read']>(),
      openOperatorObservation: vi.fn<OpenAIPlatform['openOperatorObservation']>(),
    };
    const credentialFiles = vi
      .fn()
      .mockRejectedValue(new Error('Must not resolve private credentials'));
    const port = new OperatorRuntimePort(
      platform,
      target,
      Date.now() + 60000,
      ['research_public_sources'],
      {
        model: 'synthetic',
        reasoning: { effort: 'high' },
        environment: {
          type: 'openai_hosted',
          environment_template_id: 'private_template',
          env: { PRIVATE: 'synthetic-private-value' },
        },
        mcpServers: [{ type: 'mcp', server_label: 'private' }],
      },
      undefined,
      credentialFiles
    );
    expect(
      await port.createSession(request, undefined, {
        expectedTarget: fingerprint(target),
        beforeDispatch: async () => undefined,
      })
    ).toMatchObject({ status: 'created' });
    expect(credentialFiles).not.toHaveBeenCalled();
    const action = actionSchema.parse(platform.apply.mock.calls[0]?.[0]);
    if (action.operation !== 'sessions.create' || !('agent' in action.body))
      throw new Error('Expected create');
    expect(action.body.agent.tools).toEqual([
      { type: 'web_search', mode: 'live', context_size: 'high' },
      { type: 'computer_use', include_screenshots: false },
    ]);
    expect(action.body.environment).toEqual({
      type: 'openai_hosted',
      desktop: { enabled: true },
      network: { access: 'enabled' },
    });
    expect(JSON.stringify(action)).not.toContain('synthetic-private-value');
    port.close();
  });
  it('copies only model settings, not the protected profile or inherited source configuration', () => {
    const result = publicResearchSettings({
      model: 'synthetic',
      reasoning: { effort: 'high' },
      environment: {
        type: 'openai_hosted',
        environment_template_id: 'private_template',
        env: { PRIVATE: 'synthetic-placeholder' },
        files: [{ path: '/workspace/private' }],
      },
      mcpServers: [{ type: 'mcp', transport: { authorization: 'synthetic-placeholder' } }],
    });
    expect(result).toEqual({
      model: 'synthetic',
      reasoning: { effort: 'high' },
      mcpServers: [],
      environment: {
        type: 'openai_hosted',
        desktop: { enabled: true },
        network: { access: 'enabled' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('rejects malformed launch configuration instead of silently inventing model settings', () => {
    expect(() => publicResearchSettings({ environment: {} })).toThrow();
  });
});
