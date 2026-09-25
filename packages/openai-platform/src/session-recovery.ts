import type {
  AgentLaunchCandidatePage,
  AgentLaunchCandidateResult,
  AgentLaunchIdentity,
  AgentSessionCandidate,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Target } from './config.js';
import { fingerprint, OpenAIResourceMissingError, type OpenAIPlatform } from './platform.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const sessionSchema = z.object({
  id,
  created_at: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  metadata: z.record(z.string(), z.string()).nullable(),
});
const correlationSchema = z.object({ launch_request: z.uuid(), workflow_revision: id });
type Session = z.infer<typeof sessionSchema>;
type Platform = Pick<OpenAIPlatform, 'read'>;

function candidate(session: Session, target: string): AgentSessionCandidate | null {
  const metadata = correlationSchema.safeParse(session.metadata);
  if (!metadata.success) return null;
  return {
    sessionId: session.id,
    createdAt: session.created_at,
    target,
    requestId: metadata.data.launch_request,
    workflowRevision: metadata.data.workflow_revision,
  };
}

function checkTarget(target: Target, expectedTarget: string): void {
  if (expectedTarget !== fingerprint(target)) throw new Error('Wrong runtime target');
}
function candidateReadFailure(error: unknown): AgentLaunchCandidateResult {
  if (error instanceof OpenAIResourceMissingError) return { status: 'missing' };
  // Retain neither provider payload nor schema error data (which can include resource content).
  throw new Error('Launch candidate inspection failed; ownership remains unconfirmed.');
}

/** Provider metadata is mutable correlation evidence, never an idempotency guarantee. */
export async function inspectLaunchCandidate(
  platform: Platform,
  target: Target,
  expectedTarget: string,
  sessionId: string
): Promise<AgentLaunchCandidateResult> {
  checkTarget(target, expectedTarget);
  id.parse(sessionId);
  try {
    const result = await platform.read({ operation: 'sessions.get', id: sessionId });
    const session = sessionSchema.parse(result.data);
    if (session.id !== sessionId) throw new Error('Wrong session');
    const match = candidate(session, expectedTarget);
    return match ? { status: 'candidate', candidate: match } : { status: 'unrelated' };
  } catch (error) {
    return candidateReadFailure(error);
  }
}

/** One bounded page per call. An empty/completed pass never authorizes another creation. */
export async function discoverLaunchCandidates(
  platform: Platform,
  target: Target,
  identity: AgentLaunchIdentity,
  after?: string
): Promise<AgentLaunchCandidatePage> {
  checkTarget(target, identity.target);
  z.uuid().parse(identity.requestId);
  id.parse(identity.workflowRevision);
  if (after !== undefined) id.parse(after);
  try {
    const result = await platform.read({
      operation: 'sessions.list',
      query: { limit: 100, order: 'desc', ...(after === undefined ? {} : { after }) },
    });
    const page = z
      .object({
        data: z.array(sessionSchema).max(100),
        has_more: z.boolean(),
        last_id: id.nullable(),
      })
      .parse(result.data);
    const lastId = page.data.at(-1)?.id ?? null;
    if (
      page.last_id !== lastId ||
      new Set(page.data.map((item) => item.id)).size !== page.data.length ||
      (after !== undefined && page.data.some((item) => item.id === after)) ||
      (page.has_more && lastId === null)
    )
      throw new Error('Nonadvancing page');
    const candidates = page.data.flatMap((session) => {
      const match = candidate(session, identity.target);
      return match?.requestId === identity.requestId &&
        match.workflowRevision === identity.workflowRevision
        ? [match]
        : [];
    });
    return { candidates, nextAfter: page.has_more ? lastId : null };
  } catch {
    throw new Error('Launch discovery failed; the scan cursor must not advance.');
  }
}
