import { execFileSync } from 'node:child_process';

import { loadWorkflowPackage } from '@headstart-health/workflow-runtime';
import { strToU8, zipSync } from 'fflate';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { fingerprint } from './platform.js';

export type GitRead = (args: readonly string[]) => string;
export function gitReader(repository: string): GitRead {
  return (args) => {
    try {
      return execFileSync('git', ['--no-replace-objects', '-C', repository, ...args], {
        encoding: 'utf8',
        timeout: 20_000,
        maxBuffer: 12 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      throw new Error('Unable to read pinned skill source from Git.');
    }
  };
}

const skillName = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/);
const revisionSchema = z.string().regex(/^[a-f0-9]{40}$/);
const MAX_SKILLS = 50;
const MAX_DEPENDENCY_METADATA_BYTES = 4096;
const frontmatter = z.object({
  name: skillName,
  description: z.string().min(1),
  metadata: z.object({ 'headstart-requires': z.string().optional() }).optional(),
});
export interface BundledSkill {
  type: 'inline';
  name: string;
  description: string;
  source: { type: 'base64'; media_type: 'application/zip'; data: string };
}
export interface SkillBundle {
  revision: string;
  digest: string;
  skills: BundledSkill[];
  files: string[];
}

function readSkill(
  git: GitRead,
  revision: string,
  name: string
): { skill: BundledSkill; paths: string[]; dependencies: string[]; bytes: number } {
  const paths = sourcePaths(git, revision, name);
  const files = new Map<string, Uint8Array>();
  let metadata: z.infer<typeof frontmatter> | undefined;
  let bytes = 0;
  for (const file of paths) {
    const content = git(['show', `${revision}:${file}`]);
    if (content.includes('\uFFFD') || content.includes('\0')) {
      throw new Error('Skill file is not supported UTF-8 text.');
    }
    bytes += Buffer.byteLength(content);
    if (bytes > 5_000_000) {
      throw new Error('Skill bundle exceeds the supported byte bound.');
    }
    files.set(file.slice('skills/'.length), strToU8(content));
    if (file === `skills/${name}/SKILL.md`) {
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
      metadata = frontmatter.parse(parseYaml(match?.[1] ?? ''));
    }
  }
  if (metadata?.name !== name) {
    throw new Error('Skill frontmatter identity mismatch.');
  }
  const dependencySource = metadata.metadata?.['headstart-requires'] ?? '';
  if (Buffer.byteLength(dependencySource) > MAX_DEPENDENCY_METADATA_BYTES) {
    throw new Error('Skill dependency metadata exceeds the supported bound.');
  }
  const dependencies = [
    ...new Set(
      dependencySource
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ];
  if (dependencies.length > MAX_SKILLS) {
    throw new Error('Skill dependency closure exceeds the supported bound.');
  }
  const zipped = zipSync(Object.fromEntries(files), { level: 6, mtime: new Date(2020, 0, 1) });
  return {
    skill: {
      type: 'inline',
      name,
      description: metadata.description,
      source: {
        type: 'base64',
        media_type: 'application/zip',
        data: Buffer.from(zipped).toString('base64'),
      },
    },
    paths,
    dependencies,
    bytes,
  };
}

function sourcePaths(git: GitRead, revision: string, name: string): string[] {
  const prefix = `skills/${name}/`;
  const rows = git(['ls-tree', '-r', '-z', revision, '--', prefix]).split('\0').filter(Boolean);
  if (rows.length === 0 || rows.length > 300) {
    throw new Error('Missing skill or excessive archive size.');
  }
  return rows.map((row) => {
    const [entry, file] = row.split('\t');
    if (
      file === undefined ||
      !file.startsWith(prefix) ||
      entry === undefined ||
      !/^100(644|755) blob /.test(entry)
    ) {
      throw new Error('Skill source must contain regular tracked files only.');
    }
    const relative = file.slice(prefix.length);
    if (!/\.(md|txt|json|yaml|yml|ts|js|mjs|cjs|py|sh|csv|toml)$/.test(relative)) {
      throw new Error(
        'Only supported text skill files can be bundled; binary assets require a separate reviewed packager.'
      );
    }
    if (
      relative.split('/').some((part) => part.startsWith('.') || part === 'node_modules') ||
      /[\\\r\n]/.test(relative)
    ) {
      throw new Error('Hidden or unsafe skill archive path.');
    }
    return file;
  });
}

/** Pure preparation: uses immutable Git blobs, never workstation skill copies or credentials. */
export function bundleSkills(
  git: GitRead,
  revisionInput: string,
  requested: readonly string[]
): SkillBundle {
  const revision = revisionSchema.parse(revisionInput);
  if (git(['rev-parse', '--verify', `${revision}^{commit}`]).trim() !== revision) {
    throw new Error('Source revision mismatch.');
  }
  const pending: string[] = [];
  const queued = new Set<string>();
  function enqueue(input: string): void {
    const name = skillName.parse(input);
    if (queued.has(name)) {
      return;
    }
    if (queued.size >= MAX_SKILLS) {
      throw new Error('Skill dependency closure exceeds the supported bound.');
    }
    queued.add(name);
    pending.push(name);
  }
  requested.forEach(enqueue);
  const skills: BundledSkill[] = [];
  const allFiles: string[] = [];
  let bytes = 0;
  for (let name = pending.shift(); name !== undefined; name = pending.shift()) {
    const prepared = readSkill(git, revision, name);
    bytes += prepared.bytes;
    if (bytes > 5_000_000) {
      throw new Error('Skill bundle exceeds the supported byte bound.');
    }
    for (const dependency of prepared.dependencies) {
      enqueue(dependency);
    }
    allFiles.push(...prepared.paths);
    skills.push(prepared.skill);
  }
  if (skills.length === 0) {
    throw new Error('At least one skill is required.');
  }
  return { revision, digest: fingerprint({ revision, skills }), skills, files: allFiles };
}

export function inspectWorkflow(directory: string): unknown {
  const workflow = loadWorkflowPackage(directory);
  return {
    workflow: workflow.manifest.metadata,
    sourceFingerprint: fingerprint({
      manifest: workflow.manifest,
      prompt: workflow.prompt,
      inputSchema: workflow.inputSchema,
      outputSchema: workflow.outputSchema,
    }),
    requirements: workflow.manifest.spec,
    deploymentReady: false,
    reason:
      'Inspection only: no runtime materialization, provider identity, approval executor, or deployment acceptance is established.',
  };
}
