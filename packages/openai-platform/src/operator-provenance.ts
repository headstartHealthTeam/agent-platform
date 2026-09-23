import type { OperatorBinding } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

const rootSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  subagent_id: z.string().nullable(),
  status: z.enum(['queued', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled']),
});

/** Strip full provider payloads page by page and retain only verified root identity/status. */
export function operatorRootPage(sessionId: string, data: unknown[]): z.infer<typeof rootSchema>[] {
  const turns = z.array(rootSchema).parse(data);
  if (turns.some((turn) => turn.session_id !== sessionId))
    throw new Error('Run provenance changed');
  return turns.filter((turn) => turn.subagent_id === null);
}

/** Shared by read-only observation and application tool delivery; no inference or tool execution. */
export function verifiedOperatorRoots(
  binding: OperatorBinding,
  session: unknown,
  turns: unknown
): {
  roots: z.infer<typeof rootSchema>[];
  root: z.infer<typeof rootSchema>;
} {
  const verified = z
    .object({ id: z.string(), metadata: z.record(z.string(), z.string()) })
    .parse(session);
  const roots = z
    .object({ data: z.array(rootSchema), has_more: z.literal(false) })
    .parse(turns)
    .data.filter((turn) => turn.subagent_id === null);
  const root = roots.at(-1);
  if (
    verified.id !== binding.sessionId ||
    verified.metadata['workflow_revision'] !== binding.workflowRevision ||
    !root ||
    roots[0]?.id !== binding.turnId ||
    roots.some((turn) => turn.session_id !== binding.sessionId) ||
    new Set(roots.map((turn) => turn.id)).size !== roots.length ||
    roots.slice(0, -1).some((turn) => !['completed', 'failed', 'cancelled'].includes(turn.status))
  )
    throw new Error('Run provenance changed');
  return { roots, root };
}
