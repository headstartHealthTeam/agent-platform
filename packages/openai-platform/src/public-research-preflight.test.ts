import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parsePublicResearchManifest } from '@headstart-health/workflow-contracts';
import { describe, expect, it } from 'vitest';

import { publicResearchPreflightScript } from './public-research-preflight.js';

describe('public research producer preflight', () => {
  // Three separately bounded 10-second Python invocations plus large-file I/O on Windows CI.
  it('catches the observed metadata defect before completion and verifies original bytes after repair', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'research-preflight-'));
    try {
      // Same size class as the complete handbook excluded by the former 10 MiB limit.
      const original = Buffer.alloc(26_760_658, 42);
      await writeFile(join(directory, 'manual.txt'), original);
      const manifest = {
        summary: 'Synthetic',
        limitations: [],
        files: [
          {
            path: '/workspace/outputs/public-research/manual.txt',
            title: 'Synthetic',
            url: 'https://example.org/manual',
            retrievedAt: '2026-10-13T19:06:38.781123+00:00',
            statedDate: 'x'.repeat(265),
            mediaType: 'text/plain',
            digest: `sha256:${createHash('sha256').update(original).digest('hex')}`,
          },
        ],
      };
      const path = join(directory, 'manifest.json');
      const run = (): SpawnSyncReturns<string> =>
        spawnSync('python3', ['-', path], {
          input: publicResearchPreflightScript(),
          encoding: 'utf8',
          timeout: 10000,
        });
      await writeFile(path, JSON.stringify(manifest));
      const invalid = run();
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain('statedDate at file entry 1');
      expect(() => parsePublicResearchManifest(Buffer.from(JSON.stringify(manifest)))).toThrow();
      const first = manifest.files[0];
      if (!first) throw new Error('Missing synthetic file');
      first.statedDate = 'October 2026';
      await writeFile(path, JSON.stringify(manifest));
      const valid = run();
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain('1 complete originals checked');
      expect(parsePublicResearchManifest(await readFile(path)).files).toHaveLength(1);
      expect((await readFile(join(directory, 'manual.txt'))).equals(original)).toBe(true);
      await writeFile(join(directory, 'manual.txt'), 'Changed synthetic original');
      const changed = run();
      expect(changed.status).toBe(1);
      expect(changed.stderr).toContain('digest-mismatch');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 35_000);
});
