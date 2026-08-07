import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadWorkflowPackage,
  validateWorkflowInput,
  validateWorkflowOutput,
} from '@headstart-health/workflow-runtime';

export interface WorkflowValidationIssue {
  file: string;
  message: string;
}

const README_WORKFLOW_ROW_PATTERN = /^\|\s*(?:`([a-z0-9-]+)`|\[`([a-z0-9-]+)`\]\([^)]+\))\s*\|/gm;
const WORKFLOW_MANIFEST_FILE = 'workflow.yaml';
const INPUT_FIXTURE_FILE = 'fixtures/input.valid.json';
const OUTPUT_FIXTURE_FILE = 'fixtures/output.valid.json';
const EVALUATION_FILE = 'evals/evals.json';

type LoadedWorkflow = ReturnType<typeof loadWorkflowPackage>;
const EVALUATION_CATEGORIES = ['happy-path', 'boundary', 'failure'] as const;
const VALIDATION_ERROR_OUTCOME = 'validation-error';
const EVALUATION_OUTCOMES = ['success', 'human-review', VALIDATION_ERROR_OUTCOME] as const;
type EvaluationCategory = (typeof EVALUATION_CATEGORIES)[number];
type EvaluationOutcome = (typeof EVALUATION_OUTCOMES)[number];

interface WorkflowEvaluationCase {
  name?: unknown;
  category?: unknown;
  input?: unknown;
  expectedOutcome?: unknown;
  expectedBehaviors?: unknown;
}

interface WorkflowEvaluationFile {
  workflow?: unknown;
  cases?: unknown;
}

const addIssue = (
  issues: WorkflowValidationIssue[],
  repositoryRoot: string,
  file: string,
  message: string
): void => {
  const relativeFile = path.relative(repositoryRoot, file) || '.';
  issues.push({ file: relativeFile.split(path.sep).join('/'), message });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRequiredJson = (
  repositoryRoot: string,
  file: string,
  issues: WorkflowValidationIssue[]
): unknown => {
  if (!fs.existsSync(file)) {
    addIssue(issues, repositoryRoot, file, 'Managed workflow requires this JSON file.');
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    addIssue(
      issues,
      repositoryRoot,
      file,
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
};

const formatContractErrors = (errors: { instancePath: string; message?: string }[]): string =>
  errors.map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('; ');

const getDocumentedWorkflows = (
  repositoryRoot: string,
  issues: WorkflowValidationIssue[]
): Set<string> => {
  const readmeFile = path.join(repositoryRoot, 'README.md');
  const source = fs.readFileSync(readmeFile, 'utf8');
  const heading = /^## Managed Workflows\s*$/m.exec(source);
  if (!heading) {
    addIssue(issues, repositoryRoot, readmeFile, 'README.md requires a Managed Workflows section.');
    return new Set();
  }

  const remaining = source.slice(heading.index + heading[0].length);
  const nextHeading = /^##\s/m.exec(remaining);
  const section = remaining.slice(0, nextHeading?.index ?? remaining.length);
  return new Set(
    [...section.matchAll(README_WORKFLOW_ROW_PATTERN)].flatMap((match) => {
      const workflowName = match[1] ?? match[2];
      return workflowName ? [workflowName] : [];
    })
  );
};

const validatePackageMetadata = (
  repositoryRoot: string,
  packageDirectory: string,
  workflowId: string,
  issues: WorkflowValidationIssue[]
): void => {
  const packageFile = path.join(packageDirectory, 'package.json');
  const readmeFile = path.join(packageDirectory, 'README.md');
  if (!fs.existsSync(packageFile)) {
    addIssue(issues, repositoryRoot, packageFile, 'Managed workflow requires package.json.');
  } else {
    const packageJson: unknown = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    const expectedName = `@headstart-health/workflow-${workflowId}`;
    if (
      typeof packageJson !== 'object' ||
      packageJson === null ||
      !('name' in packageJson) ||
      packageJson.name !== expectedName
    ) {
      addIssue(issues, repositoryRoot, packageFile, `Package name must be ${expectedName}.`);
    }
  }

  if (!fs.existsSync(readmeFile)) {
    addIssue(issues, repositoryRoot, readmeFile, 'Managed workflow requires README.md.');
  }
};

const validateContractFixtures = (
  repositoryRoot: string,
  packageDirectory: string,
  workflow: LoadedWorkflow,
  issues: WorkflowValidationIssue[]
): void => {
  const inputFile = path.join(packageDirectory, INPUT_FIXTURE_FILE);
  const input = readRequiredJson(repositoryRoot, inputFile, issues);
  if (input !== undefined) {
    const result = validateWorkflowInput(workflow, input);
    if (!result.valid) {
      addIssue(
        issues,
        repositoryRoot,
        inputFile,
        `Input fixture does not satisfy the workflow schema: ${formatContractErrors(result.errors)}`
      );
    }
  }

  const outputFile = path.join(packageDirectory, OUTPUT_FIXTURE_FILE);
  const output = readRequiredJson(repositoryRoot, outputFile, issues);
  if (output !== undefined) {
    const result = validateWorkflowOutput(workflow, output);
    if (!result.valid) {
      addIssue(
        issues,
        repositoryRoot,
        outputFile,
        `Output fixture does not satisfy the workflow schema: ${formatContractErrors(result.errors)}`
      );
    }
  }
};

const validateEvaluationCase = (
  repositoryRoot: string,
  evaluationFile: string,
  workflow: LoadedWorkflow,
  rawCase: unknown,
  caseNames: Set<string>,
  categories: Set<EvaluationCategory>,
  issues: WorkflowValidationIssue[]
): void => {
  if (!isRecord(rawCase)) {
    addIssue(issues, repositoryRoot, evaluationFile, 'Every evaluation case must be an object.');
    return;
  }

  const evaluationCase: WorkflowEvaluationCase = rawCase;
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

  if (!EVALUATION_CATEGORIES.includes(evaluationCase.category as EvaluationCategory)) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      'Every evaluation case needs category happy-path, boundary, or failure.'
    );
  } else {
    categories.add(evaluationCase.category as EvaluationCategory);
  }

  if (!EVALUATION_OUTCOMES.includes(evaluationCase.expectedOutcome as EvaluationOutcome)) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      'Every evaluation case needs expectedOutcome success, human-review, or validation-error.'
    );
    return;
  }

  if (
    !Array.isArray(evaluationCase.expectedBehaviors) ||
    evaluationCase.expectedBehaviors.length === 0 ||
    evaluationCase.expectedBehaviors.some(
      (behavior) => typeof behavior !== 'string' || behavior.trim().length === 0
    )
  ) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      'Every evaluation case needs non-empty string expectedBehaviors.'
    );
  }

  const result = validateWorkflowInput(workflow, evaluationCase.input);
  if (evaluationCase.expectedOutcome === VALIDATION_ERROR_OUTCOME && result.valid) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      `Evaluation case ${String(evaluationCase.name)} expects validation-error but its input is valid.`
    );
  } else if (evaluationCase.expectedOutcome !== VALIDATION_ERROR_OUTCOME && !result.valid) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      `Evaluation case ${String(evaluationCase.name)} has invalid input: ${formatContractErrors(result.errors)}`
    );
  }
};

const validateEvaluations = (
  repositoryRoot: string,
  packageDirectory: string,
  workflow: LoadedWorkflow,
  issues: WorkflowValidationIssue[]
): void => {
  const evaluationFile = path.join(packageDirectory, EVALUATION_FILE);
  const parsed = readRequiredJson(repositoryRoot, evaluationFile, issues);
  if (!isRecord(parsed)) {
    if (parsed !== undefined) {
      addIssue(issues, repositoryRoot, evaluationFile, 'Evaluation file must be a JSON object.');
    }
    return;
  }

  const evaluation: WorkflowEvaluationFile = parsed;
  if (evaluation.workflow !== workflow.manifest.metadata.id) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      `Evaluation workflow must match ${workflow.manifest.metadata.id}.`
    );
  }
  if (!Array.isArray(evaluation.cases) || evaluation.cases.length < 2) {
    addIssue(
      issues,
      repositoryRoot,
      evaluationFile,
      'At least two managed workflow evaluation cases are required.'
    );
    return;
  }

  const caseNames = new Set<string>();
  const categories = new Set<EvaluationCategory>();
  for (const evaluationCase of evaluation.cases) {
    validateEvaluationCase(
      repositoryRoot,
      evaluationFile,
      workflow,
      evaluationCase,
      caseNames,
      categories,
      issues
    );
  }

  for (const requiredCategory of ['happy-path', 'boundary'] as const) {
    if (!categories.has(requiredCategory)) {
      addIssue(
        issues,
        repositoryRoot,
        evaluationFile,
        `Managed workflow evaluations require a ${requiredCategory} case.`
      );
    }
  }
};

const validateWorkflowContent = (
  repositoryRoot: string,
  packageDirectory: string,
  workflow: ReturnType<typeof loadWorkflowPackage>,
  issues: WorkflowValidationIssue[]
): void => {
  if (workflow.prompt.trim().length === 0) {
    addIssue(
      issues,
      repositoryRoot,
      path.join(packageDirectory, workflow.manifest.spec.execution.entrypoint),
      'Workflow entrypoint prompt must not be empty.'
    );
  }

  validateWorkflowInput(workflow, {});
  validateWorkflowOutput(workflow, {});
  validateContractFixtures(repositoryRoot, packageDirectory, workflow, issues);
  validateEvaluations(repositoryRoot, packageDirectory, workflow, issues);

  if (workflow.manifest.metadata.lifecycle === 'active') {
    addIssue(
      issues,
      repositoryRoot,
      path.join(packageDirectory, WORKFLOW_MANIFEST_FILE),
      'Active managed workflows are blocked until isolated workspace, skill, tool, and environment materialization is enforced.'
    );
  }

  for (const skill of workflow.manifest.spec.skills.required) {
    if (!fs.existsSync(path.join(repositoryRoot, 'skills', skill, 'SKILL.md'))) {
      addIssue(
        issues,
        repositoryRoot,
        path.join(packageDirectory, WORKFLOW_MANIFEST_FILE),
        `Required skill does not exist: ${skill}.`
      );
    }
  }
};

const validateWorkflowDirectory = (
  repositoryRoot: string,
  packageDirectory: string,
  directoryName: string,
  discovered: Set<string>,
  issues: WorkflowValidationIssue[]
): void => {
  try {
    const workflow = loadWorkflowPackage(packageDirectory);
    const workflowId = workflow.manifest.metadata.id;
    discovered.add(workflowId);

    if (workflowId !== directoryName) {
      addIssue(
        issues,
        repositoryRoot,
        path.join(packageDirectory, WORKFLOW_MANIFEST_FILE),
        `Workflow id must match directory ${directoryName}.`
      );
    }

    validatePackageMetadata(repositoryRoot, packageDirectory, workflowId, issues);
    validateWorkflowContent(repositoryRoot, packageDirectory, workflow, issues);
  } catch (error) {
    addIssue(
      issues,
      repositoryRoot,
      path.join(packageDirectory, WORKFLOW_MANIFEST_FILE),
      error instanceof Error ? error.message : String(error)
    );
  }
};

const reconcileWorkflowInventory = (
  repositoryRoot: string,
  discovered: Set<string>,
  documented: Set<string>,
  issues: WorkflowValidationIssue[]
): void => {
  const readmeFile = path.join(repositoryRoot, 'README.md');
  for (const workflow of discovered) {
    if (!documented.has(workflow)) {
      addIssue(
        issues,
        repositoryRoot,
        readmeFile,
        `Managed Workflows table is missing: ${workflow}.`
      );
    }
  }
  for (const workflow of documented) {
    if (!discovered.has(workflow)) {
      addIssue(
        issues,
        repositoryRoot,
        readmeFile,
        `Managed Workflows table references an unknown workflow: ${workflow}.`
      );
    }
  }
};

export const validateWorkflowRepository = (repositoryRoot: string): WorkflowValidationIssue[] => {
  const issues: WorkflowValidationIssue[] = [];
  const workflowsRoot = path.join(repositoryRoot, 'workflows');
  if (!fs.existsSync(workflowsRoot)) {
    return [{ file: 'workflows', message: 'workflows directory does not exist.' }];
  }

  const documented = getDocumentedWorkflows(repositoryRoot, issues);
  const discovered = new Set<string>();

  for (const entry of fs.readdirSync(workflowsRoot, { withFileTypes: true })) {
    const packageDirectory = path.join(workflowsRoot, entry.name);
    if (!entry.isDirectory()) {
      addIssue(issues, repositoryRoot, packageDirectory, 'Unexpected file in workflows root.');
      continue;
    }

    validateWorkflowDirectory(repositoryRoot, packageDirectory, entry.name, discovered, issues);
  }

  reconcileWorkflowInventory(repositoryRoot, discovered, documented, issues);

  return issues.sort((left, right) =>
    `${left.file}:${left.message}`.localeCompare(`${right.file}:${right.message}`)
  );
};

/* v8 ignore start -- command wrapper; repository behavior is tested through the exported function */
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const issues = validateWorkflowRepository(repositoryRoot);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    const workflowCount = fs.readdirSync(path.join(repositoryRoot, 'workflows')).length;
    console.log(`Validated ${String(workflowCount)} managed workflows.`);
  }
}
/* v8 ignore stop */
