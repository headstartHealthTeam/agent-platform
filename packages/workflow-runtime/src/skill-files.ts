import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

export interface SkillSourceFile {
  path: string;
  data: string;
}

const namePattern = /^[a-z][a-z0-9-]{1,63}$/;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function runtimeFileName(name: string): boolean {
  if (/[\\\p{Cc}]/u.test(name)) throw new Error('Unsafe skill source path');
  return (
    !name.startsWith('.') &&
    !['evals', 'agents', 'node_modules'].includes(name) &&
    !/\.(test|spec)\.[cm]?[jt]s$/.test(name)
  );
}

function dependencies(source: string, name: string): string[] {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  const metadata: unknown = parseYaml(header?.[1] ?? '');
  if (
    !object(metadata) ||
    metadata['name'] !== name ||
    typeof metadata['description'] !== 'string' ||
    !metadata['description'].trim()
  )
    throw new Error('Invalid skill identity or description');
  const details = metadata['metadata'];
  const required = object(details) ? details['headstart-requires'] : undefined;
  if (required === undefined) return [];
  if (typeof required !== 'string') throw new Error('Invalid skill dependencies');
  return required
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Build from canonical checkout files; distribution pins the resulting content and source revision.
 * Preserve references, scripts and binary assets. Evaluation answers and host adapter metadata are
 * not runtime instructions. No installed workstation skills, symlinks or hidden files are read.
 */
export async function collectSkillFiles(
  repository: string,
  requested: readonly string[]
): Promise<SkillSourceFile[]> {
  const pending = [...requested];
  const visited = new Set<string>();
  const files: SkillSourceFile[] = [];
  if (!(await lstat(resolve(repository, 'skills'))).isDirectory())
    throw new Error('Skills root must be a regular directory');
  let bytes = 0;
  async function visit(path: string): Promise<void> {
    const absolute = resolve(repository, path);
    const stat = await lstat(absolute);
    if (stat.isDirectory()) {
      for (const name of (await readdir(absolute)).filter(runtimeFileName).sort()) {
        await visit(`${path}/${name}`);
      }
    } else {
      if (!stat.isFile() || stat.size > 5_000_000)
        throw new Error('Skill source must be a bounded regular file');
      const content = await readFile(absolute);
      bytes += content.length;
      if (bytes > 5_000_000 || files.length >= 500)
        throw new Error('Skill source bundle exceeds supported capacity');
      files.push({ path, data: content.toString('base64') });
    }
  }
  for (let name = pending.shift(); name !== undefined; name = pending.shift()) {
    if (!namePattern.test(name)) throw new Error('Invalid skill dependency name');
    if (visited.has(name)) continue;
    if (visited.size >= 50) throw new Error('Skill dependency closure exceeds supported capacity');
    visited.add(name);
    await visit(`skills/${name}`);
    const entry = files.find((file) => file.path === `skills/${name}/SKILL.md`);
    if (!entry) throw new Error('Skill entry file is missing');
    pending.push(...dependencies(Buffer.from(entry.data, 'base64').toString('utf8'), name));
  }
  if (!files.length) throw new Error('At least one skill is required');
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
