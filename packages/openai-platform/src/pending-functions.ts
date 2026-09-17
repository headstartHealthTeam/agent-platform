import { z } from 'zod';

import { fingerprint } from './fingerprint.js';

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const expectedSchema = z.object({ sessionId: id, turnId: id }).strict();
const functionCall = z.object({
  type: z.literal('function_call'),
  turn_id: id,
  call_id: id,
  name: id,
  arguments: z.record(z.string(), z.json()),
});
const sessionSchema = z.object({
  id,
  required_actions: z.array(z.unknown()).max(100),
});

export interface PendingFunctionCall {
  sessionId: string;
  turnId: string;
  callId: string;
  name: string;
  /** Untrusted, possibly sensitive content. Validate against the application's tool schema. */
  arguments: z.infer<typeof functionCall>['arguments'];
  fingerprint: string;
}

/** Reads pending work, never history. It neither executes tools nor grants business authority. */
export function pendingFunctionCalls(
  input: unknown,
  expected: { sessionId: string; turnId: string }
): PendingFunctionCall[] {
  try {
    const target = expectedSchema.parse(expected);
    const session = sessionSchema.parse(input);
    if (session.id !== target.sessionId) throw new Error('Unexpected session.');
    const seen = new Set<string>();
    const calls: PendingFunctionCall[] = [];
    for (const raw of session.required_actions) {
      const kind = z.object({ type: z.string() }).parse(raw);
      // An environment connection request is not an application function to dispatch.
      if (kind.type === 'environment_connection') continue;
      const call = functionCall.parse(raw);
      const identity = `${call.turn_id}/${call.call_id}`;
      if (seen.has(identity)) throw new Error('Duplicate pending function.');
      seen.add(identity);
      if (call.turn_id !== target.turnId) continue;
      const projected = {
        sessionId: session.id,
        turnId: call.turn_id,
        callId: call.call_id,
        name: call.name,
        arguments: call.arguments,
      };
      if (JSON.stringify(projected).length > 100_000) throw new Error('Oversized function.');
      calls.push({ ...projected, fingerprint: fingerprint(projected) });
    }
    return calls;
  } catch {
    throw new Error('Invalid pending function state; recover the session before replying.');
  }
}
