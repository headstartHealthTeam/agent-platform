import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const sessionStatus = z.enum(['idle', 'in_progress', 'requires_action', 'failed']);
const environmentStatus = z.enum(['pending', 'ready', 'connected', 'disconnected', 'failed']);
const turnStatus = z.enum(['queued', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled']);
const envelope = z.object({ type: z.string(), event_id: id });
const sessionEvent = envelope.extend({ session: z.object({ id, status: sessionStatus }) });
const environmentEvent = envelope.extend({
  session_id: id,
  turn_id: id.nullable(),
  environment: z.object({ id, status: environmentStatus }),
});
const turnEvent = envelope.extend({
  session_id: id,
  turn_id: id,
  turn: z.object({ id, session_id: id, subagent_id: id.nullable(), status: turnStatus }),
});
const errorEvent = envelope.extend({ session_id: id });

export const observationRequestSchema = z.object({ sessionId: id }).strict();

interface Identity {
  eventId: string;
  sessionId: string;
}
/** Metadata only. These observations are not business approval or action authority. */
export type SessionControlEvent = Identity &
  (
    | { kind: 'session'; status: z.infer<typeof sessionStatus> }
    | {
        kind: 'environment';
        environmentId: string;
        turnId: string | null;
        status: z.infer<typeof environmentStatus>;
      }
    | {
        kind: 'turn';
        turnId: string;
        subagentId: string | null;
        status: z.infer<typeof turnStatus>;
      }
    | { kind: 'provider-error' }
  );

export interface SessionObservation {
  /** Single consumer; open before submitting input. Ending this iterable is not run completion. */
  events: AsyncIterable<SessionControlEvent>;
  /** Closes only this observation connection. It never submits a session cancellation. */
  close: () => void;
}

const sessionTypes = new Set([
  'agent.session.created',
  'agent.session.idle',
  'agent.session.in_progress',
  'agent.session.requires_action',
  'agent.session.failed',
]);
const environmentTypes = new Set(
  environmentStatus.options.map((status) => `agent.session.environment.${status}`)
);
const turnTypes = new Set([
  'agent.session.turn.created',
  'agent.session.turn.in_progress',
  'agent.session.turn.completed',
  'agent.session.turn.failed',
  'agent.session.turn.cancelled',
]);

function project(input: unknown): SessionControlEvent | null {
  const event = envelope.parse(input);
  if (sessionTypes.has(event.type)) {
    const { event_id, session } = sessionEvent.parse(input);
    return { kind: 'session', eventId: event_id, sessionId: session.id, status: session.status };
  }
  if (environmentTypes.has(event.type)) {
    const { event_id, session_id, turn_id, environment } = environmentEvent.parse(input);
    return {
      kind: 'environment',
      eventId: event_id,
      sessionId: session_id,
      environmentId: environment.id,
      turnId: turn_id,
      status: environment.status,
    };
  }
  if (turnTypes.has(event.type)) {
    const { event_id, session_id, turn_id, turn } = turnEvent.parse(input);
    if (turn.id !== turn_id || turn.session_id !== session_id) {
      throw new Error('Mismatched turn identity.');
    }
    return {
      kind: 'turn',
      eventId: event_id,
      sessionId: session_id,
      turnId: turn_id,
      subagentId: turn.subagent_id,
      status: turn.status,
    };
  }
  if (event.type === 'error') {
    const { event_id, session_id } = errorEvent.parse(input);
    return { kind: 'provider-error', eventId: event_id, sessionId: session_id };
  }
  // Content, reasoning, tool arguments/results and future event types are not an operator feed.
  return null;
}

/** Allowlist before leaving the provider boundary; never spread provider payloads. */
export function projectSessionControlEvent(
  input: unknown,
  expectedSessionId: string
): SessionControlEvent | null {
  try {
    const event = project(input);
    if (event !== null && event.sessionId !== expectedSessionId) {
      throw new Error('Mismatched session identity.');
    }
    return event;
  } catch {
    throw new Error('Invalid session observation; recover authoritative session and turn state.');
  }
}

/** A root turn ending is not evidence of successful tools, saved payer changes or business success. */
export function observedRootTurnOutcome(
  event: SessionControlEvent,
  expected: { sessionId: string; turnId: string }
): 'completed' | 'failed' | 'cancelled' | null {
  if (
    event.kind === 'turn' &&
    event.sessionId === expected.sessionId &&
    event.turnId === expected.turnId &&
    event.subagentId === null &&
    (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled')
  ) {
    return event.status;
  }
  return null;
}
