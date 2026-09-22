import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleFileTokenProvider } from './file-token-provider.js';

const mocks = vi.hoisted(() => ({ getAccessToken: vi.fn(), construct: vi.fn() }));
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    public constructor(options: unknown) {
      mocks.construct(options);
    }
    public getAccessToken = mocks.getAccessToken;
  },
}));
describe('explicit runtime Google credential binding', () => {
  afterEach(() => vi.resetAllMocks());
  it('uses only the named file and scopes and lets Google refresh tokens', async () => {
    mocks.getAccessToken.mockResolvedValue('synthetic-token');
    const provider = new GoogleFileTokenProvider('/private/credential.json', ['readonly-scope']);
    expect(await provider.getAccessToken()).toBe('synthetic-token');
    expect(await provider.getAccessToken()).toBe('synthetic-token');
    expect(mocks.construct).toHaveBeenCalledWith({
      keyFile: '/private/credential.json',
      scopes: ['readonly-scope'],
    });
    expect(mocks.getAccessToken).toHaveBeenCalledTimes(2);
  });
  it('rejects implicit identity selection', () => {
    expect(() => new GoogleFileTokenProvider('relative', ['scope'])).toThrow('absolute');
    expect(() => new GoogleFileTokenProvider('/private/file', [])).toThrow('explicit');
    expect(mocks.construct).not.toHaveBeenCalled();
  });
  it('never propagates credential details', async () => {
    const provider = new GoogleFileTokenProvider('/private/credential.json', ['scope']);
    mocks.getAccessToken.mockRejectedValue(new Error('sensitive credential material'));
    await expect(provider.getAccessToken()).rejects.toThrow('could not supply');
    mocks.getAccessToken.mockResolvedValue(null);
    await expect(provider.getAccessToken()).rejects.toThrow('could not supply');
  });
});
