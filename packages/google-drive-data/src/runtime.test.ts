import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GoogleFileTokenProvider } from '@headstart-health/google-read-transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from './cli.js';
import {
  createDriveRuntime,
  driveRuntimeProfileSchema,
  driveRuntimeRequestSchema,
  runDriveCli,
} from './runtime.js';

const metadata = {
  id: 'fixture',
  name: 'Synthetic full evidence',
  version: '5',
  mimeType: 'text/plain',
  capabilities: { canDownload: true },
};
const json = (value: unknown): Response => new Response(JSON.stringify(value));
describe('deployable Drive runtime CLI', () => {
  beforeEach(() => {
    vi.spyOn(GoogleFileTokenProvider.prototype, 'getAccessToken').mockResolvedValue(
      'synthetic-token'
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  async function setup(
    request: unknown
  ): Promise<{ profile: string; request: string; output: string }> {
    const root = await mkdtemp(join(tmpdir(), 'drive-runtime-'));
    const profile = join(root, 'profile.json');
    const path = join(root, 'request.json');
    await writeFile(
      profile,
      JSON.stringify({
        expectedIdentity: 'agent@example.com',
        authentication: { kind: 'credential-file', path: join(root, 'synthetic-credential.json') },
      })
    );
    await writeFile(path, JSON.stringify(request));
    return { profile, request: path, output: join(root, 'output') };
  }
  function stubReads(mimeType = 'text/plain'): void {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith('/about'))
          return json({ user: { emailAddress: 'agent@example.com' } });
        if (url.searchParams.get('alt') === 'media')
          return new Response('Every byte, not a summary');
        if (url.pathname.endsWith('/files')) return json({ files: [metadata] });
        return json({ ...metadata, mimeType });
      })
    );
  }
  it.each(['list', 'metadata', 'text', 'original', 'image'])(
    'runs %s through the real reader/transport and writes inspectable evidence',
    async (action) => {
      stubReads(action === 'image' ? 'image/jpeg' : 'text/plain');
      const request =
        action === 'list'
          ? { action, input: {} }
          : action === 'metadata'
            ? { action, fileId: 'fixture' }
            : {
                action: 'read',
                input: {
                  fileId: 'fixture',
                  version: '5',
                  mode: action === 'original' ? 'original' : 'text',
                },
              };
      const input = await setup(request);
      const path = await main([
        '--profile',
        input.profile,
        '--request',
        input.request,
        '--output',
        input.output,
      ]);
      const saved = await readFile(path, 'utf8');
      if (action === 'original') {
        expect(await readFile(join(input.output, 'evidence-0.txt'), 'utf8')).toBe(
          'Every byte, not a summary'
        );
        expect(saved).not.toContain('blob');
      } else if (action === 'image') {
        expect(await readFile(join(input.output, 'evidence-0.jpg'), 'utf8')).toBe(
          'Every byte, not a summary'
        );
        expect(saved).toContain('image/jpeg');
      } else if (action === 'text') expect(saved).toContain('Every byte, not a summary');
      else expect(saved).toContain('Synthetic full evidence');
      await expect(runDriveCli(input)).rejects.toMatchObject({ code: 'EEXIST' });
    }
  );
  it('requires explicit authentication and never guesses credentials', async () => {
    expect(
      driveRuntimeProfileSchema.safeParse({ expectedIdentity: 'agent@example.com' }).success
    ).toBe(false);
    expect(
      createDriveRuntime({
        expectedIdentity: 'agent@example.com',
        authentication: { kind: 'operator-adc' },
      })
    ).toBeDefined();
    expect(
      driveRuntimeRequestSchema.safeParse({ action: 'delete', fileId: 'fixture' }).success
    ).toBe(false);
    await expect(main([])).rejects.toThrow('required');
    await expect(
      runDriveCli({ profile: 'relative', request: 'relative', output: 'relative' })
    ).rejects.toThrow('absolute');
  });
  it.each([0, 24_000])(
    'materializes the complete Docs structure independently of text offset %i',
    async (offset) => {
      const structure = {
        documentId: metadata.id,
        tabs: [
          {
            documentTab: {
              body: { content: [{ text: 'Repeated history — 中文\n'.repeat(3000) }] },
            },
            childTabs: [
              {
                documentTab: {
                  body: { content: [{ text: 'Contradiction at the end' }] },
                  footnotes: { final: { text: 'Unabridged final note' } },
                },
              },
            ],
          },
        ],
        suggestions: { final: { text: 'Keep the suggestion too' } },
      };
      const serialized = JSON.stringify(structure);
      const bytes = Buffer.from(serialized);
      const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.pathname.endsWith('/about'))
          return json({ user: { emailAddress: 'agent@example.com' } });
        if (url.pathname.endsWith(`/documents/${metadata.id}`)) {
          expect(url.searchParams.get('includeTabsContent')).toBe('true');
          expect(url.searchParams.get('suggestionsViewMode')).toBe('SUGGESTIONS_INLINE');
          return json(structure);
        }
        expect(url.pathname.endsWith(`/files/${metadata.id}`)).toBe(true);
        return json({ ...metadata, mimeType: 'application/vnd.google-apps.document' });
      });
      vi.stubGlobal('fetch', fetcher);
      const input = await setup({
        action: 'read',
        input: { fileId: metadata.id, version: metadata.version, mode: 'text', offset },
      });
      const path = await runDriveCli(input);
      const artifactPath = join(input.output, 'evidence-0.json');
      expect(await readFile(artifactPath)).toEqual(bytes);
      const saved: unknown = JSON.parse(await readFile(path, 'utf8'));
      expect(saved).toMatchObject({
        document: {
          mode: 'text',
          digest,
          mimeType: 'application/json',
          byteLength: bytes.length,
          text: serialized.slice(offset, offset + 24_000),
          totalCharacters: serialized.length,
          offset,
          nextOffset: offset + 24_000,
        },
        source: {
          id: metadata.id,
          version: metadata.version,
          mimeType: 'application/vnd.google-apps.document',
          representation: 'google-docs-structure',
        },
        artifacts: [
          { path: artifactPath, mimeType: 'application/json', digest, byteLength: bytes.length },
        ],
      });
      expect(await readdir(input.output)).toEqual(['evidence-0.json', 'result.json']);
      expect(await readFile(path, 'utf8')).not.toContain('blob');
      expect(await readFile(path, 'utf8')).not.toContain('exportMimeType');
      expect(fetcher).toHaveBeenCalledTimes(4);
    }
  );
  it.each(['version', 'permission', 'invalid-structure'])(
    'does not materialize Docs bytes after a %s failure',
    async (failure) => {
      const file = { ...metadata, mimeType: 'application/vnd.google-apps.document' };
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(json({ user: { emailAddress: 'agent@example.com' } }))
          .mockResolvedValueOnce(json(file))
          .mockResolvedValueOnce(
            json({ documentId: failure === 'invalid-structure' ? 'wrong' : metadata.id, tabs: [] })
          )
          .mockResolvedValueOnce(
            json({
              ...file,
              version: failure === 'version' ? '6' : file.version,
              capabilities: { canDownload: failure !== 'permission' },
            })
          )
      );
      const input = await setup({
        action: 'read',
        input: { fileId: metadata.id, version: metadata.version, mode: 'text' },
      });
      await expect(runDriveCli(input)).rejects.toThrow('google-drive-');
      expect(await readdir(input.output)).toEqual([]);
    }
  );
  it('does not read content under the wrong Google identity', async () => {
    const input = await setup({
      action: 'read',
      input: { fileId: 'fixture', version: '5', mode: 'text' },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ user: { emailAddress: 'other@example.com' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(runDriveCli(input)).rejects.toThrow('wrong-identity');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
