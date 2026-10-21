import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkIntakeDistribution } from './distribution-safety.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'intake-distribution-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true });
});
async function write(name: string, value = '{}'): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await fs.writeFile(path.join(root, name), value);
}
describe('Intake distribution safety', () => {
  it('rejects the original private artifact families and large unrecognized files', async () => {
    const names = [
      'config/production-fingerprint.json',
      'runs/data.txt',
      'data.xlsx',
      'a-checkpoints/x.json',
      'google_state_capture.json',
      'fireflies_discovery_raw.json',
      'fireflies_body_raw_1.json',
      'nested/fireflies-cache/item.json',
    ];
    for (const name of names) await write(name);
    await write('large.txt', 'x'.repeat(2_000_001));
    const result = await checkIntakeDistribution(root);
    expect(result.passed).toBe(false);
    expect(result.filesChecked).toBe(names.length + 1);
    expect(result.findings).toHaveLength(names.length + 1);
  });
  it('retains identifier, personal email/path and retired-model checks without printing the contents', async () => {
    const id = ['006', '000000000001AAA'].join('');
    await write(
      'sensitive.txt',
      [
        `lightning/r/Opportunity/${id}/view`,
        ['synthetic', '@', 'gmail.com'].join(''),
        ['gpt', '5', 'mini'].join('-'),
        ['/Users', 'jimmyjameson', 'Documents', 'SLA Summary'].join('/'),
      ].join('\n')
    );
    const result = await checkIntakeDistribution(root);
    expect(result.findings).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain(id);
  });
  it('accepts synthetic source and skips dependency/tool caches rather than scanning other workflows', async () => {
    await write('src/example.ts', 'const example = "synthetic@example.test";');
    await write('node_modules/third-party/large.txt', 'x'.repeat(2_000_001));
    await write('coverage/data.json', '{}');
    expect(await checkIntakeDistribution(root)).toEqual({
      passed: true,
      filesChecked: 1,
      findings: [],
    });
  });
});
