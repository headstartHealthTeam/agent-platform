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
