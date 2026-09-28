import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageBackendIntegration } from '../package-backend-integration.js';
import { packageCredentialingRuntime } from '../package-credentialing-runtime.js';
import { runtimeFingerprint, type RuntimeCommand } from '../runtime-packaging.js';
import { verifyCredentialingRuntime } from '../verify-credentialing-runtime.js';

describe('credentialing release assembly', () => {
  it('retains the complete canonical files in the runtime and only three integration files in the application', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'credentialing-packaging-')));
    try {
      const source = join(directory, 'source');
      const workflow = join(source, 'workflows/provider-credentialing/dist');
      const operator = join(source, 'packages/openai-platform/dist/operator');
      await mkdir(workflow, { recursive: true });
      await mkdir(operator, { recursive: true });
      await writeFile(join(source, 'pnpm-lock.yaml'), 'synthetic lock');
      await writeFile(join(workflow, 'index.js'), '// workflow');
      await writeFile(join(workflow, 'artifact-worker.cjs'), '// validator');
      await writeFile(join(operator, 'operator-module.cjs'), '// application adapter');
      const definition = {
        protocol: 'credentialing-preparation/v1',
        definition: {
          instructions: 'Read the complete skill',
          tools: [],
          capabilities: {
            files: [
              {
                path: '/workspace/headstart-workflow/skills/headstart-provider-credentialing/SKILL.md',
                data: Buffer.from('Full skill').toString('base64'),
              },
              {
                path: '/workspace/headstart-workflow/workflows/provider-credentialing/prompts/connected.md',
                data: Buffer.from('Full prompt').toString('base64'),
              },
            ],
          },
        },
      };
      await writeFile(join(workflow, 'preparation-definition.json'), JSON.stringify(definition));
      const target = join(directory, 'runtime');
      const command: RuntimeCommand = async (_command, args) => {
        if (args.includes('--version')) return '9.15.0';
        if (args.includes('rev-parse')) return 'a'.repeat(40);
        if (args.includes('status')) return '';
        expect(args).toContain('@headstart-health/workflow-provider-credentialing');
        await mkdir(target);
        await writeFile(
          join(target, 'package.json'),
          JSON.stringify({
            name: '@headstart-health/workflow-provider-credentialing',
            version: '0.1.0',
          })
        );
        for (const name of ['document-reading', 'google-drive-data', 'headstart-mcp-data']) {
          const path = join(target, `node_modules/@headstart-health/${name}/dist`);
          await mkdir(path, { recursive: true });
          await writeFile(join(path, 'cli.js'), '// installed production entry');
        }
        return '';
      };
      const receipt = await packageCredentialingRuntime(source, target, command);
      expect(receipt).toMatchObject({
        sourceDirty: false,
        sourceRevision: 'a'.repeat(40),
        artifactSha256: await runtimeFingerprint(target),
      });
      expect(
        await readFile(join(target, 'skills/headstart-provider-credentialing/SKILL.md'), 'utf8')
      ).toBe('Full skill');
      expect(
        await readFile(
          join(target, 'workflows/provider-credentialing/prompts/connected.md'),
          'utf8'
        )
      ).toBe('Full prompt');
      expect(await readFile(join(target, 'RUNTIME.md'), 'utf8')).toContain(
        'investigation outside a prescribed sequence'
      );
      const integration = join(directory, 'application');
      const manifest = await packageBackendIntegration(source, integration, command);
      expect(manifest).toMatchObject({
        sourceRevision: 'a'.repeat(40),
        runtimeRevision: receipt['runtimeRevision'],
      });
      expect((await readdir(integration)).sort()).toEqual([
        'artifact-worker.cjs',
        'manifest.json',
        'operator-module.cjs',
        'prepared-definition.json',
      ]);
      await expect(packageBackendIntegration(source, 'relative', command)).rejects.toThrow(
        'Absolute'
      );
      await expect(
        packageBackendIntegration(source, join(directory, 'dirty'), async () => ' M changed')
      ).rejects.toThrow('clean');
      definition.definition.capabilities.files[0] = {
        path: '/workspace/headstart-workflow/../escape',
        data: '',
      };
      await writeFile(join(workflow, 'preparation-definition.json'), JSON.stringify(definition));
      // An existing destination cannot be overwritten, even by a later packaging invocation.
      await expect(packageCredentialingRuntime(source, target, command)).rejects.toThrow(
        'already exists'
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('checks the installed smoke harness success, corrupted receipts and missing Office output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'credentialing-smoke-harness-'));
    try {
      // A fixture process tests the harness itself. CI separately exercises real deployed parsers.
      const cli = join(root, 'node_modules/@headstart-health/document-reading/dist/cli.js');
      await mkdir(join(root, 'node_modules/@headstart-health/document-reading/dist'), {
        recursive: true,
      });
      const program = `const fs = require('node:fs'); const path = require('node:path'); const a = process.argv; const output = a[a.indexOf('--output')+1]; fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ content: 'Invented complete work history', mimeType: 'image/png' }));`;
      await writeFile(cli, program);
      for (const name of ['google-drive-data', 'headstart-mcp-data']) {
        const path = join(root, `node_modules/@headstart-health/${name}/dist`);
        await mkdir(path, { recursive: true });
        await writeFile(join(path, 'cli.js'), '// inert import');
      }
      const receiptPath = join(root, 'runtime-receipt.json');
      const pin = async (): Promise<void> =>
        writeFile(receiptPath, JSON.stringify({ artifactSha256: await runtimeFingerprint(root) }));
      await pin();
      await verifyCredentialingRuntime(root);
      await expect(verifyCredentialingRuntime('relative')).rejects.toThrow('Absolute');
      for (const receipt of [null, 'invalid', {}, { artifactSha256: 'wrong' }]) {
        await writeFile(receiptPath, JSON.stringify(receipt));
        await expect(verifyCredentialingRuntime(root)).rejects.toThrow('Runtime bytes changed');
      }
      await writeFile(cli, program.replace('Invented complete work history', 'incomplete'));
      await pin();
      await expect(verifyCredentialingRuntime(root)).rejects.toThrow(
        'Office worker output missing'
      );
      await writeFile(cli, program.replace('image/png', 'application/pdf'));
      await pin();
      await expect(verifyCredentialingRuntime(root)).rejects.toThrow('Native PDF output missing');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
