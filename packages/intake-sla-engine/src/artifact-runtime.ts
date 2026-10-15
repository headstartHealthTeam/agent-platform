import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { captureProperty } from './google-capture-property.js';
import { privateDirectory, requireMutableRun, writePrivateJson } from './private-run-storage.js';

const require = createRequire(import.meta.url);
const UNAVAILABLE =
  'Artifact runtime unavailable or incompatible. Use the approved dependency loader, then set SLA_ARTIFACT_TOOL_PATH or NODE_PATH; no machine path was recorded.';

/** Only the existing preflight checks these factories; workbook consumers narrow their results. */
export interface ArtifactRuntimeModule {
  readonly FileBlob: unknown;
  readonly SpreadsheetFile: { readonly exportXlsx: (workbook: unknown) => unknown };
  readonly Workbook: { readonly create: () => unknown };
}
export interface ArtifactRuntimeIdentity {
  readonly nodeVersion: string;
  readonly package: '@oai/artifact-tool';
  readonly resolution: 'explicit' | 'package';
  readonly contractVersion: 1;
}
export interface ArtifactRuntimeOptions {
  readonly env?: Readonly<NodeJS.ProcessEnv>;
  readonly nodeVersion?: string;
  readonly resolve?: (name: string) => string;
  readonly load?: (url: string) => Promise<unknown>;
}
function assertModule(value: unknown): asserts value is ArtifactRuntimeModule {
  const blob = Boolean(captureProperty(value, 'FileBlob'));
  if (
    !blob ||
    typeof captureProperty(captureProperty(value, 'SpreadsheetFile'), 'exportXlsx') !==
      'function' ||
    typeof captureProperty(captureProperty(value, 'Workbook'), 'create') !== 'function'
  )
    throw new Error('Incompatible artifact runtime');
}
function artifactEntry(
  env: Readonly<NodeJS.ProcessEnv>,
  resolve: (name: string) => string
): string {
  const entry = env['SLA_ARTIFACT_TOOL_PATH'];
  if (!entry) return resolve('@oai/artifact-tool');
  return entry;
}
/** Resolve the operator-provisioned library without copying it, discovering credentials or exporting data. */
export async function resolveArtifactRuntime({
  env = process.env,
  nodeVersion = process.versions.node,
  resolve = (name): string => require.resolve(name),
  load = async (url): Promise<unknown> => {
    const value: unknown = await import(url);
    return value;
  },
}: ArtifactRuntimeOptions = {}): Promise<{
  readonly module: ArtifactRuntimeModule;
  readonly identity: ArtifactRuntimeIdentity;
}> {
  if (Number(nodeVersion.split('.')[0]) < 22)
    throw new Error('Intake SLA requires Node 22 or later');
  try {
    const entry = artifactEntry(env, resolve);
    const module = await load(pathToFileURL(entry).href);
    assertModule(module);
    return {
      module,
      identity: {
        nodeVersion,
        package: '@oai/artifact-tool',
        resolution: env['SLA_ARTIFACT_TOOL_PATH'] ? 'explicit' : 'package',
        contractVersion: 1,
      },
    };
  } catch {
    throw new Error(UNAVAILABLE);
  }
}
/** Existing runtime-only check; an optional private receipt does not certify source/provider readiness. */
export async function preflightArtifactRuntime({
  runDirectory,
  ...options
}: ArtifactRuntimeOptions & { readonly runDirectory?: string } = {}): Promise<
  { readonly passed: true } & ArtifactRuntimeIdentity
> {
  const { identity } = await resolveArtifactRuntime(options);
  return recordArtifactRuntimePreflight(identity, runDirectory);
}
export async function recordArtifactRuntimePreflight(
  identity: ArtifactRuntimeIdentity,
  runDirectory?: string
): Promise<{ readonly passed: true } & ArtifactRuntimeIdentity> {
  const result = { passed: true as const, ...identity };
  if (runDirectory) {
    const directory = await privateDirectory(runDirectory);
    await requireMutableRun(directory);
    await writePrivateJson(path.join(directory, 'runtime_preflight.json'), result);
  }
  return result;
}
