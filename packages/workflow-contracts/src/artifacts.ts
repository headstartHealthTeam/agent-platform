import type { OperatorBinding } from './operator.js';

/** Stable error discriminator across a packaged adapter boundary. No raw provider payload. */
export type AgentArtifactFailureCode = 'artifact-capacity' | 'artifact-identity';

/** The requesting application owns the byte limit and retained evidence manifest. */
export interface AgentArtifactRequest {
  turnId: string;
  path: string;
  maxBytes: number;
}
export interface AgentArtifact {
  id: string;
  turnId: string;
  path: string;
  bytes: Uint8Array;
}
/** Read-only immutable provider output, never a source URL or live sandbox filesystem API. */
export interface AgentArtifactPort {
  artifactTurnStatus(
    binding: OperatorBinding,
    turnId: string
  ): Promise<'pending' | 'completed' | 'failed' | 'cancelled'>;
  readArtifact(binding: OperatorBinding, request: AgentArtifactRequest): Promise<AgentArtifact>;
}

/** Application-owned originals staged into an existing authorized workspace. Uploading does not
 * send a message, start a turn or establish that the agent inspected the document. */
export interface AgentWorkspaceFile {
  path: string;
  digest: string;
  bytes: Uint8Array;
}
export interface AgentWorkspaceFileReceipt {
  environmentId: string;
  path: string;
  digest: string;
  size: number;
  uploadedFileId?: string;
}
export interface AgentWorkspaceFilesPort {
  stageWorkspaceFile(
    binding: OperatorBinding,
    file: AgentWorkspaceFile,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentWorkspaceFileReceipt>;
}
