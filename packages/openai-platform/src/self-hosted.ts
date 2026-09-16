import { z } from 'zod';

const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const sessionSchema = z.object({
  id: identifier,
  environment: z.object({
    type: z.literal('self_hosted'),
    id: identifier,
    remote_url: z.url().pipe(
      z.string().refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'wss:' &&
          url.hostname === 'codex-cloud-environments.chatgpt.com' &&
          url.port === '' &&
          url.username === '' &&
          url.password === '' &&
          url.hash === ''
        );
      })
    ),
  }),
});

export interface ExecutorConnection {
  sessionId: string;
  environmentId: string;
  /** Protected provisioning data. Do not persist in the operator activity feed. */
  arguments: readonly string[];
}

/** Parse a retrieved session, not model output. This does not provision or start an executor. */
export function selfHostedExecutorConnection(
  session: unknown,
  expectedSessionId: string
): ExecutorConnection {
  const parsed = sessionSchema.safeParse(session);
  if (!parsed.success || parsed.data.id !== expectedSessionId) {
    throw new Error('Invalid self-hosted connection or unexpected session; no executor launched.');
  }
  return {
    sessionId: parsed.data.id,
    environmentId: parsed.data.environment.id,
    // Preserve the provider URL byte-for-byte, including query parameters on reconnect.
    arguments: [
      'exec-server',
      '--remote',
      parsed.data.environment.remote_url,
      '--environment-id',
      parsed.data.environment.id,
    ],
  };
}
