import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { workbookFixture } from './workbook-fixture.test-helper.js';

const run = promisify(execFile);
describe('workbook CLI boundary', () => {
  it('replays source evidence deterministically, exposes judgment bindings, and refuses overwrite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'organic-workbook-cli-'));
    const evidence = join(directory, 'evidence.json');
    await writeFile(evidence, JSON.stringify(await workbookFixture()));
    const args = [
      '--conditions=development',
      '--import',
      'tsx',
      fileURLToPath(new URL('./workbook-cli.ts', import.meta.url)),
      '--project-only',
      '--evidence',
      evidence,
      '--template',
      fileURLToPath(new URL('../templates/headstart-report.v1.json', import.meta.url)),
      '--sources',
      fileURLToPath(
        new URL(
          '../../../skills/organic-performance-reporting/references/headstart-sources.json',
          import.meta.url
        )
      ),
    ];
    const first = join(directory, 'first.json');
    const second = join(directory, 'second.json');
    const result = await run(process.execPath, [...args, '--output', first]);
    expect(result.stdout).toContain('agent-authored narrative is still required');
    await run(process.execPath, [...args, '--output', second]);
    const saved = await readFile(first, 'utf8');
    expect(await readFile(second, 'utf8')).toBe(saved);
    expect(saved).toContain('narrativeBindings');
    expect(saved).toContain('analysisSha256');
    await expect(run(process.execPath, [...args, '--output', first])).rejects.toThrow('EEXIST');
    await expect(
      run(process.execPath, [
        ...args,
        '--target',
        'unused',
        '--output',
        join(directory, 'bad.json'),
      ])
    ).rejects.toThrow('Projection-only mode');
  }, 15000);
});
