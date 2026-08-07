import fs from 'node:fs';
import path from 'node:path';

import { parseWorkflowManifest, type WorkflowManifest } from '@headstart-health/workflow-contracts';
import { Ajv2020, type ErrorObject, type SchemaObject } from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';

export interface LoadedWorkflowPackage {
  directory: string;
  manifest: WorkflowManifest;
  prompt: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: ErrorObject[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolvePackageFile = (packageDirectory: string, relativeFile: string): string => {
  const packageRoot = fs.realpathSync(packageDirectory);
  const resolved = path.resolve(packageRoot, relativeFile);
  const relative = path.relative(packageRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Workflow file escapes package directory: ${relativeFile}`);
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Workflow file does not exist: ${relativeFile}`);
  }

  const realFile = fs.realpathSync(resolved);
  const realRelative = path.relative(packageRoot, realFile);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw new Error(`Workflow file resolves outside package directory: ${relativeFile}`);
  }

  return realFile;
};

const loadJsonObject = (file: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isRecord(value)) {
    throw new Error(`JSON schema must be an object: ${file}`);
  }
  return value;
};

export const loadWorkflowPackage = (packageDirectory: string): LoadedWorkflowPackage => {
  const manifestFile = resolvePackageFile(packageDirectory, 'workflow.yaml');
  const manifestSource: unknown = parseYaml(fs.readFileSync(manifestFile, 'utf8'));
  const manifest = parseWorkflowManifest(manifestSource);
  const promptFile = resolvePackageFile(packageDirectory, manifest.spec.execution.entrypoint);
  const inputSchemaFile = resolvePackageFile(packageDirectory, manifest.spec.contracts.inputSchema);
  const outputSchemaFile = resolvePackageFile(
    packageDirectory,
    manifest.spec.contracts.outputSchema
  );

  return {
    directory: packageDirectory,
    manifest,
    prompt: fs.readFileSync(promptFile, 'utf8'),
    inputSchema: loadJsonObject(inputSchemaFile),
    outputSchema: loadJsonObject(outputSchemaFile),
  };
};

const validateSchemaValue = (
  schema: Record<string, unknown>,
  value: unknown
): SchemaValidationResult => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema as SchemaObject);
  const valid = validate(value);

  return {
    valid,
    errors: validate.errors ?? [],
  };
};

export const validateWorkflowInput = (
  workflow: LoadedWorkflowPackage,
  input: unknown
): SchemaValidationResult => validateSchemaValue(workflow.inputSchema, input);

export const validateWorkflowOutput = (
  workflow: LoadedWorkflowPackage,
  output: unknown
): SchemaValidationResult => validateSchemaValue(workflow.outputSchema, output);
