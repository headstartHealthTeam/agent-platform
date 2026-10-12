import { createHash } from 'node:crypto';

import type {
  AgentResearchFileReceipt,
  AgentResearchFileTransfer,
} from '@headstart-health/workflow-contracts';
import type OpenAI from 'openai';
import { toFile } from 'openai';
import { z } from 'zod';

export class ResearchFileTransferUnknownError extends Error {
  readonly code = 'research-transfer-unknown';
  constructor(readonly uploadedFileIds: string[]) {
    super('Public research file transfer unconfirmed; do not resend or overwrite');
  }
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
  if (
    !(file.bytes instanceof Uint8Array) ||
    !file.bytes.length ||
    file.bytes.length > 10 * 1024 * 1024 ||
    `sha256:${createHash('sha256').update(file.bytes).digest('hex')}` !== file.digest
  )
    throw new Error('Public research original identity invalid');
  const options = { maxRetries: 0, signal: AbortSignal.timeout(60_000) };
  const upload =
    file.bytes.length > 5 * 1024 * 1024
      ? await toFile(file.bytes, 'public-original', { type: 'application/octet-stream' })
      : undefined;
  await beforeDispatch();
  let uploadedFileId: string | undefined;
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
          .array(z.object({ id: z.string().regex(/^file-[A-Za-z0-9_-]{1,200}$/) }))
          .max(1),
      })
      .safeParse(error);
    throw new ResearchFileTransferUnknownError(
      uploadedFileId
        ? [uploadedFileId]
        : parsed.success
          ? parsed.data.uploadedFiles.map((file) => file.id)
          : []
    );
  }
}
