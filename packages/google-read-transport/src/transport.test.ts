import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GcloudReadTokenProvider, GoogleReadError, GoogleReadTransport } from './transport.js';

const directories: string[] = [];
// Windows process startup under matrix coverage exceeded 5s for the former six-launch test.
// Keep each scenario independent and bounded without changing the strict unit-test default.
const launcherTestTimeout = 20_000;

async function fixture(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'google token space & fixture-'));
  directories.push(directory);
  const script = join(directory, 'gcloud-fixture.cjs');
  await writeFile(
    script,
    `#!/usr/bin/env node
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['auth', 'application-default', 'print-access-token'])) process.exit(3);
const mode = process.env.HEADSTART_GCLOUD_TEST_MODE;
if (mode === 'fail') {
  process.stderr.write('private-provider-credential');
  process.exitCode = 1;
} else if (mode === 'large') process.stdout.write('x'.repeat(65_000));
else process.stdout.write('synthetic-subprocess-token\\n');
`
  );
  if (process.platform === 'win32') {
    await writeFile(
      join(directory, 'gcloud.cmd'),
      `@"${process.execPath}" "%~dp0gcloud-fixture.cjs" %*\r\n`
    );
  } else {
    await symlink(process.execPath, join(directory, 'node'));
    await symlink(script, join(directory, 'gcloud'));
    await chmod(script, 0o755);
  }
  // Resolve only synthetic commands, never a workstation's installed gcloud or credentials.
  vi.stubEnv('PATH', directory);
}

describe('Google read transport', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    for (const directory of directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  });
  it(
    'uses the real gcloud launcher, including .cmd on Windows, without live credentials',
    async () => {
      await fixture();
      expect(await new GcloudReadTokenProvider().getAccessToken()).toBe(
        'synthetic-subprocess-token'
      );
    },
    launcherTestTimeout
  );
  it.each(['fail', 'large'])(
    'sanitizes real launcher %s failures without exposing child output',
    async (mode) => {
      await fixture();
      vi.stubEnv('HEADSTART_GCLOUD_TEST_MODE', mode);
      const result = new GcloudReadTokenProvider().getAccessToken();
      await expect(result).rejects.toThrow(/Google ADC/);
      await expect(result).rejects.not.toThrow(/private-provider/);
    },
    launcherTestTimeout
  );
  it(
    'reports missing gcloud without probing live credentials or sending Google requests',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'missing-google-launcher-'));
      directories.push(directory);
      vi.stubEnv('PATH', directory);
      await expect(new GcloudReadTokenProvider().getAccessToken()).rejects.toThrow(
        /verify gcloud installation and PATH/
      );
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      await expect(
        new GoogleReadTransport(new GcloudReadTokenProvider()).request(
          'https://sheets.googleapis.com/v4/spreadsheets/test'
        )
      ).rejects.toThrow(/verify gcloud installation and PATH/);
      expect(fetcher).not.toHaveBeenCalled();
    },
    launcherTestTimeout
  );
  it('preserves fixed ADC guidance through the transport but sanitizes arbitrary token-provider errors', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/test';
    await expect(
      new GoogleReadTransport(
        new GcloudReadTokenProvider(async () => {
          throw new Error('private ADC contents');
        })
      ).request(url)
    ).rejects.toThrow(
      'Google ADC is unavailable; follow the configured organization OAuth recovery procedure'
    );
    for (const error of [
      new Error('private provider contents'),
      new GoogleReadError('private provider contents'),
    ]) {
      const transport = new GoogleReadTransport({
        getAccessToken: async (): Promise<string> => {
          throw error;
        },
      });
      await expect(transport.request(url)).rejects.toThrow(
        'Google token provider failed; verify the configured provider and recovery procedure'
      );
      await expect(transport.request(url)).rejects.not.toThrow(/private provider contents/);
    }
    const contaminated = Object.assign(
      new GoogleReadError(
        'Google ADC is unavailable; follow the configured organization OAuth recovery procedure'
      ),
      { providerResponse: 'private provider contents' }
    );
    const transport = new GoogleReadTransport({
      getAccessToken: async (): Promise<string> => {
        throw contaminated;
      },
    });
    await expect(transport.request(url)).rejects.not.toHaveProperty('providerResponse');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('caches successful ADC resolution and sanitizes failures', async () => {
    const run = vi.fn(async () => ' synthetic-token ');
    const provider = new GcloudReadTokenProvider(run);
    expect(await provider.getAccessToken()).toBe('synthetic-token');
    expect(await provider.getAccessToken()).toBe('synthetic-token');
    expect(run).toHaveBeenCalledTimes(1);
    await expect(new GcloudReadTokenProvider(async () => '').getAccessToken()).rejects.toThrow(
      /ADC/
    );
    await expect(
      new GcloudReadTokenProvider(async () => {
        throw new Error('secret contents');
      }).getAccessToken()
    ).rejects.not.toThrow(/secret contents/);
  });
  it('uses credentials only on allowed origins and rejects redirects', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const transport = new GoogleReadTransport({
      getAccessToken: async (): Promise<string> => 'synthetic-token',
    });
    await expect(
      transport.request('https://sheets.googleapis.com/v4/spreadsheets/test')
    ).resolves.toEqual({
      ok: true,
    });
    await transport.request('https://analyticsdata.googleapis.com/v1beta/properties/1:runReport', {
      metrics: [],
    });
    expect(fetcher.mock.calls).toHaveLength(2);
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', redirect: 'error', body: '{"metrics":[]}' })
    );
    await expect(transport.request('https://attacker.test/')).rejects.toThrow(/origin/);
    await expect(transport.request('http://sheets.googleapis.com/')).rejects.toThrow(/origin/);
    await expect(transport.request('https://user@sheets.googleapis.com/')).rejects.toThrow(
      /origin/
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(
      transport.request('https://sheets.googleapis.com/v4/spreadsheets/test:batchUpdate', {})
    ).rejects.toThrow(/allowlist/);
    await expect(
      transport.request('https://sheets.googleapis.com/v4/spreadsheets/test', {})
    ).rejects.toThrow(/allowlist/);
    await expect(
      transport.request('https://analyticsdata.googleapis.com/v1beta/properties/1:runReport')
    ).rejects.toThrow(/allowlist/);
    await transport.request('https://analyticsadmin.googleapis.com/v1beta/properties/1');
    await transport.request('https://sheets.googleapis.com/v4/spreadsheets/test/values/range');
    await transport.request('https://www.googleapis.com/webmasters/v3/sites');
    await transport.request('https://www.googleapis.com/webmasters/v3/sites/example/sitemaps');
    await transport.request(
      'https://www.googleapis.com/webmasters/v3/sites/example/searchAnalytics/query',
      {}
    );
    await expect(
      transport.request('https://www.googleapis.com/webmasters/v3/sites/example/sitemaps', {})
    ).rejects.toThrow(/allowlist/);
  });
  it('reports structured permission reasons without provider messages', async () => {
    const transport = new GoogleReadTransport({
      getAccessToken: async (): Promise<string> => 'synthetic-token',
    });
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            error: {
              status: 'PERMISSION_DENIED',
              message: 'secret contents',
              details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
            },
          }),
          { status: 403 }
        )
    );
    await expect(
      transport.request('https://sheets.googleapis.com/v4/spreadsheets/test')
    ).rejects.toThrow(/ACCESS_TOKEN_SCOPE_INSUFFICIENT/);
    vi.stubGlobal('fetch', async () => new Response('invalid', { status: 500 }));
    await expect(
      transport.request('https://sheets.googleapis.com/v4/spreadsheets/test')
    ).rejects.toThrow(/HTTP 500/);
    vi.stubGlobal('fetch', async () => new Response('invalid', { status: 200 }));
    await expect(
      transport.request('https://sheets.googleapis.com/v4/spreadsheets/test')
    ).rejects.toThrow(/invalid JSON/);
    vi.stubGlobal('fetch', async () => {
      throw new Error('secret contents');
    });
    await expect(
      transport.request('https://sheets.googleapis.com/v4/spreadsheets/test')
    ).rejects.toThrow(/before a response/);
  });
});
