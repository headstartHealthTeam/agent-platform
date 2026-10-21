import { createHash } from 'node:crypto';

import type {
  AgentConversationManifest,
  AgentConversationPart,
  OperatorBinding,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Target } from './config.js';
import { fingerprint } from './fingerprint.js';
import type { ReadOperation } from './operations.js';
import { OperatorProvenanceError } from './operator-provenance.js';
import type { OpenAIPlatform } from './platform.js';
import { OpenAIResourceMissingError, planAction } from './platform.js';

type Reader = Pick<OpenAIPlatform, 'read'>;
type Resource = AgentConversationPart['resource'];
type HistoryRead = Extract<
  ReadOperation,
  {
    operation:
      | 'sessions.turns'
      | 'sessions.items'
      | 'sessions.subagents'
      | 'sessions.subagent.turns'
      | 'sessions.subagent.items';
  }
>;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const sessionSchema = z.object({
  id,
  metadata: z.record(z.string(), z.string()),
  status: z.enum(['idle', 'in_progress', 'requires_action', 'failed']),
  last_active_at: z.number(),
  required_actions: z.array(z.unknown()),
});
const turnSchema = z.object({
  id,
  session_id: id,
  subagent_id: id.nullable(),
  status: z.enum(['queued', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled']),
});
const pageSchema = z.object({ data: z.array(z.unknown()).max(100), has_more: z.boolean() });

/** A stable activity marker excludes best-effort usage and ephemeral environment connectivity. */
async function sessionCheckpoint(
  platform: Reader,
  binding: OperatorBinding
): Promise<{ raw: unknown; snapshot: string }> {
  const raw = (await platform.read({ operation: 'sessions.get', id: binding.sessionId })).data;
  const session = sessionSchema.parse(raw);
  if (
    session.id !== binding.sessionId ||
    session.metadata['workflow_revision'] !== binding.workflowRevision
  )
    throw new OperatorProvenanceError();
  if (!['idle', 'failed'].includes(session.status) || session.required_actions.length)
    throw new Error('Conversation is not quiescent; archive remains incomplete');
  return { raw, snapshot: fingerprint(session) };
}

async function* pages(platform: Reader, request: HistoryRead): AsyncGenerator<unknown[]> {
  const cursors = new Set<string>();
  for (;;) {
    const page = pageSchema.parse((await platform.read(request)).data);
    yield page.data;
    if (!page.has_more) return;
    const last = z.object({ id }).safeParse(page.data.at(-1));
    if (!last.success || cursors.has(last.data.id))
      throw new Error('Archive cursor did not advance');
    cursors.add(last.data.id);
    request = { ...request, query: { ...request.query, after: last.data.id } };
  }
}

function verifyTurn(
  raw: unknown,
  binding: OperatorBinding,
  subagentId?: string
): z.infer<typeof turnSchema> {
  const turn = turnSchema.parse(raw);
  if (
    turn.session_id !== binding.sessionId ||
    (subagentId !== undefined && turn.subagent_id !== subagentId)
  )
    throw new OperatorProvenanceError();
  if (!['completed', 'failed', 'cancelled'].includes(turn.status))
    throw new Error('Conversation turn is still mutable');
  return turn;
}

class ArchiveWriter {
  private readonly hash = createHash('sha256');
  parts = 0;
  resources = 0;
  bytes = 0;
  constructor(private readonly retain: (part: AgentConversationPart) => Promise<void>) {}
  async write(
    resource: Resource,
    data: unknown[],
    subagentId: string | null = null
  ): Promise<void> {
    const part = { ordinal: this.parts, resource, subagentId, json: JSON.stringify(data) };
    await this.retain(part);
    // Await every acknowledgement. A rejected/partial sink never produces a complete manifest.
    this.hash.update(JSON.stringify(part) + '\n');
    this.parts += 1;
    this.resources += data.length;
    this.bytes += Buffer.byteLength(part.json);
  }
  digest(): string {
    return `sha256:${this.hash.digest('hex')}`;
  }
}

async function writeItems(
  platform: Reader,
  binding: OperatorBinding,
  writer: ArchiveWriter,
  turns: Set<string>,
  subagentId?: string
): Promise<void> {
  const request: HistoryRead =
    subagentId === undefined
      ? { operation: 'sessions.items', id: binding.sessionId, query: { limit: 100, order: 'asc' } }
      : {
          operation: 'sessions.subagent.items',
          id: binding.sessionId,
          subagentId,
          query: { limit: 100, order: 'asc' },
        };
  const seen = new Set<string>();
  for await (const data of pages(platform, request)) {
    for (const raw of data) {
      verifyItem(raw, turns, seen);
    }
    await writer.write(
      subagentId === undefined ? 'items' : 'subagent-items',
      data,
      subagentId ?? null
    );
  }
}

function verifyItem(raw: unknown, turns: Set<string>, seen: Set<string>): void {
  const item = z
    .object({ id: id.nullable(), turn_id: id, status: z.string().nullable().optional() })
    .parse(raw);
  if (!turns.has(item.turn_id) || (item.id !== null && seen.has(item.id)))
    throw new OperatorProvenanceError();
  if (item.status === 'in_progress' || item.status === 'queued')
    throw new Error('Conversation item is still mutable');
  if (item.id !== null) seen.add(item.id);
}

async function readTurns(
  platform: Reader,
  binding: OperatorBinding,
  writer?: ArchiveWriter,
  subagentId?: string
): Promise<ReturnType<typeof verifyTurn>[]> {
  const seen = new Set<string>();
  const inventory: ReturnType<typeof verifyTurn>[] = [];
  const request: HistoryRead =
    subagentId === undefined
      ? { operation: 'sessions.turns', id: binding.sessionId, query: { limit: 100, order: 'asc' } }
      : {
          operation: 'sessions.subagent.turns',
          id: binding.sessionId,
          subagentId,
          query: { limit: 100, order: 'asc' },
        };
  for await (const data of pages(platform, request)) {
    for (const raw of data) {
      const turn = verifyTurn(raw, binding, subagentId);
      if (seen.has(turn.id)) throw new OperatorProvenanceError();
      seen.add(turn.id);
      inventory.push(turn);
    }
    await writer?.write(
      subagentId === undefined ? 'turns' : 'subagent-turns',
      data,
      subagentId ?? null
    );
  }
  return inventory;
}

async function writeSubagents(
  platform: Reader,
  binding: OperatorBinding,
  writer: ArchiveWriter
): Promise<void> {
  const subagents = new Set<string>();
  for await (const data of pages(platform, {
    operation: 'sessions.subagents',
    id: binding.sessionId,
    query: { limit: 100, order: 'asc' },
  })) {
    await writer.write('subagents', data);
    for (const raw of data) {
      const subagent = z.object({ id, session_id: id }).parse(raw);
      if (subagent.session_id !== binding.sessionId || subagents.has(subagent.id))
        throw new OperatorProvenanceError();
      subagents.add(subagent.id);
      const turns = await readTurns(platform, binding, writer, subagent.id);
      await writeItems(
        platform,
        binding,
        writer,
        new Set(turns.map((turn) => turn.id)),
        subagent.id
      );
    }
  }
}

/** Read saved resources without interpreting, trimming, or dropping tool payloads. One page at a time. */
export async function exportConversation(
  platform: Reader,
  binding: OperatorBinding,
  retain: (part: AgentConversationPart) => Promise<void>
): Promise<AgentConversationManifest> {
  const initial = await sessionCheckpoint(platform, binding);
  const writer = new ArchiveWriter(retain);
  await writer.write('session', [initial.raw]);
  const inventory = await readTurns(platform, binding, writer);
  const roots = new Set(
    inventory.filter((turn) => turn.subagent_id === null).map((turn) => turn.id)
  );
  if ([...roots][0] !== binding.turnId) throw new OperatorProvenanceError();
  await writeItems(platform, binding, writer, roots);
  await writeSubagents(platform, binding, writer);
  const finalInventory = await readTurns(platform, binding);
  if (fingerprint(finalInventory) !== fingerprint(inventory))
    throw new Error('Conversation turns changed during export; archive remains incomplete');
  if ((await sessionCheckpoint(platform, binding)).snapshot !== initial.snapshot)
    throw new Error('Conversation changed during export; archive remains incomplete');
  return {
    schema: 'headstart-agent-conversation/v1',
    provider: 'openai-agents',
    sdkVersion: '7.21.0',
    binding: { ...binding },
    snapshot: initial.snapshot,
    digest: writer.digest(),
    parts: writer.parts,
    resources: writer.resources,
    bytes: writer.bytes,
    limitations: [
      'Saved API resources only; private reasoning and missed intermediate stream events are not available.',
      'Provider-reported unavailable content, placeholders and incomplete outputs are preserved as returned, not reconstructed.',
      'Binary documents/artifacts require their separate verified evidence retention; references in history are not file bytes.',
      'Usage is best effort and can change after export. A complete export is not business closure or deletion authority.',
      'The provider has no atomic archive-and-delete operation. The owner must serialize all session writers during cleanup.',
    ],
  };
}

/** Caller must hold its application input/closure serialization through this bounded dispatch. */
export async function deleteConversation(
  platform: Pick<OpenAIPlatform, 'read' | 'apply'>,
  target: Target,
  archive: AgentConversationManifest,
  beforeDispatch: () => Promise<void>
): Promise<{ status: 'deleted' | 'absent' }> {
  const binding = archive.binding;
  if (
    !z
      .object({
        schema: z.literal('headstart-agent-conversation/v1'),
        provider: z.literal('openai-agents'),
      })
      .safeParse(archive).success ||
    !/^[a-f0-9]{64}$/.test(archive.snapshot) ||
    !/^sha256:[a-f0-9]{64}$/.test(archive.digest)
  )
    throw new Error('Invalid archive proof');
  // Only an absent session, not a missing child/page, can reconcile a prior unknown deletion.
  try {
    await sessionCheckpoint(platform, binding);
  } catch (error) {
    if (error instanceof OpenAIResourceMissingError) return { status: 'absent' };
    throw error;
  }
  const current = await exportConversation(platform, binding, () => Promise.resolve());
  if (
    current.snapshot !== archive.snapshot ||
    current.digest !== archive.digest ||
    current.parts !== archive.parts ||
    current.resources !== archive.resources ||
    current.bytes !== archive.bytes
  )
    throw new Error('Conversation changed since archival');
  const action = { operation: 'sessions.delete' as const, id: binding.sessionId };
  const result = await platform.apply(
    action,
    { apply: true, digest: planAction(target, action).digest, allowBillable: false },
    { beforeDispatch }
  );
  const receipt = z.object({ id, deleted: z.literal(true) }).parse(result.data);
  if (receipt.id !== binding.sessionId) throw new Error('Deletion result has the wrong identity');
  return { status: 'deleted' };
}
