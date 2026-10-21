import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { artifactByteLimit } from './artifact-validation.js';
import { runPreparationPreflight } from './preparation-preflight.js';

describe('installed semantic preflight', () => {
  it('validates complete files without queueing and rejects unreadable, oversized or malformed input', () => {
    const directory = mkdtempSync(join(tmpdir(), 'preparation-preflight-'));
    try {
      const input = join(directory, 'input.json');
      const proposal = join(directory, 'proposal.json');
      for (const [target, suffix] of [
        [input, 'input'],
        [proposal, 'output'],
      ] as const) {
        writeFileSync(
          target,
          readFileSync(
            new URL(
              `../fixtures/preparation/historical-preparation.${suffix}.json`,
              import.meta.url
            )
          )
        );
      }
      const args = ['--input', input, '--proposal', proposal];
      expect(runPreparationPreflight(args)).toMatchObject({
        ok: true,
        value: { readiness: 'needs-information' },
      });
      for (const invalid of [
        [],
        [...args, '--extra'],
        ['--input', directory, '--proposal', proposal],
        ['--input', '/missing/private-source-path', '--proposal', proposal],
      ]) {
        const reply = runPreparationPreflight(invalid);
        expect(reply.ok).toBe(false);
        expect(JSON.stringify(reply)).not.toContain('private-source-path');
      }
      for (const bytes of [
        Buffer.alloc(artifactByteLimit + 1),
        Buffer.from([0xff]),
        Buffer.from('not-json'),
      ]) {
        writeFileSync(input, bytes);
        expect(runPreparationPreflight(args)).toMatchObject({ ok: false });
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each([true, false])('returns exit status and bounded output for ok=%s', async (ok) => {
    vi.resetModules();
    vi.doMock('./preparation-preflight.js', () => ({
      runPreparationPreflight: (): unknown =>
        ok
          ? { ok: true, value: { readiness: 'needs-information', input: 'private-evidence' } }
          : { ok: false, code: 'invalid-artifacts', issues: ['Invalid scope'] },
    }));
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const previous = process.exitCode;
    try {
      await import('./preparation-preflight-cli.js');
      expect(process.exitCode).toBe(ok ? 0 : 1);
      expect(stdout).toHaveBeenCalledOnce();
      expect(stdout.mock.calls[0]?.[0]).not.toContain('private-evidence');
    } finally {
      process.exitCode = previous;
      stdout.mockRestore();
      vi.doUnmock('./preparation-preflight.js');
    }
  });
});
