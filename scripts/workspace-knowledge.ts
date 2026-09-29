import fs from 'node:fs';
import path from 'node:path';

import { readRegularFile, workspacePath } from './workspace-files.js';

export interface KnowledgeMatch {
  page: string;
  line: number;
  excerpt: string;
}
const MAX_PAGE_BYTES = 1024 * 1024;
const SEARCH_DIRECTORIES = new Set(['projects', 'wiki', 'sources', 'reports']);

const knowledgePages = (root: string): string[] => {
  const knowledgeRoot = workspacePath(root, 'Headstart');
  const files: string[] = [];
  const visit = (directory: string): void => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const location = path.join(directory, entry.name);
      if (
        entry.isDirectory() &&
        (directory !== knowledgeRoot || SEARCH_DIRECTORIES.has(entry.name))
      )
        visit(location);
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(location);
      if (files.length > 10_000)
        throw new Error('Knowledge scope is too large; narrow the directory before searching.');
    }
  };
  visit(knowledgeRoot);
  return files;
};

export const searchKnowledge = (root: string, query: string): KnowledgeMatch[] => {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) throw new Error('A non-empty --query is required.');
  const matches: KnowledgeMatch[] = [];
  for (const file of knowledgePages(root)) {
    if (fs.statSync(file).size > MAX_PAGE_BYTES) continue;
    const content = readRegularFile(file) ?? '';
    const lines = content.split('\n');
    for (const [index, line] of lines.entries()) {
      if (terms.every((term) => line.toLowerCase().includes(term)))
        matches.push({
          page: path.relative(path.join(root, 'Headstart'), file),
          line: index + 1,
          excerpt: line.slice(0, 500),
        });
      if (matches.length === 50) return matches;
    }
  }
  return matches;
};

export const readKnowledge = (root: string, page: string): string => {
  const knowledgeRoot = workspacePath(root, 'Headstart');
  const target = workspacePath(knowledgeRoot, page);
  if (!target.endsWith('.md')) throw new Error('Knowledge reads require a Markdown page.');
  if (fs.statSync(target).size > MAX_PAGE_BYTES)
    throw new Error('Page exceeds the bounded reader size; open the source directly.');
  const content = readRegularFile(target);
  if (content === null) throw new Error('Knowledge page does not exist.');
  return content;
};
