import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
  compatibility?: unknown;
  metadata?: unknown;
}

interface EvaluationCase {
  name?: unknown;
  prompt?: unknown;
  shouldActivate?: unknown;
  expectedBehaviors?: unknown;
}

interface EvaluationFile {
  skill?: unknown;
  cases?: unknown;
}

interface ParsedSkill {
  directory: string;
  file: string;
  body: string;
  frontmatter: SkillFrontmatter;
  dependencies: string[];
}

export interface ValidationIssue {
  file: string;
  message: string;
}

const SKILL_NAME_SEGMENT_PATTERN = /^[a-z0-9]+$/;
const TEXT_EXTENSIONS = new Set(['.json', '.md', '.py', '.ts', '.yaml', '.yml']);
const FORBIDDEN_FILES = new Set(['.env', '.env.local', 'id_rsa', 'id_ed25519']);
const REFERENCE_ROOTS = ['scripts/', 'references/', 'assets/'];
const REFERENCE_PATTERNS = [/\]\(([^)\s]+)\)/g, /`([^`\s]+)`/g];
const README_SKILL_ROW_PATTERN = /^\|\s*`([a-z0-9-]+)`\s*\|/gm;
const FORBIDDEN_CONTENT: { label: string; pattern: RegExp }[] = [
  { label: 'a machine-specific macOS user path', pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: 'a machine-specific Windows user path', pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/ },
  { label: 'a Codex installation path', pattern: /~\/\.codex\/skills\// },
  { label: 'a Claude-only skill-directory substitution', pattern: /\$\{CLAUDE_SKILL_DIR\}/ },
  { label: 'an internal MCP function identifier', pattern: /\bmcp__[A-Za-z0-9_]+/ },
  { label: 'private key material', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidSkillName = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 64 &&
  value.split('-').every((segment) => SKILL_NAME_SEGMENT_PATTERN.test(segment));

const addIssue = (
  issues: ValidationIssue[],
  repositoryRoot: string,
  file: string,
  message: string
): void => {
  issues.push({
    file: path.relative(repositoryRoot, file) || '.',
    message,
  });
};

const parseFrontmatter = (
  repositoryRoot: string,
  skillFile: string,
  issues: ValidationIssue[]
): { frontmatter: SkillFrontmatter; body: string } | undefined => {
  const source = fs.readFileSync(skillFile, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);

  if (!match) {
    addIssue(issues, repositoryRoot, skillFile, 'SKILL.md must contain YAML frontmatter.');
    return undefined;
  }

  try {
    const parsed: unknown = parseYaml(match[1] ?? '');
    if (!isRecord(parsed)) {
      addIssue(issues, repositoryRoot, skillFile, 'Skill frontmatter must be a YAML mapping.');
      return undefined;
    }

    return {
      frontmatter: parsed,
      body: match[2] ?? '',
    };
  } catch (error) {
    addIssue(
      issues,
      repositoryRoot,
      skillFile,
      `Skill frontmatter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
};

const parseDependencies = (
  repositoryRoot: string,
  skillFile: string,
  metadata: unknown,
  issues: ValidationIssue[]
): string[] => {
  if (metadata === undefined) {
    return [];
  }

  if (!isRecord(metadata)) {
    addIssue(issues, repositoryRoot, skillFile, 'metadata must be a string-valued mapping.');
    return [];
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== 'string') {
      addIssue(issues, repositoryRoot, skillFile, `metadata.${key} must be a string.`);
    }
    if (key.startsWith('github-')) {
      addIssue(
        issues,
        repositoryRoot,
        skillFile,
        `metadata.${key} is installation metadata and must not be committed.`
      );
    }
  }

  const rawDependencies = metadata['headstart-requires'];
  if (rawDependencies === undefined) {
    return [];
  }
  if (typeof rawDependencies !== 'string') {
    return [];
  }

  const dependencies = rawDependencies
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean);

  if (dependencies.length !== new Set(dependencies).size) {
    addIssue(issues, repositoryRoot, skillFile, 'headstart-requires contains duplicates.');
  }

  return dependencies;
};

const validateFrontmatter = (
  repositoryRoot: string,
  skillDirectory: string,
  skillFile: string,
  frontmatter: SkillFrontmatter,
  body: string,
  issues: ValidationIssue[]
): string[] => {
  const directoryName = path.basename(skillDirectory);
  const { name, description, compatibility } = frontmatter;

  if (typeof name !== 'string' || !isValidSkillName(name)) {
    addIssue(
      issues,
      repositoryRoot,
      skillFile,
      'name must be 1-64 lowercase alphanumeric or hyphen characters.'
    );
  } else if (name !== directoryName) {
    addIssue(issues, repositoryRoot, skillFile, `name must match directory ${directoryName}.`);
  }

  if (typeof description !== 'string' || description.trim().length === 0) {
    addIssue(issues, repositoryRoot, skillFile, 'description must be a non-empty string.');
  } else if (description.length > 1024) {
    addIssue(issues, repositoryRoot, skillFile, 'description must not exceed 1024 characters.');
  }

  if (compatibility !== undefined && typeof compatibility !== 'string') {
    addIssue(issues, repositoryRoot, skillFile, 'compatibility must be a string when present.');
  } else if (typeof compatibility === 'string' && compatibility.length > 500) {
    addIssue(issues, repositoryRoot, skillFile, 'compatibility must not exceed 500 characters.');
  }

  const lineCount = body.split(/\r?\n/).length;
  if (lineCount > 500) {
    addIssue(
      issues,
      repositoryRoot,
      skillFile,
      `SKILL.md body has ${String(lineCount)} lines; maximum is 500.`
    );
  }

  return parseDependencies(repositoryRoot, skillFile, frontmatter.metadata, issues);
};

const walkFiles = (root: string): string[] => {
  const files: string[] = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(resolved));
    } else if (entry.isFile()) {
      files.push(resolved);
    }
  }

  return files;
};

const findSkillReferences = (source: string): string[] => {
  const references = new Set<string>();

  for (const pattern of REFERENCE_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const candidate = match[1]?.split('#', 1)[0];
      if (candidate && REFERENCE_ROOTS.some((root) => candidate.startsWith(root))) {
        references.add(candidate);
      }
    }
  }

  return [...references];
};

const validateReference = (
  repositoryRoot: string,
  skillDirectory: string,
  skillFile: string,
  reference: string,
  issues: ValidationIssue[]
): void => {
  const resolvedReference = path.resolve(skillDirectory, reference);
  const relativeToSkill = path.relative(skillDirectory, resolvedReference);
  if (relativeToSkill.startsWith('..') || path.isAbsolute(relativeToSkill)) {
    addIssue(issues, repositoryRoot, skillFile, `Reference escapes skill directory: ${reference}.`);
  } else if (!fs.existsSync(resolvedReference)) {
    addIssue(issues, repositoryRoot, skillFile, `Referenced file does not exist: ${reference}.`);
  }
};

const validateSkillFile = (
  repositoryRoot: string,
  skillDirectory: string,
  file: string,
  issues: ValidationIssue[]
): void => {
  const baseName = path.basename(file);
  if (FORBIDDEN_FILES.has(baseName)) {
    addIssue(
      issues,
      repositoryRoot,
      file,
      'Sensitive environment or key file must not be committed.'
    );
  }

  if (!TEXT_EXTENSIONS.has(path.extname(file))) {
    return;
  }

  const source = fs.readFileSync(file, 'utf8');
  for (const forbidden of FORBIDDEN_CONTENT) {
    if (forbidden.pattern.test(source)) {
      addIssue(issues, repositoryRoot, file, `Contains ${forbidden.label}.`);
    }
  }

  if (baseName !== 'SKILL.md') {
    return;
  }

  for (const reference of findSkillReferences(source)) {
    validateReference(repositoryRoot, skillDirectory, file, reference, issues);
  }
};

const validateSkillFiles = (
  repositoryRoot: string,
  skillDirectory: string,
  issues: ValidationIssue[]
): void => {
  for (const file of walkFiles(skillDirectory)) {
    validateSkillFile(repositoryRoot, skillDirectory, file, issues);
  }
};

const validateOpenAiAdapter = (
  repositoryRoot: string,
  skill: ParsedSkill,
  issues: ValidationIssue[]
): void => {
  const adapterFile = path.join(skill.directory, 'agents', 'openai.yaml');
  if (!fs.existsSync(adapterFile)) {
    return;
  }

  try {
    const adapter: unknown = parseYaml(fs.readFileSync(adapterFile, 'utf8'));
    if (!isRecord(adapter) || !isRecord(adapter['interface'])) {
      addIssue(
        issues,
        repositoryRoot,
        adapterFile,
        'OpenAI adapter requires an interface mapping.'
      );
      return;
    }

    const displayName = adapter['interface']['display_name'];
    const shortDescription = adapter['interface']['short_description'];
    const defaultPrompt = adapter['interface']['default_prompt'];
    const skillName =
      typeof skill.frontmatter.name === 'string'
        ? skill.frontmatter.name
        : path.basename(skill.directory);
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      addIssue(issues, repositoryRoot, adapterFile, 'interface.display_name must be a string.');
    }
    if (
      typeof shortDescription !== 'string' ||
      shortDescription.length < 25 ||
      shortDescription.length > 64
    ) {
      addIssue(
        issues,
        repositoryRoot,
        adapterFile,
        'interface.short_description must be 25-64 characters.'
      );
    }
    if (typeof defaultPrompt !== 'string' || !defaultPrompt.includes(`$${skillName}`)) {
      addIssue(
        issues,
        repositoryRoot,
        adapterFile,
        `interface.default_prompt must mention $${skillName}.`
      );
    }
    if (
      adapter['policy'] !== undefined &&
      (!isRecord(adapter['policy']) ||
        typeof adapter['policy']['allow_implicit_invocation'] !== 'boolean')
    ) {
      addIssue(
        issues,
        repositoryRoot,
        adapterFile,
        'policy.allow_implicit_invocation must be boolean when policy is present.'
      );
    }
  } catch (error) {
    addIssue(
      issues,
      repositoryRoot,
      adapterFile,
      `OpenAI adapter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const validateEvaluationCase = (
  repositoryRoot: string,
  evaluationFile: string,
  rawCase: unknown,
  caseNames: Set<string>,
  issues: ValidationIssue[]
): boolean | undefined => {
  if (!isRecord(rawCase)) {
    addIssue(issues, repositoryRoot, evaluationFile, 'Every evaluation case must be an object.');
    return undefined;
  }

  const evaluationCase = rawCase as EvaluationCase;
  if (typeof evaluationCase.name !== 'string' || evaluationCase.name.trim().length === 0) {
    addIssue(issues, repositoryRoot, evaluationFile, 'Every evaluation case needs a name.');
  } else if (caseNames.has(evaluationCase.name)) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      `Duplicate evaluation case: ${evaluationCase.name}.`
    );
  } else {
    caseNames.add(evaluationCase.name);
  }

  if (typeof evaluationCase.prompt !== 'string' || evaluationCase.prompt.trim().length === 0) {
    addIssue(issues, repositoryRoot, evaluationFile, 'Every evaluation case needs a prompt.');
  }
  if (
    !Array.isArray(evaluationCase.expectedBehaviors) ||
    evaluationCase.expectedBehaviors.length === 0 ||
    evaluationCase.expectedBehaviors.some((behavior) => typeof behavior !== 'string')
  ) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      'Every evaluation case needs string expectedBehaviors.'
    );
  }
  if (typeof evaluationCase.shouldActivate !== 'boolean') {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      'Every evaluation case needs boolean shouldActivate.'
    );
    return undefined;
  }

  return evaluationCase.shouldActivate;
};

const validateEvaluations = (
  repositoryRoot: string,
  skill: ParsedSkill,
  issues: ValidationIssue[]
): void => {
  const evaluationFile = path.join(skill.directory, 'evals', 'evals.json');
  if (!fs.existsSync(evaluationFile)) {
    addIssue(issues, repositoryRoot, evaluationFile, 'Every skill requires evals/evals.json.');
    return;
  }

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(evaluationFile, 'utf8'));
    if (!isRecord(parsed)) {
      addIssue(issues, repositoryRoot, evaluationFile, 'Evaluation file must be a JSON object.');
      return;
    }

    const evaluation = parsed as EvaluationFile;
    if (evaluation.skill !== skill.frontmatter.name) {
      addIssue(
        issues,
        repositoryRoot,
        evaluationFile,
        'Evaluation skill must match SKILL.md name.'
      );
    }
    if (!Array.isArray(evaluation.cases) || evaluation.cases.length < 2) {
      addIssue(
        issues,
        repositoryRoot,
        evaluationFile,
        'At least two evaluation cases are required.'
      );
      return;
    }

    let positiveCases = 0;
    let negativeCases = 0;
    const caseNames = new Set<string>();
    for (const rawCase of evaluation.cases) {
      const shouldActivate = validateEvaluationCase(
        repositoryRoot,
        evaluationFile,
        rawCase,
        caseNames,
        issues
      );
      if (shouldActivate === true) {
        positiveCases += 1;
      } else if (shouldActivate === false) {
        negativeCases += 1;
      }
    }

    if (positiveCases === 0 || negativeCases === 0) {
      addIssue(
        issues,
        repositoryRoot,
        evaluationFile,
        'Evaluation cases must include activating and non-activating prompts.'
      );
    }
  } catch (error) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      `Evaluation file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const validateDependencyGraph = (
  repositoryRoot: string,
  skills: Map<string, ParsedSkill>,
  issues: ValidationIssue[]
): void => {
  for (const skill of skills.values()) {
    for (const dependency of skill.dependencies) {
      if (!skills.has(dependency)) {
        addIssue(
          issues,
          repositoryRoot,
          skill.file,
          `Declared dependency does not exist: ${dependency}.`
        );
      }
      if (dependency === skill.frontmatter.name) {
        addIssue(issues, repositoryRoot, skill.file, 'A skill cannot depend on itself.');
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reportedCycles = new Set<string>();

  const visit = (name: string, trail: string[]): void => {
    if (visiting.has(name)) {
      const cycleStart = trail.indexOf(name);
      const cycle = [...trail.slice(cycleStart), name].join(' -> ');
      if (!reportedCycles.has(cycle)) {
        reportedCycles.add(cycle);
        const skill = skills.get(name);
        if (skill) {
          addIssue(issues, repositoryRoot, skill.file, `Skill dependency cycle: ${cycle}.`);
        }
      }
      return;
    }
    if (visited.has(name)) {
      return;
    }

    visiting.add(name);
    const skill = skills.get(name);
    for (const dependency of skill?.dependencies ?? []) {
      if (skills.has(dependency)) {
        visit(dependency, [...trail, name]);
      }
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const name of skills.keys()) {
    visit(name, []);
  }
};

const validateReadmeSkillInventory = (
  repositoryRoot: string,
  skills: Map<string, ParsedSkill>,
  issues: ValidationIssue[]
): void => {
  const readmeFile = path.join(repositoryRoot, 'README.md');
  if (!fs.existsSync(readmeFile)) {
    return;
  }

  const source = fs.readFileSync(readmeFile, 'utf8');
  const headingMatch = /^## Included Skills\s*$/m.exec(source);
  if (!headingMatch) {
    addIssue(issues, repositoryRoot, readmeFile, 'README.md requires an Included Skills section.');
    return;
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remainingSource = source.slice(sectionStart);
  const nextHeading = /^##\s/m.exec(remainingSource);
  const section = remainingSource.slice(0, nextHeading?.index ?? remainingSource.length);
  const documentedSkills = new Set(
    [...section.matchAll(README_SKILL_ROW_PATTERN)].flatMap((match) => (match[1] ? [match[1]] : []))
  );
  for (const skillName of skills.keys()) {
    if (!documentedSkills.has(skillName)) {
      addIssue(
        issues,
        repositoryRoot,
        readmeFile,
        `Included Skills table is missing: ${skillName}.`
      );
    }
  }
  for (const skillName of documentedSkills) {
    if (!skills.has(skillName)) {
      addIssue(
        issues,
        repositoryRoot,
        readmeFile,
        `Included Skills table references an unknown skill: ${skillName}.`
      );
    }
  }
};

export const validateRepository = (repositoryRoot: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const skillsRoot = path.join(repositoryRoot, 'skills');
  if (!fs.existsSync(skillsRoot)) {
    return [{ file: 'skills', message: 'skills directory does not exist.' }];
  }

  const skills = new Map<string, ParsedSkill>();
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      addIssue(
        issues,
        repositoryRoot,
        path.join(skillsRoot, entry.name),
        'Unexpected file in skills root.'
      );
      continue;
    }

    const skillDirectory = path.join(skillsRoot, entry.name);
    const skillFile = path.join(skillDirectory, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      addIssue(issues, repositoryRoot, skillFile, 'Skill directory requires SKILL.md.');
      continue;
    }

    const parsed = parseFrontmatter(repositoryRoot, skillFile, issues);
    if (!parsed) {
      continue;
    }

    const dependencies = validateFrontmatter(
      repositoryRoot,
      skillDirectory,
      skillFile,
      parsed.frontmatter,
      parsed.body,
      issues
    );
    const name = typeof parsed.frontmatter.name === 'string' ? parsed.frontmatter.name : entry.name;
    if (skills.has(name)) {
      addIssue(issues, repositoryRoot, skillFile, `Duplicate skill name: ${name}.`);
    }

    const skill: ParsedSkill = {
      directory: skillDirectory,
      file: skillFile,
      body: parsed.body,
      frontmatter: parsed.frontmatter,
      dependencies,
    };
    skills.set(name, skill);
    validateSkillFiles(repositoryRoot, skillDirectory, issues);
    validateOpenAiAdapter(repositoryRoot, skill, issues);
    validateEvaluations(repositoryRoot, skill, issues);
  }

  validateDependencyGraph(repositoryRoot, skills, issues);
  validateReadmeSkillInventory(repositoryRoot, skills, issues);
  return issues.sort((left, right) =>
    `${left.file}:${left.message}`.localeCompare(`${right.file}:${right.message}`)
  );
};

/* v8 ignore start -- exercised by command-level usage; reusable behavior is unit tested above */
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const issues = validateRepository(repositoryRoot);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    const skillCount = fs.readdirSync(path.join(repositoryRoot, 'skills')).length;
    console.log(`Validated ${String(skillCount)} skills.`);
  }
}
/* v8 ignore stop */
