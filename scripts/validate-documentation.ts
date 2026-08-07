import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import GithubSlugger from 'github-slugger';
import type { Nodes } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export interface DocumentationValidationIssue {
  file: string;
  message: string;
}

interface MarkdownTarget {
  line: number;
  url: string;
}

interface LocalTarget {
  file: string;
  fragment?: string;
}

const DOCUMENTATION_HUB = 'docs/README.md';
const IGNORED_DIRECTORIES = new Set(['.git', '.turbo', 'coverage', 'dist', 'node_modules']);
const EXTERNAL_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const SCOPED_README_PATTERN = /^(?:apps|packages|workflows)\/[^/]+\/README\.md$/;

const toRepositoryPath = (repositoryRoot: string, file: string): string =>
  path.relative(repositoryRoot, file).split(path.sep).join('/');

const addIssue = (
  issues: DocumentationValidationIssue[],
  repositoryRoot: string,
  file: string,
  message: string
): void => {
  issues.push({ file: toRepositoryPath(repositoryRoot, file) || '.', message });
};

const collectMarkdownFiles = (directory: string): string[] => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRECTORIES.has(entry.name) || entry.isSymbolicLink()) {
      continue;
    }

    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(candidate));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      files.push(candidate);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
};

const collectMarkdownTargets = (file: string): MarkdownTarget[] => {
  const tree = unified().use(remarkParse).parse(fs.readFileSync(file, 'utf8'));
  const targets: MarkdownTarget[] = [];

  visit(tree, (node: Nodes) => {
    if (node.type !== 'link' && node.type !== 'image' && node.type !== 'definition') {
      return;
    }

    targets.push({ line: node.position?.start.line ?? 1, url: node.url });
  });

  return targets;
};

const resolveLocalTarget = (sourceFile: string, url: string): LocalTarget | undefined => {
  if (EXTERNAL_URL_PATTERN.test(url)) {
    return undefined;
  }

  const fragmentIndex = url.indexOf('#');
  const pathWithQuery = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
  const encodedFragment = fragmentIndex === -1 ? undefined : url.slice(fragmentIndex + 1);
  const encodedPath = pathWithQuery.split('?', 1)[0] ?? '';
  if (encodedPath.length === 0 && encodedFragment === undefined) {
    return undefined;
  }

  const file =
    encodedPath.length === 0
      ? sourceFile
      : path.resolve(path.dirname(sourceFile), decodeURIComponent(encodedPath));
  const fragment =
    encodedFragment && encodedFragment.length > 0 ? decodeURIComponent(encodedFragment) : undefined;

  return { file, ...(fragment ? { fragment } : {}) };
};

const isOutsideRepository = (repositoryRoot: string, target: string): boolean => {
  const relative = path.relative(repositoryRoot, target);
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
};

const collectHeadingAnchors = (file: string, cache: Map<string, Set<string>>): Set<string> => {
  const cached = cache.get(file);
  if (cached) {
    return cached;
  }

  const anchors = new Set<string>();
  if (path.extname(file).toLowerCase() === '.md') {
    const tree = unified().use(remarkParse).parse(fs.readFileSync(file, 'utf8'));
    const slugger = new GithubSlugger();
    visit(tree, 'heading', (heading) => {
      anchors.add(slugger.slug(toString(heading)));
    });
  }
  cache.set(file, anchors);
  return anchors;
};

const validateLocalLinks = (
  repositoryRoot: string,
  markdownFiles: string[],
  issues: DocumentationValidationIssue[]
): void => {
  const headingCache = new Map<string, Set<string>>();
  for (const file of markdownFiles) {
    for (const target of collectMarkdownTargets(file)) {
      let resolved: string | undefined;
      let fragment: string | undefined;
      try {
        const localTarget = resolveLocalTarget(file, target.url);
        resolved = localTarget?.file;
        fragment = localTarget?.fragment;
      } catch {
        addIssue(
          issues,
          repositoryRoot,
          file,
          `Line ${String(target.line)} has an invalid encoded link: ${target.url}`
        );
        continue;
      }

      if (!resolved) {
        continue;
      }
      if (isOutsideRepository(repositoryRoot, resolved)) {
        addIssue(
          issues,
          repositoryRoot,
          file,
          `Line ${String(target.line)} links outside the repository: ${target.url}`
        );
      } else if (!fs.existsSync(resolved)) {
        addIssue(
          issues,
          repositoryRoot,
          file,
          `Line ${String(target.line)} has a broken local link: ${target.url}`
        );
      } else if (
        fragment &&
        path.extname(resolved).toLowerCase() === '.md' &&
        !collectHeadingAnchors(resolved, headingCache).has(fragment)
      ) {
        addIssue(
          issues,
          repositoryRoot,
          file,
          `Line ${String(target.line)} has a broken Markdown heading anchor: ${target.url}`
        );
      }
    }
  }
};

const getResolvedTargets = (sourceFile: string): Set<string> => {
  const targets = new Set<string>();
  for (const target of collectMarkdownTargets(sourceFile)) {
    try {
      const resolved = resolveLocalTarget(sourceFile, target.url)?.file;
      if (resolved) {
        targets.add(path.normalize(resolved));
      }
    } catch {
      // The local-link validation reports malformed URL encoding with its source line.
    }
  }
  return targets;
};

const isIndexedCanonicalDocument = (repositoryRoot: string, file: string): boolean => {
  const relative = toRepositoryPath(repositoryRoot, file);
  return (
    (relative.startsWith('docs/') && relative !== DOCUMENTATION_HUB) ||
    relative.startsWith('standards/') ||
    SCOPED_README_PATTERN.test(relative)
  );
};

const requireLink = (
  repositoryRoot: string,
  sourceFile: string,
  targetFile: string,
  issueMessage: string,
  issues: DocumentationValidationIssue[]
): void => {
  if (!fs.existsSync(sourceFile)) {
    addIssue(issues, repositoryRoot, sourceFile, 'Required documentation file is missing.');
    return;
  }

  if (!getResolvedTargets(sourceFile).has(path.normalize(targetFile))) {
    addIssue(issues, repositoryRoot, sourceFile, issueMessage);
  }
};

const validateDocumentationNavigation = (
  repositoryRoot: string,
  markdownFiles: string[],
  issues: DocumentationValidationIssue[]
): void => {
  const hubFile = path.join(repositoryRoot, DOCUMENTATION_HUB);
  for (const sourceName of ['README.md', 'AGENTS.md']) {
    requireLink(
      repositoryRoot,
      path.join(repositoryRoot, sourceName),
      hubFile,
      `Must link to the canonical documentation hub at ${DOCUMENTATION_HUB}.`,
      issues
    );
  }

  for (const file of markdownFiles) {
    if (isIndexedCanonicalDocument(repositoryRoot, file)) {
      requireLink(
        repositoryRoot,
        hubFile,
        file,
        `Documentation hub must index ${toRepositoryPath(repositoryRoot, file)}.`,
        issues
      );
    }

    if (SCOPED_README_PATTERN.test(toRepositoryPath(repositoryRoot, file))) {
      requireLink(
        repositoryRoot,
        file,
        hubFile,
        `Scoped README must link back to ${DOCUMENTATION_HUB}.`,
        issues
      );
    }
  }
};

export const validateDocumentationRepository = (
  repositoryRoot: string
): DocumentationValidationIssue[] => {
  const issues: DocumentationValidationIssue[] = [];
  const markdownFiles = collectMarkdownFiles(repositoryRoot);
  validateLocalLinks(repositoryRoot, markdownFiles, issues);
  validateDocumentationNavigation(repositoryRoot, markdownFiles, issues);
  return issues.sort((left, right) =>
    `${left.file}:${left.message}`.localeCompare(`${right.file}:${right.message}`)
  );
};

/* v8 ignore start -- command wrapper; behavior is tested through the exported function */
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const issues = validateDocumentationRepository(repositoryRoot);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Validated repository documentation links and navigation.');
  }
}
/* v8 ignore stop */
