import type { AgentHostedCredentialFiles } from '@headstart-health/workflow-contracts';
import { credentialContentSha256 } from '@headstart-health/workflow-contracts';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { fingerprint, type OpenAIPlatform } from './platform.js';
import { SessionLaunchPort } from './session-launch.js';

const target = { organizationId: 'org-synthetic', projectId: 'proj_synthetic' };
const request = {
  requestId: '00000000-0000-4000-8000-000000000001',
  workflowRevision: 'r1',
  input: 'Invented',
  definition: { instructions: 'Invented', tools: [] },
};
const path = '/workspace/.credentials/ephemeral.json';
const secret = '{"access_token":"invented-secret-only"}';
const files = [{ path, content: secret }];
const settings = {
  model: 'synthetic',
  reasoning: { effort: 'high' },
  environment: {
    type: 'openai_hosted',
    network: {
      access: 'restricted',
      allowed_domains: ['oauth2.googleapis.com', 'www.googleapis.com', 'docs.googleapis.com'],
    },
  },
  credentialFiles: [path],
};
const options = {
  expectedTarget: fingerprint(target),
  retainCredentialProtection: async (): Promise<void> => undefined,
};
function setup(
  profile: unknown = settings,
  provided: AgentHostedCredentialFiles = files
): {
  platform: {
    read: Mock<OpenAIPlatform['read']>;
    preflight: Mock<OpenAIPlatform['preflight']>;
    apply: Mock<OpenAIPlatform['apply']>;
  };
  port: SessionLaunchPort;
} {
  const platform = {
    read: vi.fn<OpenAIPlatform['read']>(),
    preflight: vi
      .fn<OpenAIPlatform['preflight']>()
      .mockResolvedValue({ projectId: target.projectId, agentsRead: true }),
    apply: vi
      .fn<OpenAIPlatform['apply']>()
      .mockImplementation(async (_action, _approval, options) => {
        await options?.beforeDispatch?.();
        return {
          fingerprint: 'invented',
          data: {
            id: 'session',
            metadata: {
              launch_request: request.requestId,
              workflow_revision: request.workflowRevision,
            },
          },
        };
      }),
  };
  return {
    platform,
    port: new SessionLaunchPort(
      platform,
      target,
      profile,
      Date.now() + 60_000,
      [],
      undefined,
      provided
    ),
  };
}
describe('ephemeral hosted credential files', () => {
  it.each([
    { type: 'service_account', private_key: 'synthetic-private-key' },
    { type: 'authorized_user', refresh_token: 'synthetic-refresh-token' },
    { private_key: 'synthetic-private-key' },
    { refresh_token: 'synthetic-refresh-token' },
  ])('refuses persistent Google credentials even on exact Google hosts: %j', async (value) => {
    const { port, platform } = setup(settings, [{ path, content: JSON.stringify(value) }]);
    await expect(port.preflightLaunch(request)).rejects.toThrow('preflight failed');
    expect(await port.createSession(request, undefined, options)).toEqual({
      status: 'not-attempted',
      reason: 'validation',
    });
    expect(platform.apply).not.toHaveBeenCalled();
  });
  it('resolves launch files lazily and retries source availability without dispatching a failed launch', async () => {
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(new Error('Invented source outage'))
      .mockResolvedValue(files);
    const { port, platform } = setup(settings, resolve);
    expect(resolve).not.toHaveBeenCalled();
    await expect(port.preflightLaunch(request)).rejects.toThrow('preflight failed');
    expect(platform.apply).not.toHaveBeenCalled();
    await port.preflightLaunch(request);
    expect((await port.createSession(request, undefined, options)).status).toBe('created');
    expect(resolve).toHaveBeenCalledTimes(3);
  });
  it('places bytes only in the SDK setup, leaving intent, profile and receipt non-secret', async () => {
    const { port, platform } = setup();
    await port.preflightLaunch(request);
    const result = await port.createSession(request, undefined, options);
    expect(result.status).toBe('created');
    expect(platform.apply.mock.calls[0]?.[0]).toMatchObject({
      body: {
        environment: {
          files: [{ type: 'inline', path, data: Buffer.from(secret).toString('base64') }],
        },
      },
    });
    expect(JSON.stringify({ request, settings, result })).not.toContain('invented-secret-only');
  });
  it.each([
    { ...settings, environment: { type: 'none' } },
    { ...settings, credentialFiles: [] },
    { ...settings, credentialFiles: [path, path] },
    { ...settings, credentialFiles: ['/workspace/other'] },
    {
      ...settings,
      environment: { type: 'openai_hosted', files: [{ type: 'inline', path, data: 'eA==' }] },
    },
  ])('rejects mismatched or conflicting configuration before dispatch', async (profile) => {
    const { port, platform } = setup(profile);
    expect(
      await port.createSession(request, undefined, { expectedTarget: fingerprint(target) })
    ).toEqual({ status: 'not-attempted', reason: 'validation' });
    expect(platform.apply).not.toHaveBeenCalled();
  });
  it.each(['/workspace/outputs/key', '/workspace/outputs', '/workspace/x/../key'])(
    'rejects output/traversal credential paths: %s',
    async (invalid) => {
      const { port, platform } = setup({ ...settings, credentialFiles: [invalid] }, [
        { path: invalid, content: secret },
      ]);
      await expect(port.preflightLaunch(request)).rejects.toThrow('preflight failed');
      expect(platform.apply).not.toHaveBeenCalled();
    }
  );
  it('does not dispatch when configured files are missing or oversized', async () => {
    for (const provided of [[], [{ path, content: 'x'.repeat(5 * 1024 * 1024 + 1) }]]) {
      const { port, platform } = setup(settings, provided);
      await expect(port.preflightLaunch(request)).rejects.toThrow('preflight failed');
      expect(platform.apply).not.toHaveBeenCalled();
    }
  });
  it('requires explicit file composition with a template so credential injection cannot erase inherited runtime files', async () => {
    const environment = { ...settings.environment, environment_template_id: 'template_invented' };
    const ambiguous = setup({ ...settings, environment });
    await expect(ambiguous.port.preflightLaunch(request)).rejects.toThrow('preflight failed');
    expect(ambiguous.platform.apply).not.toHaveBeenCalled();
    const runtime = { type: 'inline', path: '/workspace/runtime/profile.json', data: 'e30=' };
    const explicit = setup({ ...settings, environment: { ...environment, files: [runtime] } });
    expect((await explicit.port.createSession(request, undefined, options)).status).toBe('created');
    expect(explicit.platform.apply.mock.calls[0]?.[0]).toMatchObject({
      body: { environment: { files: [runtime, { path }] } },
    });
  });
  it.each([
    undefined,
    { access: 'enabled' },
    { access: 'disabled' },
    { access: 'restricted' },
    { access: 'restricted', allowed_domains: [] },
    { access: 'restricted', allowed_domains: ['*'] },
    { access: 'restricted', allowed_domains: ['*.googleapis.com'] },
    { access: 'restricted', allowed_domains: ['googleapis.*'] },
    { access: 'restricted', allowed_domains: ['localhost'] },
    { access: 'restricted', allowed_domains: ['localhost.'] },
    { access: 'restricted', allowed_domains: ['googleapis.com.'] },
    { access: 'restricted', allowed_domains: ['127.0.0.1'] },
    { access: 'restricted', allowed_domains: ['127.1'] },
    { access: 'restricted', allowed_domains: ['0177.0.0.1'] },
    { access: 'restricted', allowed_domains: ['0x7f.0x0.0x0.0x1'] },
    { access: 'restricted', allowed_domains: ['[::1]'] },
    { access: 'restricted', allowed_domains: ['host.123'] },
    { access: 'restricted', allowed_domains: ['oauth2.googleapis.com', '*.example.com'] },
  ])(
    'refuses credential-file dispatch without an explicit restricted allowlist: %j',
    async (network) => {
      const { port, platform } = setup({
        ...settings,
        environment: { type: 'openai_hosted', network },
      });
      await expect(port.preflightLaunch(request)).rejects.toThrow('preflight failed');
      expect(await port.createSession(request, undefined, options)).toEqual({
        status: 'not-attempted',
        reason: 'validation',
      });
      expect(platform.apply).not.toHaveBeenCalled();
    }
  );
  it('requires durable non-secret protection before dispatch and stops on retention failure', async () => {
    const { port, platform } = setup();
    const beforeDispatch = vi.fn();
    expect(
      await port.createSession(request, undefined, { expectedTarget: fingerprint(target) })
    ).toEqual({ status: 'not-attempted', reason: 'validation' });
    const retain = vi.fn().mockImplementation(async () => {
      expect(platform.apply).not.toHaveBeenCalled();
      throw new Error('Synthetic persistence outage');
    });
    expect(
      await port.createSession(request, undefined, {
        ...options,
        retainCredentialProtection: retain,
        beforeDispatch,
      })
    ).toEqual({ status: 'not-attempted', reason: 'credential-protection' });
    expect(retain).toHaveBeenCalledWith({ contentSha256: [credentialContentSha256(secret)] });
    expect(platform.apply).not.toHaveBeenCalled();
    expect(beforeDispatch).not.toHaveBeenCalled();
  });
});
