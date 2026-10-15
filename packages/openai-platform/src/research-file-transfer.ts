import { createHash } from 'node:crypto';

import {
  agentResearchTransferDiagnostic,
  publicResearchManifestLimits,
  type AgentResearchFileReceipt,
  type AgentResearchFileTransfer,
  type AgentResearchTransferDiagnostic,
} from '@headstart-health/workflow-contracts';
import OpenAI, { toFile } from 'openai';
import { AgentFileUploadError } from 'openai/lib/beta/agents/files';
import { z } from 'zod';

export class ResearchFileTransferUnknownError extends Error {
  readonly code = 'research-transfer-unknown';
  constructor(
    readonly uploadedFileIds: string[],
    readonly diagnostic: AgentResearchTransferDiagnostic
  ) {
    super('Public research file transfer unconfirmed; do not resend or overwrite');
  }
}

function transferFailureKind(error: unknown): AgentResearchTransferDiagnostic['kind'] {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof OpenAI.APIUserAbortError) return 'aborted';
  if (error instanceof OpenAI.APIConnectionError) return 'connection';
  if (error instanceof OpenAI.APIError) return 'http';
  return 'unclassified';
}

function transferFailurePhase(
  error: unknown,
  transport: AgentResearchTransferDiagnostic['transport']
): AgentResearchTransferDiagnostic['phase'] {
  if (transport === 'inline') return 'environment-create';
  if (error instanceof AgentFileUploadError)
    return error.uploadedFiles.length > 0 ? 'environment-create' : 'files-upload';
  return 'unclassified';
}

function transferDiagnostic(
  error: unknown,
  transport: AgentResearchTransferDiagnostic['transport'],
  receiptReceived: boolean,
  timedOut: boolean
): AgentResearchTransferDiagnostic {
  const wrapped = error instanceof AgentFileUploadError;
  const cause = wrapped ? error.cause : error;
  const diagnostic: AgentResearchTransferDiagnostic = {
    operation: 'environment-file-transfer',
    phase: receiptReceived ? 'receipt-validation' : transferFailurePhase(error, transport),
    transport,
    kind: receiptReceived ? 'invalid-receipt' : timedOut ? 'timeout' : transferFailureKind(cause),
  };
  const code: unknown = cause instanceof OpenAI.APIError ? cause.code : undefined;
  const status: unknown = cause instanceof OpenAI.APIError ? cause.status : undefined;
  return (
    agentResearchTransferDiagnostic({
      ...diagnostic,
      ...(cause instanceof OpenAI.APIError ? { status, code } : {}),
    }) ?? diagnostic
  );
}

/** SDK-owned environment Files transport. No shell, external URL fetch, or secret propagation.
 * A failed upload may have succeeded. The owner must preserve its pre-dispatch marker; neither
 * this adapter nor the SDK retries it, and file listing/size alone is not a digest readback.
 */
export async function transferResearchFile(
  client: OpenAI,
  environmentId: string,
  file: AgentResearchFileTransfer,
  beforeDispatch: () => Promise<void>
): Promise<AgentResearchFileReceipt> {
  z.string()
    .regex(/^\/workspace\/public-research\/[a-f0-9]{64}\/[0-9]+-[a-f0-9]{64}$/)
    .parse(file.path);
  return transferFile(
    client,
    environmentId,
    file,
    beforeDispatch,
    publicResearchManifestLimits.originalBytes
  );
}

/** Same SDK transport, separate application-owned namespace; callers retain case authorization. */
export async function transferWorkspaceFile(
  client: OpenAI,
  environmentId: string,
  file: AgentResearchFileTransfer,
  beforeDispatch: () => Promise<void>
): Promise<AgentResearchFileReceipt> {
  z.string()
    .regex(
      /^\/workspace\/operator-files\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}$/
    )
    .parse(file.path);
  return transferFile(client, environmentId, file, beforeDispatch, 10 * 1024 * 1024);
}

async function transferFile(
  client: OpenAI,
  environmentId: string,
  input: AgentResearchFileTransfer,
  beforeDispatch: () => Promise<void>,
  maximumBytes: number
): Promise<AgentResearchFileReceipt> {
  if (
    !(input.bytes instanceof Uint8Array) ||
    !input.bytes.length ||
    input.bytes.length > maximumBytes
  )
    throw new Error('Public research original identity invalid');
  // Own the exact bytes and metadata across SDK conversion and the durable dispatch callback.
  const file = { ...input, bytes: new Uint8Array(input.bytes) };
  if (`sha256:${createHash('sha256').update(file.bytes).digest('hex')}` !== file.digest)
    throw new Error('Public research original identity invalid');
  const options = { maxRetries: 0, signal: AbortSignal.timeout(60_000) };
  const upload =
    file.bytes.length > 5 * 1024 * 1024
      ? await toFile(file.bytes, 'public-original', { type: 'application/octet-stream' })
      : undefined;
  await beforeDispatch();
  let uploadedFileId: string | undefined;
  let receiptReceived = false;
  try {
    const uploaded = upload
      ? await client.beta.agents.environments.files.upload(
          environmentId,
          { file: upload, path: file.path },
          options
        )
      : undefined;
    uploadedFileId = uploaded?.uploadedFile.id;
    const receipt = uploaded
      ? uploaded.environmentFile
      : await client.beta.agents.environments.files.create(
          environmentId,
          { type: 'inline', path: file.path, data: Buffer.from(file.bytes).toString('base64') },
          options
        );
    receiptReceived = true;
    if (
      receipt.environment_id !== environmentId ||
      receipt.path !== file.path ||
      receipt.size_bytes !== file.bytes.length
    )
      throw new Error('Invalid environment file receipt');
    return {
      environmentId,
      path: file.path,
      digest: file.digest,
      size: file.bytes.length,
      ...(uploadedFileId ? { uploadedFileId } : {}),
    };
  } catch (error) {
    const parsed = z
      .object({
        uploadedFiles: z
          .array(z.object({ id: z.string().regex(/^file[-_][A-Za-z0-9_-]{1,200}$/) }))
          .max(1),
      })
      .safeParse(error);
    throw new ResearchFileTransferUnknownError(
      uploadedFileId
        ? [uploadedFileId]
        : parsed.success
          ? parsed.data.uploadedFiles.map((file) => file.id)
          : [],
      transferDiagnostic(
        error,
        upload ? 'file-id' : 'inline',
        receiptReceived,
        options.signal.aborted
      )
    );
  }
}
