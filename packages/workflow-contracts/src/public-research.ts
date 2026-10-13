import type { AgentLaunchRequest } from './launch.js';
import type { OperatorBinding } from './operator.js';

/** Public-only research brief. Never include source records, credentials or private case data. */
export interface AgentPublicResearchRequest {
  requestId: string;
  brief: string;
}
export interface AgentResearchFileTransfer {
  path: string;
  digest: string;
  bytes: Uint8Array;
}
export interface AgentResearchFileReceipt {
  environmentId: string;
  path: string;
  digest: string;
  size: number;
  /** Retained ownership of any Files API upload; no automatic deletion is implied. */
  uploadedFileId?: string;
}

const transferCodes = [
  'files_api_rate_limit_exceeded',
  'rate_limit_exceeded',
  'insufficient_quota',
  'invalid_request_error',
  'invalid_value',
  'invalid_api_key',
  'permission_denied',
  'not_found',
  'server_error',
  'internal_error',
] as const;

/** Safe engineering metadata, never proof that an uncertain upload can be replayed.
 * No provider message, body, header, source path, parameter value or credential is retained.
 */
export interface AgentResearchTransferDiagnostic {
  operation: 'environment-file-transfer';
  phase: 'files-upload' | 'environment-create' | 'receipt-validation' | 'unclassified';
  transport: 'inline' | 'file-id' | 'unclassified';
  kind: 'http' | 'timeout' | 'aborted' | 'connection' | 'invalid-receipt' | 'unclassified';
  status?: number;
  code?: (typeof transferCodes)[number] | 'unrecognized';
}

/** Reconstruct at both the SDK and persistence boundary; even short unknown strings may be secrets. */
export function agentResearchTransferDiagnostic(
  value: unknown
): AgentResearchTransferDiagnostic | undefined {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('operation' in value) ||
    value.operation !== 'environment-file-transfer' ||
    !('phase' in value) ||
    (value.phase !== 'files-upload' &&
      value.phase !== 'environment-create' &&
      value.phase !== 'receipt-validation' &&
      value.phase !== 'unclassified') ||
    !('transport' in value) ||
    (value.transport !== 'inline' &&
      value.transport !== 'file-id' &&
      value.transport !== 'unclassified') ||
    !('kind' in value) ||
    (value.kind !== 'http' &&
      value.kind !== 'timeout' &&
      value.kind !== 'aborted' &&
      value.kind !== 'connection' &&
      value.kind !== 'invalid-receipt' &&
      value.kind !== 'unclassified')
  )
    return undefined;
  const result: AgentResearchTransferDiagnostic = {
    operation: 'environment-file-transfer',
    phase: value.phase,
    transport: value.transport,
    kind: value.kind,
  };
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
    result.code = transferCodes.find((code) => code === value.code) ?? 'unrecognized';
  return result;
}

export interface AgentPublicResearchPort {
  publicResearchLaunch(request: AgentPublicResearchRequest): Promise<AgentLaunchRequest>;
  /** Full immutable public-original bytes into the primary environment, not a summary or URL.
   * The owner journals this entire upload before dispatch and never retries an uncertain upload.
   */
  stageResearchFile(
    binding: OperatorBinding,
    file: AgentResearchFileTransfer,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentResearchFileReceipt>;
}
