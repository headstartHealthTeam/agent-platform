import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import { TEMPLATE_VERSION, workspaceTemplates } from './workspace-templates.js';

const RECEIPT = '.headstart/receipt.json';
const receiptSchema = z
  .object({
    version: z.number().int().min(1).max(TEMPLATE_VERSION),
    sourceRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
    files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  })
  .strict();
interface Receipt {
  version: number;
  sourceRevision: string;
  files: { path: string; sha256: string }[];
}
export interface FileOperation {
  path: string;
  action: 'create' | 'unchanged' | 'preserve' | 'update' | 'conflict';
  currentHash: string | null;
  proposedHash: string;
}
export interface TemplateOptions {
  upgrade?: boolean;
  keepLocal?: readonly string[];
  templates?: ReadonlyMap<string, string>;
}

export const digest = (content: string): string =>
  createHash('sha256').update(content).digest('hex');

export const assertSafePath = (target: string): void => {
  let current = path.resolve(target);
  for (;;) {
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error(`Symlink path requires manual review: ${current}`);
    if (stat && current !== path.resolve(target) && !stat.isDirectory())
      throw new Error(`Path ancestor is not a directory: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
};

export const workspaceRoot = (root: string): string => {
  const resolved = path.resolve(root);
  assertSafePath(resolved);
  if (resolved === path.parse(resolved).root || resolved === os.homedir())
    throw new Error('Choose a dedicated workspace directory, not a home or filesystem root.');
  if (fs.lstatSync(path.join(resolved, '.git'), { throwIfNoEntry: false }))
    throw new Error('Workspace root must not be a Git checkout.');
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory())
    throw new Error('Workspace root must be a directory.');
  return resolved;
};

export const workspacePath = (root: string, relative: string): string => {
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Path escapes the workspace.');
  assertSafePath(target);
  return target;
};

export const readRegularFile = (target: string): string | null => {
  assertSafePath(target);
  if (!fs.existsSync(target)) return null;
  if (!fs.statSync(target).isFile()) throw new Error(`Expected a regular file: ${target}`);
  return fs.readFileSync(target, 'utf8');
};

export const atomicWrite = (target: string, content: string, expected: string | null): void => {
  assertSafePath(target);
  if (readRegularFile(target) !== expected)
    throw new Error(`File changed during the operation: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, content, {
    flag: 'wx',
    mode: expected === null ? 0o600 : fs.statSync(target).mode,
  });
  try {
    if (readRegularFile(target) !== expected)
      throw new Error(`File changed during the operation: ${target}`);
    if (expected === null) fs.linkSync(temporary, target);
    else fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
};

const readReceipt = (root: string): Receipt | undefined => {
  const raw = readRegularFile(workspacePath(root, RECEIPT));
  if (raw === null) return undefined;
  const receipt = receiptSchema.parse(JSON.parse(raw));
  const paths = receipt.files.map((file) => file.path);
  for (const relative of paths) workspacePath(root, relative);
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate receipt paths.');
  return receipt;
};

export const hasWorkspaceReceipt = (root: string): boolean => readReceipt(root) !== undefined;

const chooseAction = (
  current: string | null,
  proposed: string,
  ownedHash: string | undefined,
  upgrade: boolean,
  keep: boolean
): FileOperation['action'] => {
  if (current === null) return 'create';
  if (digest(current) === digest(proposed)) return 'unchanged';
  if (!ownedHash) return 'conflict';
  if (!upgrade || ownedHash === digest(proposed) || keep) return 'preserve';
  return digest(current) === ownedHash ? 'update' : 'conflict';
};

export const planFiles = (root: string, options: TemplateOptions = {}): FileOperation[] => {
  const resolved = workspaceRoot(root);
  const templates = options.templates ?? workspaceTemplates();
  const owned = new Map(readReceipt(resolved)?.files.map((file) => [file.path, file.sha256]));
  for (const relative of options.keepLocal ?? []) {
    if (!owned.has(relative) || !templates.has(relative))
      throw new Error('--keep-local must name an owned current template.');
  }
  return [...templates].map(([relative, content]) => {
    const current = readRegularFile(workspacePath(resolved, relative));
    return {
      path: relative,
      action: chooseAction(
        current,
        content,
        owned.get(relative),
        options.upgrade ?? false,
        options.keepLocal?.includes(relative) ?? false
      ),
      currentHash: current === null ? null : digest(current),
      proposedHash: digest(content),
    };
  });
};

export const templatePlanToken = (
  root: string,
  revision: string,
  options: TemplateOptions = {}
): string =>
  digest(
    JSON.stringify({
      root: workspaceRoot(root),
      revision,
      plan: planFiles(root, options),
      keepLocal: options.keepLocal ?? [],
    })
  );

export const createFile = (root: string, relative: string, content: string): void => {
  const target = workspacePath(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
};

const saveReceipt = (root: string, revision: string, files: Map<string, string>): void => {
  const target = workspacePath(root, RECEIPT);
  const receipt: Receipt = {
    version: TEMPLATE_VERSION,
    sourceRevision: revision,
    files: [...files].map(([file, sha256]) => ({ path: file, sha256 })),
  };
  atomicWrite(target, `${JSON.stringify(receipt, null, 2)}\n`, readRegularFile(target));
};

const writeTemplate = (root: string, item: FileOperation, content: string): boolean => {
  const target = workspacePath(root, item.path);
  const before = readRegularFile(target);
  if ((before === null ? null : digest(before)) !== item.currentHash)
    throw new Error(`File changed during setup: ${item.path}`);
  if (item.action === 'create') createFile(root, item.path, content);
  if (item.action === 'update') atomicWrite(target, content, before);
  const changed = item.action === 'create' || item.action === 'update';
  if (item.path === 'bin/headstart' && changed) fs.chmodSync(target, 0o755);
  return changed;
};

export const applyFiles = (
  root: string,
  revision: string,
  options: TemplateOptions = {},
  expectedPlan?: string
): FileOperation[] => {
  const resolved = workspaceRoot(root);
  const plan = planFiles(resolved, options);
  if (plan.some((item) => item.action === 'conflict'))
    throw new Error(
      'Existing files differ from the template. Review conflicts; no files were changed.'
    );
  if (options.upgrade && expectedPlan !== templatePlanToken(resolved, revision, options))
    throw new Error(
      'Workspace or source changed since preview. Use --expected-plan from a fresh preview.'
    );
  const templates = options.templates ?? workspaceTemplates();
  const previous = readReceipt(resolved);
  const owned = new Map(previous?.files.map((file) => [file.path, file.sha256]));
  for (const item of plan) {
    const content = templates.get(item.path);
    if (content === undefined) throw new Error('Template disappeared during setup.');
    const changed = writeTemplate(resolved, item, content);
    const accepted =
      options.upgrade &&
      owned.has(item.path) &&
      (item.action === 'unchanged' || options.keepLocal?.includes(item.path));
    if (changed || accepted) {
      owned.set(item.path, item.proposedHash);
      saveReceipt(resolved, revision, owned);
    }
  }
  if (!previous && !hasWorkspaceReceipt(resolved)) saveReceipt(resolved, revision, owned);
  return plan;
};

export const templateDiff = (root: string, relative: string, proposed: string): string => {
  const before = (readRegularFile(workspacePath(root, relative)) ?? '').split('\n');
  const after = proposed.split('\n');
  let start = 0;
  while (start < before.length && start < after.length && before.at(start) === after.at(start))
    start += 1;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before.at(-end - 1) === after.at(-end - 1)
  )
    end += 1;
  return [
    `--- ${relative} (current)`,
    `+++ ${relative} (proposed)`,
    ...before.slice(start, before.length - end).map((line) => `-${line}`),
    ...after.slice(start, after.length - end).map((line) => `+${line}`),
  ].join('\n');
};

export const withWorkspaceLock = <Result>(root: string, operation: () => Result): Result => {
  const lock = workspacePath(root, '.headstart/operation.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let descriptor: number;
  try {
    descriptor = fs.openSync(lock, 'wx', 0o600);
  } catch {
    throw new Error(
      'Workspace operation lock exists or cannot be created. Check for an active operation; review a stale lock manually.'
    );
  }
  const cleanupErrors: unknown[] = [];
  const cleanup = (): void => {
    try {
      fs.closeSync(descriptor);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      fs.unlinkSync(lock);
    } catch (error) {
      cleanupErrors.push(error);
    }
  };
  let result: Result;
  try {
    result = operation();
  } catch (error) {
    cleanup();
    if (cleanupErrors.length > 0)
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Workspace operation and lock cleanup failed.',
        { cause: error }
      );
    throw error;
  }
  cleanup();
  if (cleanupErrors.length > 0)
    throw new AggregateError(cleanupErrors, 'Workspace lock cleanup failed.');
  return result;
};
