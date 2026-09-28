import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GcloudReadTokenProvider,
  GoogleFileTokenProvider,
} from '@headstart-health/google-read-transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { main } from './cli.js';
import {
  createDriveRuntime,
  driveRuntimeProfileSchema,
  driveRuntimeRequestSchema,
  executeDriveRequest,
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
  const fileTokens = vi.fn<() => Promise<string>>();
  beforeEach(() => {
    fileTokens.mockReset().mockResolvedValue('synthetic-token');
    vi.spyOn(GoogleFileTokenProvider.prototype, 'getAccessToken').mockImplementation(fileTokens);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
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
      expect((await readdir(input.output)).sort()).toEqual(['evidence-0.json', 'result.json']);
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

  it('renews the token in the same standalone reader without routing documents through the issuer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.stubEnv('SYNTHETIC_DRIVE_AUTH', 'synthetic-full-authorization-placeholder');
    const profile = driveRuntimeProfileSchema.parse({
      expectedIdentity: 'agent@example.com',
      authentication: {
        kind: 'token-endpoint',
        endpoint: 'https://identity.example.com/google/token',
        authorizationEnvironmentVariable: 'SYNTHETIC_DRIVE_AUTH',
      },
    });
    let issued = 0;
    const googleHeaders: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const authorization = new Headers(init?.headers).get('authorization') ?? '';
      if (url.hostname === 'identity.example.com') {
        expect(url.href).toBe('https://identity.example.com/google/token');
        expect(authorization).toBe('synthetic-full-authorization-placeholder');
        expect(init?.method).toBe('GET');
        expect(init?.body).toBeUndefined();
        issued += 1;
        return json({
          access_token: `synthetic-google-token-${String(issued)}`,
          token_type: 'Bearer',
          expires_in: 300,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        });
      }
      googleHeaders.push(authorization);
      expect(url.hostname).toBe('www.googleapis.com');
      if (url.pathname.endsWith('/about'))
        return json({ user: { emailAddress: 'agent@example.com' } });
      if (url.searchParams.get('alt') === 'media')
        return new Response('Complete original evidence');
      return json(metadata);
    });
    vi.stubGlobal('fetch', fetcher);
    const reader = createDriveRuntime(profile);
    const request = driveRuntimeRequestSchema.parse({
      action: 'read',
      input: { fileId: metadata.id, version: metadata.version, mode: 'original' },
    });
    const first = await executeDriveRequest(reader, profile, request);
    expect(first.kind).toBe('read');
    expect(JSON.stringify(first)).toContain(
      Buffer.from('Complete original evidence').toString('base64')
    );
    expect(issued).toBe(1);
    expect(new Set(googleHeaders)).toEqual(new Set(['Bearer synthetic-google-token-1']));
    googleHeaders.length = 0;
    vi.setSystemTime(Date.now() + 300_000);
    expect(await executeDriveRequest(reader, profile, request)).toEqual(first);
    expect(issued).toBe(2);
    expect(new Set(googleHeaders)).toEqual(new Set(['Bearer synthetic-google-token-2']));
    expect(fileTokens).not.toHaveBeenCalled();
  });

  it('keeps supervised ADC fully standalone with no token issuer', async () => {
    const adc = vi
      .spyOn(GcloudReadTokenProvider.prototype, 'getAccessToken')
      .mockResolvedValue('synthetic-adc-token');
    stubReads();
    const profile = driveRuntimeProfileSchema.parse({
      expectedIdentity: 'agent@example.com',
      authentication: { kind: 'operator-adc' },
    });
    await expect(
      executeDriveRequest(createDriveRuntime(profile), profile, {
        action: 'metadata',
        fileId: metadata.id,
      })
    ).resolves.toMatchObject({ kind: 'metadata', data: metadata });
    expect(adc).toHaveBeenCalled();
    expect(fileTokens).not.toHaveBeenCalled();
  });

  it('does not fall back to local credentials when the selected token endpoint fails', async () => {
    vi.stubEnv('SYNTHETIC_DRIVE_AUTH', 'synthetic-placeholder');
    const adc = vi.spyOn(GcloudReadTokenProvider.prototype, 'getAccessToken');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('issuer unavailable'));
    vi.stubGlobal('fetch', fetcher);
    const profile = driveRuntimeProfileSchema.parse({
      expectedIdentity: 'agent@example.com',
      authentication: {
        kind: 'token-endpoint',
        endpoint: 'https://identity.example.com/google/token',
        authorizationEnvironmentVariable: 'SYNTHETIC_DRIVE_AUTH',
      },
    });
    await expect(
      executeDriveRequest(createDriveRuntime(profile), profile, {
        action: 'metadata',
        fileId: metadata.id,
      })
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(adc).not.toHaveBeenCalled();
    expect(fileTokens).not.toHaveBeenCalled();
  });
});
