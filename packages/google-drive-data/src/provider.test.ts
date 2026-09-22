import { describe, expect, it, vi } from 'vitest';

import { GoogleDriveRestProvider } from './provider.js';

describe('Drive REST provider', () => {
  it('composes read URLs and preserves resource keys through the shared transport', async () => {
    const response = new Response('full bytes');
    const readResponse = vi
      .fn<(url: string, key?: string) => Promise<Response>>()
      .mockResolvedValue(response);
    const provider = new GoogleDriveRestProvider({ readResponse });
    expect(await provider.get('files/abc', { alt: 'media' }, 'abc/key')).toBe(response);
    expect(readResponse).toHaveBeenLastCalledWith(
      'https://www.googleapis.com/drive/v3/files/abc?alt=media',
      'abc/key'
    );
    await provider.get('documents/abc', { includeTabsContent: 'true' });
    expect(readResponse).toHaveBeenLastCalledWith(
      'https://docs.googleapis.com/v1/documents/abc?includeTabsContent=true',
      undefined
    );
    await expect(provider.get('https://evil.example/private', {})).rejects.toThrow('Unsupported');
    await expect(provider.get('files/abc/permissions', {})).rejects.toThrow('Unsupported');
    expect(readResponse).toHaveBeenCalledTimes(2);
  });
});
