import { createHash } from 'node:crypto';

import type { AgentResearchFileTransfer } from '@headstart-health/workflow-contracts';
import OpenAI from 'openai';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { transferResearchFile } from './research-file-transfer.js';

function fixture(
  size = 100,
  fail: boolean | Response = false
): {
  client: OpenAI;
  requests: Request[];
  before: Mock<() => Promise<void>>;
  file: AgentResearchFileTransfer;
} {
  const bytes = new Uint8Array(size).fill(42);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const path = `/workspace/public-research/${'a'.repeat(64)}/0-${digest.slice(7)}`;
  const requests: Request[] = [];
  const before = vi.fn<() => Promise<void>>().mockResolvedValue();
  const client = new OpenAI({
    apiKey: 'synthetic',
    maxRetries: 2,
    fetch: async (input, init): Promise<Response> => {
      expect(before).toHaveBeenCalledOnce();
      const request = new Request(input, init);
      if (request.url === 'data:,') return new Response(''); // SDK local multipart support probe.
      requests.push(request);
      if (request.url.endsWith('/files') && !request.url.includes('/environments/'))
        return Response.json({
          id: 'file-synthetic',
          object: 'file',
          bytes: size,
          purpose: 'user_data',
          filename: 'public-original',
          created_at: 1,
        });
      if (fail instanceof Response) return fail;
      if (fail) throw new Error('private transport diagnostics');
      return Response.json({
        environment_id: 'env_synthetic',
        path,
        size_bytes: size,
        object: 'agent.environment.file',
      });
    },
  });
  return { client, requests, before, file: { bytes, digest, path } };
}
describe('exact public originals through Agents API environment Files', () => {
  it('stages complete inline bytes only after durable dispatch, without a source fetch', async () => {
    const f = fixture();
    expect(await transferResearchFile(f.client, 'env_synthetic', f.file, f.before)).toEqual({
      environmentId: 'env_synthetic',
      path: f.file.path,
      digest: f.file.digest,
      size: 100,
    });
    expect(f.requests).toHaveLength(1);
    expect(await f.requests[0]?.json()).toEqual({
      type: 'inline',
      path: f.file.path,
      data: Buffer.from(f.file.bytes).toString('base64'),
    });
  });
  it('uses the SDK Files upload path for full originals beyond the inline limit', async () => {
    const f = fixture(5 * 1024 * 1024 + 1);
    expect(await transferResearchFile(f.client, 'env_synthetic', f.file, f.before)).toMatchObject({
      size: f.file.bytes.length,
      uploadedFileId: 'file-synthetic',
    });
    expect(f.requests).toHaveLength(2);
    const form = await f.requests[0]?.formData();
    const file = form?.get('file');
    if (!(file instanceof Blob)) throw new Error('Expected full original');
    const complete = new Uint8Array(await file.arrayBuffer());
    expect(complete.length).toBe(f.file.bytes.length);
    expect(`sha256:${createHash('sha256').update(complete).digest('hex')}`).toBe(f.file.digest);
    expect(await f.requests[1]?.json()).toEqual({
      type: 'file_id',
      file_id: 'file-synthetic',
      path: f.file.path,
    });
  });
  it.each([100, 5 * 1024 * 1024 + 1])(
    'never retries an uncertain %i-byte upload and retains known public file ownership',
    async (size) => {
      const f = fixture(size, true);
      await expect(
        transferResearchFile(f.client, 'env_synthetic', f.file, f.before)
      ).rejects.toMatchObject({
        code: 'research-transfer-unknown',
        uploadedFileIds: size === 100 ? [] : ['file-synthetic'],
      });
      expect(f.requests).toHaveLength(size === 100 ? 1 : 2);
    }
  );
  it('does not upload when Stop prevents the journal acknowledgement', async () => {
    const f = fixture();
    f.before.mockRejectedValue(new Error('Stopped'));
    await expect(transferResearchFile(f.client, 'env_synthetic', f.file, f.before)).rejects.toThrow(
      'Stopped'
    );
    expect(f.requests).toHaveLength(0);
  });
  it.each([100, 5 * 1024 * 1024 + 1])(
    'retains safe provider diagnostics for a rejected %i-byte transfer without a replay',
    async (size) => {
      const f = fixture(
        size,
        Response.json(
          {
            error: {
              message: 'private source and credential details',
              type: 'rate_limit_error',
              code: 'files_api_rate_limit_exceeded',
              param: 'private parameter value',
            },
          },
          { status: 429 }
        )
      );
      let failure: unknown;
      try {
        await transferResearchFile(f.client, 'env_synthetic', f.file, f.before);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({
        code: 'research-transfer-unknown',
        diagnostic: {
          operation: 'environment-file-transfer',
          phase: 'environment-create',
          transport: size === 100 ? 'inline' : 'file-id',
          kind: 'http',
          status: 429,
          code: 'files_api_rate_limit_exceeded',
        },
      });
      expect(JSON.stringify(failure)).not.toMatch(/private|credential|parameter/);
      expect(f.requests).toHaveLength(size === 100 ? 1 : 2);
    }
  );
  it('distinguishes a bad receipt from a transport failure without accepting it', async () => {
    const f = fixture(
      100,
      Response.json({ environment_id: 'other', path: '/other', size_bytes: 100 })
    );
    await expect(
      transferResearchFile(f.client, 'env_synthetic', f.file, f.before)
    ).rejects.toMatchObject({
      diagnostic: {
        operation: 'environment-file-transfer',
        phase: 'receipt-validation',
        transport: 'inline',
        kind: 'invalid-receipt',
      },
    });
    expect(f.requests).toHaveLength(1);
  });
  it('identifies failure of the initial Files API upload, before any environment copy', async () => {
    const f = fixture(5 * 1024 * 1024 + 1);
    vi.spyOn(f.client.files, 'create').mockImplementation(() => {
      throw new OpenAI.APIError(
        503,
        { code: 'server_error', message: 'private' },
        undefined,
        new Headers()
      );
    });
    await expect(
      transferResearchFile(f.client, 'env_synthetic', f.file, f.before)
    ).rejects.toMatchObject({
      uploadedFileIds: [],
      diagnostic: {
        phase: 'files-upload',
        transport: 'file-id',
        kind: 'http',
        status: 503,
        code: 'server_error',
      },
    });
    expect(f.requests).toHaveLength(0);
    expect(f.before).toHaveBeenCalledOnce();
  });
  it.each([
    { error: new OpenAI.APIConnectionTimeoutError({ message: 'private' }), kind: 'timeout' },
    { error: new OpenAI.APIUserAbortError({ message: 'private' }), kind: 'aborted' },
    { error: new OpenAI.APIConnectionError({ message: 'private' }), kind: 'connection' },
    { error: new Error('private'), kind: 'unclassified' },
  ])('distinguishes $kind without retaining the SDK error', async ({ error, kind }) => {
    const f = fixture();
    vi.spyOn(f.client.beta.agents.environments.files, 'create').mockImplementation(() => {
      throw error;
    });
    let failure: unknown;
    try {
      await transferResearchFile(f.client, 'env_synthetic', f.file, f.before);
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toMatchObject({
      diagnostic: { phase: 'environment-create', transport: 'inline', kind },
    });
    expect(JSON.stringify(failure)).not.toContain('private');
    expect(f.requests).toHaveLength(0);
  });
  it('identifies expiration of its owned deadline even when the SDK reports an abort', async () => {
    const f = fixture();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
    try {
      await expect(
        transferResearchFile(f.client, 'env_synthetic', f.file, f.before)
      ).rejects.toMatchObject({
        diagnostic: { phase: 'environment-create', kind: 'timeout' },
      });
      expect(f.requests).toHaveLength(0);
    } finally {
      timeout.mockRestore();
    }
  });
  it.each(['digest', 'path', 'capacity'] as const)(
    'rejects invalid %s before dispatch',
    async (kind) => {
      const f = fixture();
      if (kind === 'digest') f.file.digest = `sha256:${'0'.repeat(64)}`;
      if (kind === 'path') f.file.path = '/workspace/private/credential';
      if (kind === 'capacity') f.file.bytes = new Uint8Array(10 * 1024 * 1024 + 1);
      await expect(
        transferResearchFile(f.client, 'env_synthetic', f.file, f.before)
      ).rejects.toThrow();
      expect(f.before).not.toHaveBeenCalled();
      expect(f.requests).toHaveLength(0);
    }
  );
});
