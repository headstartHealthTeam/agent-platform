import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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
});
