import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import { TEMPLATE_VERSION, workspaceTemplates } from './workspace-templates.js';

const RECEIPT = '.headstart/receipt.json';
const receiptSchema = z
  .object({
    version: z.literal(TEMPLATE_VERSION),
    sourceRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
    files: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  })
  .strict();

const ownedFiles = (root: string): Set<string> => {
  const receipt = workspacePath(root, RECEIPT);
  if (!fs.existsSync(receipt)) return new Set();
  if (!fs.statSync(receipt).isFile()) throw new Error('Receipt must be a regular file.');
  const parsed = receiptSchema.parse(JSON.parse(fs.readFileSync(receipt, 'utf8')));
  const templates = workspaceTemplates();
  if (parsed.files.some((file) => !templates.has(file.path)))
    throw new Error('Receipt contains an unknown template path.');
  return new Set(parsed.files.map((file) => file.path));
};

export interface FileOperation {
  path: string;
  action: 'create' | 'unchanged' | 'preserve' | 'conflict';
}

export const assertSafePath = (target: string): void => {
  let current = path.resolve(target);
  for (;;) {
    if (fs.existsSync(current) || fs.lstatSync(current, { throwIfNoEntry: false }) !== undefined) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink path requires manual review: ${current}`);
      if (current !== path.resolve(target) && !stat.isDirectory()) {
        throw new Error(`Path ancestor is not a directory: ${current}`);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
};

export const workspaceRoot = (root: string): string => {
  const resolved = path.resolve(root);
  assertSafePath(resolved);
  if (resolved === path.parse(resolved).root || resolved === os.homedir()) {
    throw new Error('Choose a dedicated workspace directory, not a home or filesystem root.');
  }
  if (fs.existsSync(path.join(resolved, '.git')))
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

export const hasWorkspaceReceipt = (root: string): boolean =>
  fs.existsSync(workspacePath(root, RECEIPT));

const digest = (content: string): string => createHash('sha256').update(content).digest('hex');

export const planFiles = (root: string): FileOperation[] => {
  const resolved = workspaceRoot(root);
  const owned = ownedFiles(resolved);
  return [...workspaceTemplates()].map(([relative, content]) => {
    const target = workspacePath(resolved, relative);
    const exists = fs.existsSync(target);
    const matches =
      exists && fs.statSync(target).isFile() && fs.readFileSync(target, 'utf8') === content;
    const action = !exists
      ? 'create'
      : matches
        ? 'unchanged'
        : owned.has(relative) && fs.statSync(target).isFile()
          ? 'preserve'
          : 'conflict';
    return { path: relative, action };
  });
};

export const createFile = (root: string, relative: string, content: string): void => {
  const target = workspacePath(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
};

export const applyFiles = (root: string, revision: string): FileOperation[] => {
  const resolved = workspaceRoot(root);
  const plan = planFiles(resolved);
  if (plan.some((item) => item.action === 'conflict')) {
    throw new Error(
      'Existing files differ from the template. Review conflicts; no files were changed.'
    );
  }
  const receiptPath = workspacePath(resolved, RECEIPT);
  if (fs.existsSync(receiptPath) && !fs.statSync(receiptPath).isFile())
    throw new Error('Invalid receipt path.');
  const templates = workspaceTemplates();
  for (const item of plan) {
    const content = templates.get(item.path);
    if (item.action === 'create' && content !== undefined) createFile(resolved, item.path, content);
  }
  if (!fs.existsSync(receiptPath)) {
    createFile(
      resolved,
      RECEIPT,
      `${JSON.stringify(
        {
          version: TEMPLATE_VERSION,
          sourceRevision: revision,
          files: [...templates]
            .filter(([file]) => plan.some((item) => item.path === file && item.action === 'create'))
            .map(([file, content]) => ({ path: file, sha256: digest(content) })),
        },
        null,
        2
      )}\n`
    );
  }
  return plan;
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
  try {
    return operation();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
  }
};
