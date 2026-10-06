import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { credentialingHostedTemplate } from '../credentialing-hosted-template.js';
import { credentialingReleaseDefinition } from '../package-credentialing-runtime.js';

describe('credentialing runtime release boundary', () => {
  it('reproducibly binds source, dependency lock and complete canonical definition without inlining skills', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'credentialing-release-'));
    try {
      const distribution = join(directory, 'workflows/provider-credentialing/dist');
      await mkdir(distribution, { recursive: true });
      const definition = {
        protocol: 'credentialing-preparation/v1',
        definition: {
          instructions: 'Read the complete skill',
          capabilities: {
            files: [
              {
                path: '/workspace/headstart-workflow/skills/headstart-provider-credentialing/SKILL.md',
                data: Buffer.from('Full instructions').toString('base64'),
              },
            ],
          },
          tools: [{ type: 'function', name: 'ask_operator' }],
        },
      };
      await writeFile(
        join(distribution, 'preparation-definition.json'),
        JSON.stringify(definition)
      );
      await writeFile(join(directory, 'pnpm-lock.yaml'), 'lock-v1');
      const original = await credentialingReleaseDefinition(directory, async () => 'a'.repeat(40));
      expect(original).toEqual(
        await credentialingReleaseDefinition(directory, async () => 'a'.repeat(40))
      );
      expect(original.artifact.definition).not.toHaveProperty('capabilities');
      expect(original.files).toEqual(definition.definition.capabilities.files);
      expect(original.artifact.workflowRevision).toBe(
        createHash('sha256').update(JSON.stringify(original.artifact.definition)).digest('hex')
      );
      await writeFile(join(directory, 'pnpm-lock.yaml'), 'lock-v2');
      expect(
        (await credentialingReleaseDefinition(directory, async () => 'a'.repeat(40))).artifact
          .definition.runtimeRevision
      ).not.toBe(original.artifact.definition.runtimeRevision);
      expect(
        (await credentialingReleaseDefinition(directory, async () => 'b'.repeat(40))).artifact
          .definition.runtimeRevision
      ).not.toBe(original.artifact.definition.runtimeRevision);
      await expect(credentialingReleaseDefinition(directory, async () => 'main')).rejects.toThrow(
        'source revision'
      );
      expect(await readFile(join(directory, 'pnpm-lock.yaml'), 'utf8')).toBe('lock-v2');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  const selection = {
    fileId: 'file-synthetic',
    archiveSha256: 'a'.repeat(64),
    runtimeRevision: 'b'.repeat(64),
    mcpUrl: 'https://api.example.com/mcp',
    googleTokenUrl: 'https://api.example.com/service-access/google/token',
    googleAccountEmail: 'runtime@synthetic.iam.gserviceaccount.com',
    allowedDomains: [
      'api.example.com',
      'www.googleapis.com',
      'docs.googleapis.com',
      'sheets.googleapis.com',
      'slides.googleapis.com',
    ],
  };
  it('installs tools and discovered skills before the agent starts, with one existing run credential', () => {
    const template = credentialingHostedTemplate(selection);
    const text = JSON.stringify(template);
    expect(template['operation']).toBe('templates.create');
    expect(template['body']).toMatchObject({ env: { NODE_USE_ENV_PROXY: '1' } });
    expect(text).toContain('/workspace/headstart-workflow/skills');
    expect(text).not.toContain('private_key');
    expect(text).not.toContain('node_modules'); // packages reside in the uploaded runtime, not duplicated JSON
    expect(() =>
      credentialingHostedTemplate({
        ...selection,
        mcpUrl: 'https://api.example.com/mcp?token=secret',
      })
    ).toThrow();
    expect(() =>
      credentialingHostedTemplate({ ...selection, allowedDomains: ['*.example.com'] })
    ).toThrow();
    expect(() =>
      credentialingHostedTemplate({ ...selection, allowedDomains: ['api.example.com'] })
    ).toThrow('Missing required runtime host');
    expect(() =>
      credentialingHostedTemplate({
        ...selection,
        googleTokenUrl: 'https://other.example.com/token',
      })
    ).toThrow('share the run credential destination');
    expect(() =>
      credentialingHostedTemplate({ ...selection, mcpUrl: 'https://api.example.com:1234/mcp' })
    ).toThrow();
  });
  it('retains current and legacy uploaded-file identifiers without rewriting them', () => {
    for (const fileId of ['file_synthetic', 'file-synthetic']) {
      const body = z
        .object({ files: z.array(z.unknown()) })
        .parse(credentialingHostedTemplate({ ...selection, fileId })['body']);
      expect(body.files).toContainEqual({
        type: 'file_id',
        path: '/workspace/headstart-runtime.tar.gz',
        file_id: fileId,
      });
    }
    expect(() => credentialingHostedTemplate({ ...selection, fileId: 'arbitrary' })).toThrow();
  });
  it('uses the generated hosted environment for Node fetch while honoring NO_PROXY', async () => {
    const template = z
      .object({ body: z.object({ env: z.record(z.string(), z.string()) }) })
      .parse(credentialingHostedTemplate(selection));
    const proxy = createServer();
    const direct = createServer((_request, response) => response.end('direct'));
    const destinations: string[] = [];
    proxy.on('connect', (request, socket) => {
      destinations.push(request.url ?? '');
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.once('data', () =>
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nproxied')
      );
    });
    await new Promise<void>((resolve) => proxy.listen(0, 'localhost', resolve));
    await new Promise<void>((resolve) => direct.listen(0, 'localhost', resolve));
    try {
      const proxyAddress = proxy.address();
      const directAddress = direct.address();
      if (
        proxyAddress === null ||
        typeof proxyAddress === 'string' ||
        directAddress === null ||
        typeof directAddress === 'string'
      )
        throw new Error('Missing synthetic port');
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          'for (const url of process.argv.slice(1)) console.log(await (await fetch(url)).text());',
          'http://synthetic-unresolvable.invalid/evidence',
          `http://localhost:${String(directAddress.port)}/evidence`,
        ],
        {
          timeout: 10_000,
          env: {
            ...process.env,
            ...template.body.env,
            HTTP_PROXY: `http://localhost:${String(proxyAddress.port)}`,
            HTTPS_PROXY: '',
            NO_PROXY: 'localhost',
            http_proxy: `http://localhost:${String(proxyAddress.port)}`,
            https_proxy: '',
            no_proxy: 'localhost',
            NODE_OPTIONS: '',
          },
        }
      );
      expect(stdout.trim().split(/\r?\n/)).toEqual(['proxied', 'direct']);
      expect(destinations).toEqual(['synthetic-unresolvable.invalid:80']);
    } finally {
      proxy.closeAllConnections();
      direct.closeAllConnections();
      await Promise.all(
        [proxy, direct].map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => {
                if (error) reject(error);
                else resolve();
              })
            )
        )
      );
    }
  }, 20_000);
});
