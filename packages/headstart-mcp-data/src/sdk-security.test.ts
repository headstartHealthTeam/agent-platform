import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { expect, it, vi } from 'vitest';

it('does not send issuer-bound credentials to a different authorization server', async () => {
  const fetchFunction = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error('Unexpected network request'));
  const saveTokens = vi.fn();
  const provider: OAuthClientProvider = {
    redirectUrl: undefined,
    clientMetadata: {
      redirect_uris: [],
      grant_types: ['client_credentials'],
      token_endpoint_auth_method: 'client_secret_post',
    },
    clientInformation: () => ({
      client_id: 'synthetic-client',
      client_secret: 'synthetic-test-only',
      issuer: 'https://trusted.example',
    }),
    prepareTokenRequest: () => new URLSearchParams({ grant_type: 'client_credentials' }),
    tokens: () => undefined,
    saveTokens,
    redirectToAuthorization: vi.fn(),
    saveCodeVerifier: vi.fn(),
    codeVerifier: () => 'synthetic-verifier',
    discoveryState: () => ({
      authorizationServerUrl: 'https://different.example',
      resourceMetadata: {
        resource: 'https://mcp.example/mcp',
        authorization_servers: ['https://different.example'],
      },
      authorizationServerMetadata: {
        issuer: 'https://different.example',
        authorization_endpoint: 'https://different.example/authorize',
        token_endpoint: 'https://different.example/token',
        response_types_supported: ['code'],
        token_endpoint_auth_methods_supported: ['client_secret_post'],
      },
    }),
  };

  await expect(
    auth(provider, { serverUrl: 'https://mcp.example/mcp', fetchFn: fetchFunction })
  ).rejects.toThrow('bound to authorization server');
  expect(fetchFunction).not.toHaveBeenCalled();
  expect(saveTokens).not.toHaveBeenCalled();
});
