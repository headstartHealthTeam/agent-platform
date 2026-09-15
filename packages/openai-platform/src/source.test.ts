import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';

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
  it.each(['commit', 'blob'])(
    'ignores %s replacement objects when reading pinned source',
    (kind) => {
      const directory = mkdtempSync(path.join(tmpdir(), 'openai-git-replace-fixture-'));
      // Isolate synthetic Git state from the real repository and any enclosing Git hook.
      for (const name of Object.keys(process.env).filter((name) => name.startsWith('GIT_'))) {
        vi.stubEnv(name, undefined);
      }
      vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
      const globalConfig = path.join(directory, 'empty.gitconfig');
      vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig);
      const git = (args: string[]): string =>
        execFileSync(
          'git',
          [
            '-C',
            directory,
            '-c',
            'user.name=Synthetic Fixture',
            '-c',
            'user.email=synthetic@example.invalid',
            '-c',
            'commit.gpgsign=false',
            ...args,
          ],
          {
            encoding: 'utf8',
            timeout: 5_000,
            maxBuffer: 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
      try {
        // Git for Windows rejects Node's null-device path as a configuration file.
        writeFileSync(globalConfig, '');
        git(['init', '--template=']);
        mkdirSync(path.join(directory, 'skills/synthetic'), { recursive: true });
        const file = path.join(directory, 'skills/synthetic/SKILL.md');
        writeFileSync(file, simple);
        git(['add', 'skills/synthetic/SKILL.md']);
        git(['commit', '-m', 'Original synthetic skill']);
        const original = git(['rev-parse', 'HEAD']).trim();
        const originalObject = git([
          'rev-parse',
          kind === 'commit' ? 'HEAD' : 'HEAD:skills/synthetic/SKILL.md',
        ]).trim();
        writeFileSync(file, simple + '\nSubstituted content.');
        git(['add', 'skills/synthetic/SKILL.md']);
        git(['commit', '-m', 'Replacement synthetic skill']);
        const replacement = git([
          'rev-parse',
          kind === 'commit' ? 'HEAD' : 'HEAD:skills/synthetic/SKILL.md',
        ]).trim();
        git(['replace', originalObject, replacement]);
        expect(git(['show', `${original}:skills/synthetic/SKILL.md`])).toContain('Substituted');
        const bundle = bundleSkills(gitReader(directory), original, ['synthetic']);
        const archive = unzipSync(Buffer.from(bundle.skills[0]?.source.data ?? '', 'base64'));
        expect(strFromU8(archive['synthetic/SKILL.md'] ?? new Uint8Array())).toBe(simple);
      } finally {
        vi.unstubAllEnvs();
        rmSync(directory, { recursive: true, force: true });
      }
    },
    30_000
  );

  it('rejects oversized dependency metadata before splitting or traversing it', () => {
    const source = simple.replace(
      '---\nUse',
      `metadata:\n  headstart-requires: ${'aa,'.repeat(2000)}\n---\nUse`
    );
    expect(() =>
      bundleSkills(reader({ 'skills/synthetic/SKILL.md': source }), revision, ['synthetic'])
    ).toThrow('dependency metadata');
  });
  it('rejects excessive distinct dependencies before loading any of them', () => {
    const names = Array.from({ length: 51 }, (_, index) => `dependency-${String(index)}`);
    const source = simple.replace(
      '---\nUse',
      `metadata:\n  headstart-requires: ${names.join(',')}\n---\nUse`
    );
    expect(() =>
      bundleSkills(reader({ 'skills/synthetic/SKILL.md': source }), revision, ['synthetic'])
    ).toThrow('closure exceeds');
    expect(() => bundleSkills(reader({}), revision, names)).toThrow('closure exceeds');
  });

  it('bundles dependency closure and exact file contents with stable bytes', () => {
    const files = {
      'skills/synthetic/SKILL.md': simple.replace(
        '---\nUse',
        'metadata:\n  headstart-requires: dependency, dependency, synthetic\n---\nUse'
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
