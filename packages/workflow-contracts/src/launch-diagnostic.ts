/** Metadata only. Never evidence that an uncertain create can be retried. Unknown provider
 * strings are replaced, not truncated: even a short error code/parameter can contain secrets.
 */
const codes = [
  'invalid_api_key',
  'invalid_request_error',
  'invalid_value',
  'missing_required_parameter',
  'unsupported_parameter',
  'model_not_found',
  'permission_denied',
  'insufficient_quota',
  'rate_limit_exceeded',
  'server_error',
  'internal_error',
  'mcp_connection_error',
  'mcp_server_error',
] as const;
const types = [
  'invalid_request_error',
  'authentication_error',
  'permission_error',
  'rate_limit_error',
  'insufficient_quota',
  'server_error',
  'internal_error',
  'api_error',
] as const;
const parameters = [
  'agent',
  'agent.model',
  'agent.reasoning',
  'agent.reasoning.effort',
  'agent.instructions',
  'agent.tools',
  'agent.tools.parameters',
  'agent.tools.allowed_tools',
  'agent.tools.transport',
  'agent.tools.transport.server_url',
  'agent.tools.transport.authorization',
  'environment',
  'environment.type',
  'environment.template_id',
  'environment.files',
  'environment.network',
  'environment.capability_directories',
  'input',
  'metadata',
  'vault_ids',
  'stream',
] as const;

export interface AgentLaunchDiagnostic {
  operation: 'sessions.create';
  kind: 'http' | 'timeout' | 'connection' | 'unclassified';
  status?: number;
  code?: (typeof codes)[number] | 'unrecognized';
  type?: (typeof types)[number] | 'unrecognized';
  parameter?: (typeof parameters)[number] | 'unrecognized';
}

function known<T extends string>(options: readonly T[], value: unknown): T | 'unrecognized' {
  return options.find((option) => option === value) ?? 'unrecognized';
}

/** Reconstruct the allowed fields at both the provider and durable-persistence boundary. */
export function agentLaunchDiagnostic(value: unknown): AgentLaunchDiagnostic | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('operation' in value) ||
    value.operation !== 'sessions.create' ||
    !('kind' in value) ||
    (value.kind !== 'http' &&
      value.kind !== 'timeout' &&
      value.kind !== 'connection' &&
      value.kind !== 'unclassified')
  )
    return undefined;
  const result: AgentLaunchDiagnostic = { operation: 'sessions.create', kind: value.kind };
  if (value.kind !== 'http') return result;
  if (
    'status' in value &&
    typeof value.status === 'number' &&
    Number.isInteger(value.status) &&
    value.status >= 100 &&
    value.status <= 599
  )
    result.status = value.status;
  if ('code' in value && value.code !== null && value.code !== undefined)
    result.code = known(codes, value.code);
  if ('type' in value && value.type !== null && value.type !== undefined)
    result.type = known(types, value.type);
  if ('parameter' in value && value.parameter !== null && value.parameter !== undefined) {
    // Drop array positions; only exact reviewed field paths survive. No parameter values do.
    const parameter =
      typeof value.parameter === 'string' && value.parameter.length <= 160
        ? value.parameter.replace(/\[\d{1,3}\]/g, '')
        : undefined;
    result.parameter = known(parameters, parameter);
  }
  return result;
}
