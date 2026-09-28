import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectSkillFiles } from './skill-files.js';

let root: string;
async function file(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
function skill(name: string, required = ''): string {
  return `---\nname: ${name}\ndescription: Synthetic test skill\nmetadata:\n  headstart-requires: '${required}'\n---\nUse the complete reference.`;
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'headstart-skill-files-'));
  await file('skills/example/SKILL.md', skill('example'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('canonical skill runtime files', () => {
  it('retains complete references, helpers and binary assets, but excludes eval or host scaffolding', async () => {
    await file('skills/example/references/full.md', 'Complete evidence instructions');
    await file('skills/example/scripts/helper.py', 'print("synthetic")');
    await file('skills/example/assets/original.bin', Uint8Array.from([0, 255, 12]));
    for (const path of [
      'evals/evals.json',
      'agents/openai.yaml',
      '.private',
      'node_modules/a.js',
      'scripts/helper.test.ts',
    ])
      await file(`skills/example/${path}`, 'Do not expose a grading oracle');
    const result = await collectSkillFiles(root, ['example']);
    expect(result.map((item) => item.path)).toEqual(
      [
        'skills/example/assets/original.bin',
        'skills/example/references/full.md',
        'skills/example/scripts/helper.py',
        'skills/example/SKILL.md',
      ].sort((a, b) => a.localeCompare(b, 'en'))
    );
    expect(result.find((item) => item.path.endsWith('original.bin'))?.data).toBe('AP8M');
  });
  it('includes declared dependency closure once, with stable output and no local/hosted fork', async () => {
    await file('skills/example/SKILL.md', skill('example', 'second, second'));
    await file('skills/second/SKILL.md', skill('second', 'example'));
    expect(await collectSkillFiles(root, ['example', 'second'])).toEqual(
      await collectSkillFiles(root, ['second', 'example'])
    );
    expect(await collectSkillFiles(root, ['example'])).toHaveLength(2);
  });
  it.each(['../outside', 'UPPER', ''])(
    'rejects invalid requested/dependency identity %s',
    async (name) => {
      await expect(collectSkillFiles(root, [name])).rejects.toThrow(
        'Invalid skill dependency name'
      );
    }
  );
  it('rejects absent entries, invalid metadata and an empty requested set', async () => {
    await expect(collectSkillFiles(root, [])).rejects.toThrow('At least one skill');
    await mkdir(join(root, 'skills/missing'));
    await expect(collectSkillFiles(root, ['missing'])).rejects.toThrow('entry file');
    for (const content of ['{}', skill('other'), skill('example').replace("''", '12')]) {
      await file('skills/example/SKILL.md', content);
      await expect(collectSkillFiles(root, ['example'])).rejects.toThrow(/Invalid skill/);
    }
  });
  it('rejects symlinked runtime directories without following them', async () => {
    await mkdir(join(root, 'outside'));
    await symlink(join(root, 'outside'), join(root, 'skills/example/references'), 'junction');
    await expect(collectSkillFiles(root, ['example'])).rejects.toThrow('regular file');
  });
  it('reports a real capacity failure instead of silently truncating source', async () => {
    await file('skills/example/large.txt', 'x'.repeat(5_000_001));
    await expect(collectSkillFiles(root, ['example'])).rejects.toThrow('bounded regular file');
  });
});
