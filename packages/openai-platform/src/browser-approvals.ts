import type { AgentBrowserRequest } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { fingerprint } from './fingerprint.js';

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const reason = z.string().max(10_000).nullable();
export const browserApprovalRequest = z.object({
  type: z.literal('computer_use_approval_request'),
  request_id: id,
  turn_id: id,
  request: z.discriminatedUnion('type', [
    z.object({ type: z.literal('browser_origin_access'), origin: z.url().max(2048), reason }),
    z.object({
      type: z.literal('browser_authentication'),
      credential_origin: z.url().max(2048).nullable(),
      reason,
    }),
  ]),
});
const sessionSchema = z.object({ id, required_actions: z.array(z.unknown()).max(100) });
const expectedSchema = z.object({ sessionId: id, turnId: id }).strict();

export type PendingBrowserApproval = AgentBrowserRequest;

/** Origin approvals have no history items: only current required_actions establishes pending work. */
export function pendingBrowserApprovals(
  input: unknown,
  expected: { sessionId: string; turnId: string }
): PendingBrowserApproval[] {
  try {
    const target = expectedSchema.parse(expected);
    const session = sessionSchema.parse(input);
    if (session.id !== target.sessionId) throw new Error('Unexpected session');
    const seen = new Set<string>();
    const pending: PendingBrowserApproval[] = [];
    for (const raw of session.required_actions) {
      const kind = z.object({ type: z.string() }).parse(raw);
      if (kind.type === 'function_call' || kind.type === 'environment_connection') continue;
      const approval = browserApprovalRequest.parse(raw);
      if (seen.has(approval.request_id)) throw new Error('Duplicate browser approval');
      seen.add(approval.request_id);
      if (approval.turn_id !== target.turnId) continue;
      const projected = {
        ...target,
        requestId: approval.request_id,
        request: approval.request,
      };
      pending.push({ ...projected, fingerprint: fingerprint(projected) });
    }
    return pending;
  } catch {
    throw new Error('Invalid pending browser state; recover the session before replying.');
  }
}
