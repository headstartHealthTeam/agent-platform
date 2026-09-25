import type { AgentArtifact, AgentArtifactRequest } from '@headstart-health/workflow-contracts';
import type OpenAI from 'openai';
import { z } from 'zod';

import { readHostedArtifactBody } from './hosted-artifact-body.js';
import { HostedArtifactError } from './hosted-artifact-error.js';

const identityFailure = 'artifact-identity';
function checkedArtifact(
  artifact: { id: string; size_bytes: number },
  maxBytes: number
): { id: string; size: number } {
  if (!artifact.id || !Number.isSafeInteger(artifact.size_bytes) || artifact.size_bytes < 1)
    throw new HostedArtifactError(identityFailure);
  if (artifact.size_bytes > maxBytes) throw new HostedArtifactError('artifact-capacity');
  return { id: artifact.id, size: artifact.size_bytes };
}
function sanitizedFailure(error: unknown): Error {
  // SDK causes may contain headers or source data; only our stable typed errors cross the boundary.
  return error instanceof HostedArtifactError
    ? error
    : new Error('Hosted artifact unavailable; retry without changing the request.');
}

const requestSchema = z
  .object({
    turnId: z.string().min(1).max(200),
    path: z
      .string()
      .max(1024)
      .refine(
        (path) =>
          path.startsWith('/workspace/outputs/') &&
          !/[\\\p{Cc}]/u.test(path) &&
          path
            .slice('/workspace/outputs/'.length)
            .split('/')
            .every((part) => part.length > 0 && part !== '.' && part !== '..')
      ),
    maxBytes: z
      .number()
      .int()
      .positive()
      .max(200 * 1024 * 1024),
  })
  .strict();

/** Uses the native SDK. The caller first verifies workflow/session/ended-root provenance. */
export async function downloadHostedArtifact(
  client: OpenAI,
  sessionId: string,
  input: AgentArtifactRequest
): Promise<AgentArtifact> {
  try {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) throw new HostedArtifactError(identityFailure);
    const request = parsed.data;
    const signal = AbortSignal.timeout(60_000);
    let match: { id: string; size: number } | undefined;
    let count = 0;
    for await (const artifact of client.beta.agents.sessions.artifacts.list(
      sessionId,
      { limit: 100, order: 'asc' },
      { signal }
    )) {
      if (++count > 10_000) throw new HostedArtifactError('artifact-capacity');
      if (artifact.session_id !== sessionId) throw new HostedArtifactError(identityFailure);
      if (artifact.turn_id !== request.turnId || artifact.path !== request.path) continue;
      if (match) throw new HostedArtifactError(identityFailure);
      match = checkedArtifact(artifact, request.maxBytes);
    }
    // The caller proved this root completed. Its published outputs are immutable; a successful
    // complete listing without this path needs a corrected request, not endless retries.
    if (!match) throw new HostedArtifactError(identityFailure);
    const response = await client.beta.agents.sessions.artifacts.content(
      match.id,
      { session_id: sessionId },
      { signal }
    );
    const bytes = await readHostedArtifactBody(response, match.size, request.maxBytes, signal);
    return { id: match.id, turnId: request.turnId, path: request.path, bytes };
  } catch (error) {
    throw sanitizedFailure(error);
  }
}
