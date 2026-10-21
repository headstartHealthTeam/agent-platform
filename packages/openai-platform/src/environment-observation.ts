import type { AgentEnvironmentSnapshot } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { OpenAIPlatform } from './platform.js';

/** Caller has already verified the owning session's target and immutable launch metadata. */
export async function observeEnvironment(
  platform: Pick<OpenAIPlatform, 'read'>,
  ownedSession: unknown
): Promise<AgentEnvironmentSnapshot> {
  try {
    const reference = z
      .object({
        environment: z.discriminatedUnion('type', [
          z.object({ type: z.literal('none') }),
          z.object({
            type: z.enum(['openai_hosted', 'self_hosted']),
            id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
          }),
        ]),
      })
      .parse(ownedSession).environment;
    if (reference.type === 'none') return { type: 'none' };
    const response = await platform.read({ operation: 'environments.get', id: reference.id });
    const state = z
      .object({
        object: z.literal('agent.environment'),
        id: z.literal(reference.id),
        type: z.literal(reference.type),
        status: z.enum([
          'pending',
          'ready',
          'connected',
          'disconnected',
          'suspended',
          'expired',
          'failed',
        ]),
      })
      .parse(response.data);
    return { type: state.type, environmentId: state.id, status: state.status };
  } catch {
    throw new Error('Environment state is unconfirmed; retain the existing execution');
  }
}
