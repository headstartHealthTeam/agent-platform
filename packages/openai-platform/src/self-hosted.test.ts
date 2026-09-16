import { describe, expect, it } from 'vitest';

import { summarize } from './platform.js';
import { selfHostedExecutorConnection } from './self-hosted.js';

const remoteUrl = 'wss://codex-cloud-environments.chatgpt.com/session/env_synthetic?route=a%2Fb';
const session = {
  id: 'session_synthetic',
  environment: {
    type: 'self_hosted',
    id: 'env_synthetic',
    remote_url: remoteUrl,
    workspace_directory: '/workspace',
    capability_directories: [],
  },
};

describe('self-hosted executor connection boundary', () => {
  it('preserves returned routing and environment identity exactly without launching a process', () => {
    expect(selfHostedExecutorConnection(session, session.id)).toEqual({
      sessionId: session.id,
      environmentId: session.environment.id,
      arguments: ['exec-server', '--remote', remoteUrl, '--environment-id', 'env_synthetic'],
    });
    expect(summarize(session)).toEqual({ id: session.id });
  });

  it('does not accept another session, no executor or another environment type', () => {
    expect(() => selfHostedExecutorConnection(session, 'session_other')).toThrow('unexpected');
    for (const input of [
      null,
      {},
      { ...session, environment: { type: 'none' } },
      {
        ...session,
        environment: { ...session.environment, type: 'openai_hosted' },
      },
    ]) {
      expect(() => selfHostedExecutorConnection(input, session.id)).toThrow('no executor launched');
    }
  });

  it.each([
    'https://codex-cloud-environments.chatgpt.com/session/env_synthetic',
    'ws://codex-cloud-environments.chatgpt.com/session/env_synthetic',
    'wss://example.invalid/session/env_synthetic',
    'wss://codex-cloud-environments.chatgpt.com.example.invalid/session/env_synthetic',
    'wss://codex-cloud-environments.chatgpt.com:8443/session/env_synthetic',
    'wss://private-user@codex-cloud-environments.chatgpt.com/session/env_synthetic',
    'wss://user:private-value@codex-cloud-environments.chatgpt.com/session/env_synthetic',
    `${remoteUrl}#private-value`,
    'not a url with private-value',
  ])('rejects unsupported connection routing without echoing the value: %s', (remote_url) => {
    expect(() =>
      selfHostedExecutorConnection(
        {
          ...session,
          environment: { ...session.environment, remote_url },
        },
        session.id
      )
    ).toThrow('Invalid self-hosted connection');
    expect(() =>
      selfHostedExecutorConnection(
        {
          ...session,
          environment: { ...session.environment, remote_url },
        },
        session.id
      )
    ).not.toThrow('private-value');
  });
});
