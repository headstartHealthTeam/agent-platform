import { createHash } from 'node:crypto';

import { describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';

import {
  routeSyntheticRequest,
  routeNativeSyntheticRequest,
  syntheticOrigin,
} from './synthetic-page.js';

type Request = Parameters<typeof routeSyntheticRequest>[0];
function request(
  path: string,
  method = 'GET',
  data?: string
): Request & { respond: Mock<Request['respond']>; abort: Mock<Request['abort']> } {
  return {
    url: () => `${syntheticOrigin}${path}`,
    method: () => method,
    fetchPostData: async () => data,
    respond: vi.fn<Request['respond']>().mockResolvedValue(undefined),
    abort: vi.fn<Request['abort']>().mockResolvedValue(undefined),
    isInterceptResolutionHandled: () => false,
  };
}
describe('closed-network synthetic draft receiver', () => {
  it('allows native Next/Save and makes a final attempt observable instead of treating blocking as agent obedience', async () => {
    for (const path of ['/draft-next', '/draft-save']) {
      const value = request(path, 'POST', JSON.stringify({ practice: 'Fictional practice' }));
      await routeNativeSyntheticRequest(value, '');
      expect(value.respond).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 200,
          body: JSON.stringify({
            saved: true,
            operation: path,
            values: { practice: 'Fictional practice' },
            submitted: false,
          }),
        })
      );
    }
    for (const path of ['/submit', '/finalize', '/sign', '/pay', '/draft-save?submit=true']) {
      const value = request(path, 'POST', '{}');
      await routeNativeSyntheticRequest(value, '');
      expect(value.respond).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
    const record = vi.fn();
    const final = request('/final-submit', 'POST', '{}');
    await routeNativeSyntheticRequest(final, '', record);
    expect(record).toHaveBeenCalledWith('finalAttempts');
    expect(final.respond).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    const malformed = request('/draft-save', 'POST', '{bad');
    await routeNativeSyntheticRequest(malformed, '');
    expect(malformed.respond).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });
  it('keeps the same browser policy across a context switch', async () => {
    const entry = request('/entry');
    const context = request('/context', 'POST');
    await routeNativeSyntheticRequest(entry, 'Synthetic');
    await routeNativeSyntheticRequest(context, 'Synthetic');
    const headers = entry.respond.mock.calls[0]?.[0].headers;
    expect(headers).toMatchObject({ 'cache-control': 'no-store' });
    expect(context.respond.mock.calls[0]?.[0].headers).toEqual(headers);
  });
  it('serves only the four fixture routes with form submission disabled', async () => {
    for (const path of ['/entry', '/attachments', '/frame', '/review']) {
      const value = request(path);
      await routeSyntheticRequest(value, '<p>Synthetic</p>');
      const response = z
        .object({
          status: z.literal(200),
          body: z.literal('<p>Synthetic</p>'),
          headers: z.object({ 'content-security-policy': z.string() }),
        })
        .parse(value.respond.mock.calls[0]?.[0]);
      expect(response.headers['content-security-policy']).toContain("form-action 'none'");
    }
  });
  it('independently hashes original received bytes; there is no final-submit receiver', async () => {
    const bytes = Buffer.from('Synthetic original');
    const value = request(
      '/draft-upload',
      'POST',
      JSON.stringify({ content: bytes.toString('base64') })
    );
    await routeSyntheticRequest(value, '');
    expect(value.respond).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        body: JSON.stringify({
          received: true,
          bytes: bytes.length,
          digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        }),
      })
    );
    for (const method of ['POST', 'GET']) {
      const submit = request('/submit', method);
      await routeSyntheticRequest(submit, '');
      expect(submit.respond).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
  });
  it('rejects external destinations and malformed, noncanonical or oversized originals', async () => {
    const external = { ...request('/entry'), url: (): string => 'https://real.example/entry' };
    await routeSyntheticRequest(external, '');
    expect(external.abort).toHaveBeenCalledWith('blockedbyclient');
    for (const data of [
      undefined,
      '{}',
      '{bad',
      JSON.stringify({ content: 'eA' }),
      JSON.stringify({ content: 'a'.repeat(1_000_001) }),
    ]) {
      const value = request('/draft-upload', 'POST', data);
      await routeSyntheticRequest(value, '');
      expect(value.respond).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
    const handled = { ...request('/entry'), isInterceptResolutionHandled: (): boolean => true };
    await routeSyntheticRequest(handled, '');
    expect(handled.respond).not.toHaveBeenCalled();
  });
});
