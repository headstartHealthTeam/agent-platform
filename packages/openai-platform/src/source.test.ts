import path from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { bundleSkills, gitReader, inspectWorkflow, type GitRead } from './source.js';

const revision = 'a'.repeat(40);
function reader(files: Record<string, string>, mode = '100644'): GitRead {
  return (args) => {
    if (args[0] === 'rev-parse') {
      return revision;
    }
    if (args[0] === 'ls-tree') {
      return Object.keys(files)
        .filter((file) => file.startsWith(args.at(-1) ?? ''))
        .map((file) => `${mode} blob ${revision}\t${file}\0`)
        .join('');
    }
    const file = args[1]?.slice(revision.length + 1);
    const value = Object.entries(files).find(([key]) => key === file)?.[1];
    if (value === undefined) {
      throw new Error('missing synthetic fixture');
    }
    return value;
  };
}
const simple = '---\nname: synthetic\ndescription: Synthetic only\n---\nUse synthetic inputs.';
describe('immutable canonical skill source', () => {
  it('bundles dependency closure and exact file contents with stable bytes', () => {
    const files = {
      'skills/synthetic/SKILL.md': simple.replace(
        '---\nUse',
        'metadata:\n  headstart-requires: dependency\n---\nUse'
      ),
      'skills/synthetic/references/note.md': 'synthetic reference',
      'skills/dependency/SKILL.md': simple.replace('name: synthetic', 'name: dependency'),
      'ignored/private.txt': 'must not enter archive',
    };
    const git = reader(files);
    const bundle = bundleSkills(git, revision, ['synthetic', 'synthetic']);
    expect(bundle.skills.map((skill) => skill.name)).toEqual(['synthetic', 'dependency']);
    expect(bundle).toEqual(bundleSkills(git, revision, ['synthetic', 'synthetic']));
    const archive = unzipSync(Buffer.from(bundle.skills[0]?.source.data ?? '', 'base64'));
    expect(Object.keys(archive)).toEqual(['synthetic/SKILL.md', 'synthetic/references/note.md']);
    const note = Object.entries(archive).find(([name]) => name.endsWith('note.md'))?.[1];
    expect(note === undefined ? '' : strFromU8(note)).toBe('synthetic reference');
    expect(bundle.files).not.toContain('ignored/private.txt');
  });
  it.each([
    'skills/synthetic/.env.txt',
    'skills/synthetic/node_modules/a.js',
    'skills/synthetic/asset.png',
    'skills/synthetic/bad\\file.md',
  ])('rejects unsupported source %s', (file) => {
    expect(() =>
      bundleSkills(reader({ 'skills/synthetic/SKILL.md': simple, [file]: 'no' }), revision, [
        'synthetic',
      ])
    ).toThrow();
  });
  it('rejects symlinks, bad identity, missing source, moving refs, empty selection, malformed UTF-8 and oversize', () => {
    expect(() =>
      bundleSkills(reader({ 'skills/synthetic/SKILL.md': simple }, '120000'), revision, [
        'synthetic',
      ])
    ).toThrow('regular');
    expect(() =>
      bundleSkills(
        reader({ 'skills/synthetic/SKILL.md': simple.replace('name: synthetic', 'name: wrong') }),
        revision,
        ['synthetic']
      )
    ).toThrow('identity');
    expect(() => bundleSkills(reader({}), revision, ['synthetic'])).toThrow('Missing');
    expect(() => bundleSkills(reader({}), 'main', ['synthetic'])).toThrow();
    expect(() => bundleSkills(() => 'b'.repeat(40), revision, ['synthetic'])).toThrow('mismatch');
    expect(() => bundleSkills(reader({}), revision, [])).toThrow('At least');
    expect(() =>
      bundleSkills(reader({ 'skills/synthetic/SKILL.md': '\uFFFD' }), revision, ['synthetic'])
    ).toThrow('UTF-8');
    expect(() =>
      bundleSkills(reader({ 'skills/synthetic/SKILL.md': 'x'.repeat(5_000_001) }), revision, [
        'synthetic',
      ])
    ).toThrow('byte bound');
  });
  it('inspects the real synthetic workflow without claiming it is deployed', () => {
    const result = inspectWorkflow(
      path.resolve(import.meta.dirname, '../../../workflows/synthetic-read-only-reference')
    );
    expect(result).toMatchObject({
      deploymentReady: false,
      workflow: { id: 'synthetic-read-only-reference', lifecycle: 'draft' },
    });
  });
  it('bounds Git command failure without leaking subprocess output', () => {
    expect(() =>
      gitReader(path.resolve(import.meta.dirname, 'nonexistent'))(['rev-parse', 'HEAD'])
    ).toThrow('Unable to read pinned');
  });
});
