import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveSemrushCredential, semrushCredentialSchema } from './semrush-credential.js';

const directories: string[] = [];
const codexBinding = { type: 'codex-mcp', server: 'semrush-mcp' } as const;

async function fixture(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'reporting codex space & fixture-'));
  directories.push(directory);
  const script = join(directory, 'codex-fixture.cjs');
  await writeFile(
    script,
    `#!/usr/bin/env node
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['mcp', 'get', 'semrush-mcp', '--json'])) process.exit(3);
const mode = process.env.HEADSTART_CODEX_CREDENTIAL_TEST_MODE;
if (mode === 'fail') {
  process.stdout.write('private-synthetic-stdout');
  process.stderr.write('private-synthetic-stderr');
  process.exitCode = 1;
} else if (mode === 'large-stdout') process.stdout.write('x'.repeat(1_000_001));
else if (mode === 'large-stderr') process.stderr.write('x'.repeat(1_000_001));
else if (mode === 'invalid') process.stdout.write('private-invalid-json');
else process.stdout.write(JSON.stringify({ enabled: mode !== 'disabled', transport: { env: { SEMRUSH_API_KEY: mode === 'empty' ? '' : 'synthetic-subprocess-key' } } }));
`
  );
  if (process.platform === 'win32') {
    await writeFile(
      join(directory, 'codex.cmd'),
      `@"${process.execPath}" "%~dp0codex-fixture.cjs" %*\r\n`
    );
  } else {
    await symlink(process.execPath, join(directory, 'node'));
    await symlink(script, join(directory, 'codex'));
    await chmod(script, 0o755);
  }
  // No fallback to an installed Codex or real credentials is possible in these subprocess tests.
  vi.stubEnv('PATH', directory);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe('optional Semrush credential bindings', () => {
  it('reads an environment binding without launching Codex', async () => {
    vi.stubEnv('PATH', '');
    vi.stubEnv('HEADSTART_SYNTHETIC_SEMRUSH_KEY', 'synthetic-environment-key');
    const binding = { type: 'environment', variable: 'HEADSTART_SYNTHETIC_SEMRUSH_KEY' } as const;
    expect(await resolveSemrushCredential(binding)).toBe('synthetic-environment-key');
    vi.stubEnv('HEADSTART_SYNTHETIC_SEMRUSH_KEY', '');
    await expect(resolveSemrushCredential(binding)).rejects.toThrow(
      /environment variable is absent/
    );
  });

  it('uses the real fixed-argument launcher, including codex.cmd on Windows', async () => {
    await fixture();
    expect(await resolveSemrushCredential(codexBinding)).toBe('synthetic-subprocess-key');
  });

  it.each(['fail', 'invalid', 'disabled', 'empty', 'large-stdout', 'large-stderr'])(
    'sanitizes %s failures without exposing child output',
    async (mode) => {
      await fixture();
      vi.stubEnv('HEADSTART_CODEX_CREDENTIAL_TEST_MODE', mode);
      await expect(resolveSemrushCredential(codexBinding)).rejects.toThrow(
        /^The configured Semrush MCP credential could not be resolved$/
      );
    }
  );

  it('reports a missing launcher without probing an installed Codex', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'missing-reporting-codex-'));
    directories.push(directory);
    vi.stubEnv('PATH', directory);
    await expect(resolveSemrushCredential(codexBinding)).rejects.toThrow(
      /^The configured Semrush MCP credential could not be resolved$/
    );
  });

  it('restricts the host lookup to the configured Semrush server', () => {
    expect(semrushCredentialSchema.safeParse(codexBinding).success).toBe(true);
    expect(
      semrushCredentialSchema.safeParse({ ...codexBinding, server: 'other; command' }).success
    ).toBe(false);
    expect(
      semrushCredentialSchema.safeParse({ type: 'environment', variable: 'INVALID;VAR' }).success
    ).toBe(false);
  });
});
