import { createHash } from 'node:crypto';

import type { AgentResearchFileTransfer } from '@headstart-health/workflow-contracts';
import OpenAI from 'openai';
import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  transferResearchFile,
  transferWorkspaceFile,
  transferPreparedSessionFile,
} from './research-file-transfer.js';

function fixture(
  size = 100,
  fail: boolean | Response = false,
  operator = false,
  restoration = false
): {
  client: OpenAI;
  requests: Request[];
  before: Mock<() => Promise<void>>;
  file: AgentResearchFileTransfer;
} {
  const bytes = new Uint8Array(size).fill(42);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const path = restoration
    ? `/workspace/restored-context/10000000-0000-4000-8000-000000000001/0-${digest.slice(7)}`
    : operator
      ? `/workspace/operator-files/10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000002-${digest.slice(7)}`
      : `/workspace/public-research/${'a'.repeat(64)}/0-${digest.slice(7)}`;
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
  it.each([100, 26_760_658])(
    'restores a complete %i-byte original before initial inference',
    async (size) => {
      const f = fixture(size, false, false, true);
      expect(
        await transferPreparedSessionFile(f.client, 'env_synthetic', f.file, f.before)
      ).toMatchObject({ path: f.file.path, digest: f.file.digest, size });
      expect(f.requests).toHaveLength(size === 100 ? 1 : 2);
      expect(f.requests.every((request) => !request.url.includes('/sessions/'))).toBe(true);
    }
  );
  it('rejects a restored path claiming a different digest before dispatch', async () => {
    const f = fixture(100, false, false, true);
    const path = f.file.path.slice(0, -64) + '0'.repeat(64);
    await expect(
      transferPreparedSessionFile(f.client, 'env_synthetic', { ...f.file, path }, f.before)
    ).rejects.toThrow('Restored file path is not bound to its digest');
    expect(f.before).not.toHaveBeenCalled();
    expect(f.requests).toHaveLength(0);
  });
  it('does not permit restored evidence to overwrite runtime files or escape its namespace', async () => {
    const f = fixture(100, false, false, true);
    for (const path of [
      '/workspace/runtime/tool',
      '/workspace/restored-context/../secret',
      '/workspace/operator-files/file',
    ])
      await expect(
        transferPreparedSessionFile(f.client, 'env_synthetic', { ...f.file, path }, f.before)
      ).rejects.toThrow();
    expect(f.requests).toHaveLength(0);
  });
  it.each([100, 5 * 1024 * 1024 + 1])(
    'snapshots %i-byte caller input before awaiting dispatch',
    async (size) => {
      const f = fixture(size, false, true);
      const original = { path: f.file.path, digest: f.file.digest, size };
      f.before.mockImplementation(async () => {
        f.file.bytes.fill(7);
        f.file.path = '/workspace/changed';
        f.file.digest = 'sha256:' + '0'.repeat(64);
      });
      const receipt = await transferWorkspaceFile(f.client, 'env_synthetic', f.file, f.before);
      expect(receipt).toMatchObject(original);
      let bytes: Uint8Array;
      if (size === 100) {
        const body: unknown = await f.requests[0]?.json();
        if (
          body === null ||
          typeof body !== 'object' ||
          !('data' in body) ||
          typeof body.data !== 'string'
        )
          throw new Error('Expected inline bytes');
        bytes = Buffer.from(body.data, 'base64');
      } else {
        const file = (await f.requests[0]?.formData())?.get('file');
        if (!(file instanceof Blob)) throw new Error('Expected complete original');
        bytes = new Uint8Array(await file.arrayBuffer());
      }
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(original.digest);
    }
  );
  it.each([100, 5 * 1024 * 1024 + 1])(
    'stages %i-byte operator originals through the same documented SDK transport',
    async (size) => {
      const f = fixture(size, false, true);
      const receipt = await transferWorkspaceFile(f.client, 'env_synthetic', f.file, f.before);
      expect(receipt).toMatchObject({ path: f.file.path, size, digest: f.file.digest });
      expect(f.before).toHaveBeenCalledOnce();
      expect(f.requests).toHaveLength(size === 100 ? 1 : 2);
      if (size === 100)
        expect(await f.requests[0]?.json()).toEqual({
          type: 'inline',
          path: f.file.path,
          data: Buffer.from(f.file.bytes).toString('base64'),
        });
      else {
        const file = (await f.requests[0]?.formData())?.get('file');
        if (!(file instanceof Blob)) throw new Error('Expected an entire original');
        expect(
          `sha256:${createHash('sha256')
            .update(new Uint8Array(await file.arrayBuffer()))
            .digest('hex')}`
        ).toBe(f.file.digest);
      }
    }
  );
  it('rejects traversal, wrong namespace and changed bytes before an operator upload', async () => {
    const f = fixture(100, false, true);
    for (const path of ['/workspace/../secret', '/workspace/public-research/file'])
      await expect(
        transferWorkspaceFile(f.client, 'env_synthetic', { ...f.file, path }, f.before)
      ).rejects.toThrow();
    await expect(
      transferWorkspaceFile(
        f.client,
        'env_synthetic',
        { ...f.file, bytes: new Uint8Array([1]) },
        f.before
      )
    ).rejects.toThrow();
    expect(f.before).not.toHaveBeenCalled();
    expect(f.requests).toHaveLength(0);
  });
  it('retains uncertain operator delivery without SDK retries, and respects Stop before dispatch', async () => {
    const f = fixture(100, true, true);
    await expect(
      transferWorkspaceFile(f.client, 'env_synthetic', f.file, f.before)
    ).rejects.toMatchObject({ code: 'research-transfer-unknown' });
    expect(f.requests).toHaveLength(1);
    const stopped = fixture(100, false, true);
    stopped.before.mockRejectedValue(new Error('Stopped'));
    await expect(
      transferWorkspaceFile(stopped.client, 'env_synthetic', stopped.file, stopped.before)
    ).rejects.toThrow('Stopped');
    expect(stopped.requests).toHaveLength(0);
  });
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
  it.each([5 * 1024 * 1024 + 1, 26_760_658, 50 * 1024 * 1024])(
    'uses the SDK Files upload path for a complete %i-byte original',
    async (size) => {
      const f = fixture(size);
      expect(await transferResearchFile(f.client, 'env_synthetic', f.file, f.before)).toMatchObject(
        {
          size: f.file.bytes.length,
          uploadedFileId: 'file-synthetic',
        }
      );
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
    }
  );
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
      if (kind === 'capacity') {
        f.file.bytes = new Uint8Array(50 * 1024 * 1024 + 1);
        f.file.digest = `sha256:${createHash('sha256').update(f.file.bytes).digest('hex')}`;
      }
      await expect(
        transferResearchFile(f.client, 'env_synthetic', f.file, f.before)
      ).rejects.toThrow();
      expect(f.before).not.toHaveBeenCalled();
      expect(f.requests).toHaveLength(0);
    }
  );
  it('keeps the separate operator upload limit at 10 MiB before dispatch', async () => {
    const f = fixture(10 * 1024 * 1024 + 1, false, true);
    await expect(
      transferWorkspaceFile(f.client, 'env_synthetic', f.file, f.before)
    ).rejects.toThrow();
    expect(f.before).not.toHaveBeenCalled();
    expect(f.requests).toHaveLength(0);
  });
});
