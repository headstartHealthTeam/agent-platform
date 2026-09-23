import type { OperatorBinding } from '@headstart-health/workflow-contracts';

import { verifiedOperatorRoots } from './operator-provenance.js';
import type { OpenAIPlatform } from './platform.js';
import { fingerprint } from './platform.js';
import { sessionHistory } from './session-history.js';

type Roots = ReturnType<typeof verifiedOperatorRoots>;

/** Reuse verified immutable terminal roots; refresh the mutable tail on every observation.
 * This is an ephemeral read optimization, never a durable checkpoint or command authority.
 */
export class OperatorTurns {
  private readonly sessions = new Map<string, { identity: string; roots: Roots['roots'] }>();

  async read(
    platform: Pick<OpenAIPlatform, 'read'>,
    binding: OperatorBinding
  ): Promise<{
    session: unknown;
    roots: Roots['roots'];
    root: Roots['root'];
  }> {
    const identity = fingerprint(binding);
    const previous = this.sessions.get(binding.sessionId);
    if (previous && previous.identity !== identity) throw new Error('Observation binding changed');
    const prefix = previous?.roots ?? [];
    const [session, tail] = await Promise.all([
      platform.read({ operation: 'sessions.get', id: binding.sessionId }),
      sessionHistory(platform, binding.sessionId, 'sessions.turns', prefix.at(-1)?.id),
    ]);
    const verified = verifiedOperatorRoots(binding, session.data, {
      data: [...prefix, ...tail.data],
      has_more: false,
    });
    const roots = verified.roots.filter((turn) =>
      ['completed', 'failed', 'cancelled'].includes(turn.status)
    );
    // A slower concurrent read must not replace a more advanced terminal checkpoint.
    if (roots.length >= (this.sessions.get(binding.sessionId)?.roots.length ?? 0)) {
      this.sessions.delete(binding.sessionId);
      this.sessions.set(binding.sessionId, { identity, roots });
    }
    if (this.sessions.size > 20) {
      const oldest = this.sessions.keys().next().value;
      if (oldest) this.sessions.delete(oldest);
    }
    return { session: session.data, ...verified };
  }
  clear(): void {
    this.sessions.clear();
  }
}
