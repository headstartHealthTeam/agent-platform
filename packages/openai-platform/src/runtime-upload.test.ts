import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRuntimeConfig } from './config.js';
import { OpenAIPlatform, planAction } from './platform.js';
import { prepareRuntimeUpload } from './runtime-upload.js';

describe('reviewed runtime upload', () => {
  it('dispatches captured bytes through the real SDK only after exact approval and project preflight', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-sdk-upload-'));
    try {
      const path = join(root, 'runtime.tar.gz');
      const bytes = Buffer.from('invented archive bytes');
      await writeFile(path, bytes);
      const config = resolveRuntimeConfig({
        profile: {
          schemaVersion: 'headstart-capability-profile/v1',
          id: 'synthetic',
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
      });
      const requests: Request[] = [];
      const platform = new OpenAIPlatform(config, 'synthetic-api-key', async (input, init) => {
        const request = new Request(input, init);
        // The SDK probes FormData support with a local data URL before its multipart upload.
        if (new URL(request.url).protocol === 'data:') return new Response('');
        requests.push(request);
        if (request.method === 'GET')
          return Response.json(
            { data: [], has_more: false },
            { headers: { 'openai-project': 'proj_synthetic' } }
          );
        const body = await request.formData();
        expect(body.get('purpose')).toBe('user_data');
        const file = body.get('file');
        if (file === null || typeof file === 'string') throw new Error('Missing upload');
        expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
        return Response.json({ id: 'file-synthetic', object: 'file' });
      });
      const action = {
        operation: 'files.upload',
        path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      const plan = planAction(config.target, action);
      expect(plan.billable).toBe(false);
      await expect(
        platform.apply(action, { apply: true, digest: 'wrong', allowBillable: false })
      ).rejects.toThrow();
      expect(requests).toHaveLength(0);
      await platform.apply(action, { apply: true, digest: plan.digest, allowBillable: false });
      expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
        ['GET', '/v1/agents'],
        ['POST', '/v1/files'],
      ]);
      await writeFile(path, 'changed since approval');
      await expect(
        platform.apply(action, { apply: true, digest: plan.digest, allowBillable: false })
      ).rejects.toThrow();
      expect(requests).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('uploads exactly the captured approved bytes and rejects stale or oversized inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-upload-'));
    try {
      const path = join(root, 'runtime.tar.gz');
      const bytes = Buffer.from('synthetic runtime archive');
      const digest = createHash('sha256').update(bytes).digest('hex');
      await writeFile(path, bytes);
      const file = await prepareRuntimeUpload(path, digest);
      await writeFile(path, 'changed');
      expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
      await expect(prepareRuntimeUpload(path, digest)).rejects.toThrow('changed since approval');
      await writeFile(path, Buffer.alloc(50 * 1024 * 1024 + 1));
      await expect(prepareRuntimeUpload(path, digest)).rejects.toThrow('capacity');
      await writeFile(path, '');
      await expect(prepareRuntimeUpload(path, digest)).rejects.toThrow('capacity');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
