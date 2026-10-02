import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';

import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import type {
  FirefliesPrecomputed,
  FirefliesSuppliedInterpretation,
} from './fireflies-evidence-types.js';
import {
  INTERPRETATION_BINDING_VERSION,
  interpreterConfigFromEnv,
  type InterpreterConfig,
  type InterpreterEnvironment,
} from './interpretation-binding.js';
import type { ReportInterpreterExecution } from './report-interpretation.js';
import { savedFields } from './saved-report-fields.js';

export interface ReportPrecomputedArtifact<
  T extends FirefliesSuppliedInterpretation,
> extends FirefliesPrecomputed<T> {
  readonly rows?:
    | readonly (FirefliesPrecomputed<T> & { readonly opportunityId?: string | null | undefined })[]
    | null
    | undefined;
}
export interface PreparedReportInterpreter<T extends FirefliesSuppliedInterpretation> {
  readonly requested: boolean;
  readonly execution: ReportInterpreterExecution;
  readonly config: InterpreterConfig | null;
  readonly artifact: {
    readonly rows?: readonly unknown[] | null | undefined;
    readonly executionProvenance?: unknown;
  };
  readonly precomputed: ReadonlyMap<string, FirefliesPrecomputed<T>>;
}

/** The preflight lease uses the live clock, never the frozen assessment cutoff. */
function requireBuildPreflight(preflight: unknown, config: InterpreterConfig, now: number): void {
  const record = savedFields(preflight);
  const age = now - Date.parse(String(record['checkedAt']));
  const passed = Boolean(record['passed']);
  if (
    !passed ||
    record['model'] !== config.model ||
    record['provider'] !== config.provider ||
    record['engineVersion'] !== EVIDENCE_ENGINE_VERSION ||
    record['bindingVersion'] !== INTERPRETATION_BINDING_VERSION ||
    record['store'] !== false ||
    record['credentialSourceApproved'] !== true ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 1_800_000
  )
    throw new Error('A matching successful AI preflight from the last 30 minutes is required');
}
function requireCodexArtifact(artifact: Readonly<Record<string, unknown>>): void {
  const provenance = savedFields(artifact['executionProvenance']);
  if (
    artifact['apiEnabled'] !== false ||
    provenance['kind'] !== 'codex-current-run' ||
    provenance['api'] !== false ||
    artifact['engineVersion'] !== EVIDENCE_ENGINE_VERSION ||
    ['provider', 'model', 'store'].some((key) => Object.hasOwn(artifact, key))
  )
    throw new Error('Current-run Codex interpretations have invalid execution provenance');
}
function requireApiArtifact(
  artifact: Readonly<Record<string, unknown>>,
  config: InterpreterConfig | null
): void {
  if (
    artifact['apiEnabled'] !== true ||
    artifact['model'] !== config?.model ||
    artifact['provider'] !== config?.provider ||
    artifact['engineVersion'] !== EVIDENCE_ENGINE_VERSION ||
    artifact['store'] !== false
  )
    throw new Error('API interpretation artifact does not match the current interpreter contract');
}

function indexPrecomputed<T extends FirefliesSuppliedInterpretation>(
  artifact: ReportPrecomputedArtifact<T>
): ReadonlyMap<string, FirefliesPrecomputed<T>> {
  const precomputed = new Map<string, FirefliesPrecomputed<T>>();
  for (const row of artifact.rows ?? []) {
    if (row.opportunityId)
      precomputed.set(row.opportunityId, {
        ...row,
        // Own undefined fields intentionally shadow row metadata, just as in the original builder.
        model: artifact.model,
        provider: artifact.provider,
        engineVersion: artifact.engineVersion,
        apiEnabled: artifact.apiEnabled,
        currentRunPrecomputed: artifact.currentRunPrecomputed,
        executionProvenance: artifact.executionProvenance,
        store: artifact.store,
      });
  }
  return precomputed;
}
export interface ReportInterpreterSetupInput {
  readonly setting: string | undefined;
  readonly environment: InterpreterEnvironment;
  readonly client: StructuredResponsesClient | null;
  readonly artifact: unknown;
  readonly preflight?: unknown;
  readonly now?: number;
}
export function reportInterpreterRows(artifact: unknown): readonly unknown[] {
  if (artifact === null || artifact === undefined)
    throw new Error('Invalid saved report interpretation artifact');
  const rows = savedFields(artifact)['rows'] ?? [];
  if (!Array.isArray(rows)) throw new Error('Invalid saved report interpretation rows');
  return rows;
}
/** Startup examines execution metadata, not the contents of unused interpretation records. */
export function prepareReportInterpreterSelection(
  input: ReportInterpreterSetupInput
): Pick<
  PreparedReportInterpreter<FirefliesSuppliedInterpretation>,
  'requested' | 'execution' | 'config'
> {
  const setting = (input.setting ?? '').trim();
  if (setting !== 'on' && setting !== 'off')
    throw new Error('SLA_AI_INTERPRETATION must be explicitly on or off');
  const requested = setting === 'on';
  const apiEnabled = requested && input.client !== null;
  const artifact = savedFields(input.artifact);
  const hasRows = reportInterpreterRows(input.artifact).length > 0;
  const codex = hasRows && artifact['currentRunPrecomputed'] === true;
  const config =
    requested && (apiEnabled || (hasRows && !codex))
      ? interpreterConfigFromEnv(input.environment, { requireCredentialSource: apiEnabled })
      : null;
  let execution: ReportInterpreterExecution = { apiEnabled: false };
  if (apiEnabled && config !== null) {
    requireBuildPreflight(input.preflight, config, input.now ?? Date.now());
    execution = { apiEnabled: true, client: input.client, config };
  }
  if (requested && codex) requireCodexArtifact(artifact);
  else if (requested && hasRows) requireApiArtifact(artifact, config);
  return { requested, execution, config };
}
/** Approved report startup selection. The caller injects a client, never a credential into artifacts. */
export function prepareReportInterpreter<T extends FirefliesSuppliedInterpretation>(
  input: Omit<ReportInterpreterSetupInput, 'artifact'> & {
    readonly artifact: ReportPrecomputedArtifact<T>;
  }
): PreparedReportInterpreter<T> {
  return {
    ...prepareReportInterpreterSelection(input),
    artifact: input.artifact,
    precomputed: indexPrecomputed(input.artifact),
  };
}
