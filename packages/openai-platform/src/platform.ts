import { verifyCapabilityPreflight } from '@headstart-health/capability-runtime';
import OpenAI from 'openai';

import {
  ADAPTER_VERSION,
  CAPABILITY,
  PROVIDER,
  requirement,
  type ResolvedConfig,
  type Target,
} from './config.js';
import { fingerprint } from './fingerprint.js';
import {
  observationRequestSchema,
  projectSessionControlEvent,
  type SessionControlEvent,
  type SessionObservation,
} from './observation.js';
import {
  isBillable,
  parseAction,
  readSchema,
  type Action,
  type ReadOperation,
} from './operations.js';
import { OperatorItems } from './operator-items.js';
import { pendingFunctionCalls } from './pending-functions.js';

export { fingerprint } from './fingerprint.js';
export interface ActionPlan {
  operation: Action['operation'];
  target: Target;
  digest: string;
  billable: boolean;
  destructive: boolean;
}
export function planAction(target: Target, input: unknown): ActionPlan {
  const action = parseAction(input);
  return {
    operation: action.operation,
    target,
    digest: fingerprint({ target, action }),
    billable: isBillable(action),
    destructive: action.operation.endsWith('.delete'),
  };
}
export interface Approval {
  apply: boolean;
  digest: string;
  allowBillable: boolean;
}
export interface PlatformResult {
  data: unknown;
  fingerprint: string;
}
export interface DispatchOptions {
  /** Durable application dispatch journal, after every provider read and before mutation. */
  beforeDispatch?: () => Promise<void>;
}
export class OpenAIResourceMissingError extends Error {
  constructor() {
    super('OpenAI read failed; the requested resource was not found.');
  }
}
export class MutationOutcomeUnknownError extends Error {
  readonly providerRequestId?: string;
  constructor(error: unknown) {
    super(
      'Mutation failed or outcome is unknown. Reconcile the resource before retrying; no automatic retry was attempted.'
    );
    if (
      error instanceof OpenAI.APIError &&
      typeof error.requestID === 'string' &&
      /^[A-Za-z0-9_-]{1,200}$/.test(error.requestID)
    )
      this.providerRequestId = error.requestID;
  }
}
function sanitizedReadError(error: unknown): Error {
  // Do not attach an SDK error/cause: provider responses may contain credentials or source data.
  return error instanceof OpenAI.APIError && error.status === 404
    ? new OpenAIResourceMissingError()
    : new Error('OpenAI read failed; no provider payload was emitted.');
}
/** Sanitized, definitive provider refusal; unlike an uncertain network/write failure. */
export class InputNotSteerableError extends Error {
  constructor() {
    super('The active turn cannot accept a message. No input was accepted.');
  }
}
function sanitizedMutationError(action: Action, error: unknown): Error {
  if (
    action.operation === 'sessions.send' &&
    error instanceof OpenAI.APIError &&
    (error.status === 400 || error.status === 409) &&
    error.code === 'active_turn_not_steerable'
  )
    return new InputNotSteerableError();
  // Never retain SDK errors as causes: they may carry request, response or credential content.
  return new MutationOutcomeUnknownError(error);
}

// Never return or serialize an SDK Page: it contains transport state, not just API data.
function pageData(page: { data: { id: string | null }[]; has_more: boolean }): unknown {
  return { data: page.data, has_more: page.has_more, last_id: page.data.at(-1)?.id ?? null };
}

/** Supervising caller owns human approval; managed workflows need a separate approval executor. */
export class OpenAIPlatform {
  readonly #client: OpenAI;
  readonly #config: ResolvedConfig;

  public constructor(config: ResolvedConfig, apiKey: string, fetchImplementation?: typeof fetch) {
    this.#config = config;
    this.#client = new OpenAI({
      apiKey,
      organization: config.target.organizationId,
      project: config.target.projectId,
      baseURL: 'https://api.openai.com/v1',
      timeout: 30_000,
      maxRetries: 0,
      logLevel: 'off',
      fetchOptions: { redirect: 'error' },
      ...(fetchImplementation === undefined ? {} : { fetch: fetchImplementation }),
    });
  }

  public async preflight(signal?: AbortSignal): Promise<{ projectId: string; agentsRead: true }> {
    try {
      const { response } = await this.#client.beta.agents
        .list({ limit: 1 }, signal === undefined ? {} : { signal })
        .withResponse();
      const projectId = response.headers.get('openai-project');
      verifyCapabilityPreflight(
        {
          ...requirement,
          targetAssertions: [{ key: 'projectId', expected: this.#config.target.projectId }],
        },
        this.#config.binding,
        {
          capabilityId: CAPABILITY,
          providerId: PROVIDER,
          adapterVersion: ADAPTER_VERSION,
          status: projectId === this.#config.target.projectId ? 'ready' : 'wrong-target',
          permissions: ['api.agents.read'],
          targetIdentity: { projectId: projectId ?? '' },
          message: 'Bounded Agents API read with explicit organization and project headers.',
        }
      );
      return { projectId: this.#config.target.projectId, agentsRead: true };
    } catch {
      throw new Error(
        'OpenAI preflight failed: verify credential, Agents access, and exact project.'
      );
    }
  }

  /** Opens the real, non-replaying SDK stream; caller owns lifetime, recovery and persistence. */
  public async openSessionObservation(
    input: unknown,
    signal: AbortSignal
  ): Promise<SessionObservation> {
    const parsed = observationRequestSchema.safeParse(input);
    if (!parsed.success || signal.aborted) {
      throw new Error('Invalid or aborted session observation request.');
    }
    const { sessionId } = parsed.data;
    await this.preflight(signal);
    try {
      const stream = await this.#client.beta.agents.sessions.events.stream(sessionId, { signal });
      async function* events(): AsyncGenerator<SessionControlEvent> {
        try {
          for await (const raw of stream) {
            const event = projectSessionControlEvent(raw, sessionId);
            if (event !== null) yield event;
          }
        } catch {
          throw new Error(
            'Session observation interrupted; recover session and turn state before continuing.'
          );
        } finally {
          stream.controller.abort();
        }
      }
      return {
        events: events(),
        close: (): void => {
          stream.controller.abort();
        },
      };
    } catch {
      throw new Error('Unable to open session observation; no provider payload was emitted.');
    }
  }

  public async read(input: unknown): Promise<PlatformResult> {
    const parsed = readSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error('Invalid or unsupported OpenAI read.');
    }
    await this.preflight();
    try {
      const data = await this.query(parsed.data);
      return { data, fingerprint: fingerprint(data) };
    } catch (error) {
      throw sanitizedReadError(error);
    }
  }

  /** One root-turn content observation. Completion/closure never acknowledges executor shutdown. */
  public async openOperatorObservation(binding: {
    sessionId: string;
    turnId: string;
  }): Promise<{ items: OperatorItems; close: () => void; completion: Promise<void> }> {
    const sessionId = observationRequestSchema.parse({ sessionId: binding.sessionId }).sessionId;
    observationRequestSchema.parse({ sessionId: binding.turnId });
    await this.preflight();
    const stream = await this.#client.beta.agents.sessions.events.stream(sessionId);
    const items = new OperatorItems(sessionId, binding.turnId);
    const completion = (async (): Promise<void> => {
      try {
        for await (const raw of stream) items.consume(raw);
      } catch {
        throw new Error('Operator observation interrupted; recover saved state');
      } finally {
        stream.controller.abort();
      }
      throw new Error('Operator observation closed; recover saved state');
    })();
    return {
      items,
      close: (): void => {
        stream.controller.abort();
      },
      completion,
    };
  }

  private async query(request: ReadOperation): Promise<unknown> {
    const agents = this.#client.beta.agents;
    switch (request.operation) {
      case 'models.list':
        return (await this.#client.models.list()).data;
      case 'agents.list':
        return pageData(await agents.list(request.query));
      case 'agents.get':
        return agents.retrieve(request.id);
      case 'sessions.list':
        return pageData(await agents.sessions.list(request.query));
      case 'sessions.get':
        return agents.sessions.retrieve(request.id);
      case 'sessions.pending-functions':
        return {
          data: pendingFunctionCalls(await agents.sessions.retrieve(request.id), {
            sessionId: request.id,
            turnId: request.turnId,
          }),
        };
      case 'sessions.turns':
        return pageData(await agents.sessions.turns.list(request.id, request.query));
      case 'sessions.turn.get':
        return agents.sessions.turns.retrieve(request.turnId, { session_id: request.id });
      case 'sessions.items':
        return pageData(await agents.sessions.items.list(request.id, request.query));
      case 'templates.list':
        return pageData(await agents.environments.templates.list(request.query));
      case 'templates.get':
        return agents.environments.templates.retrieve(request.id);
    }
  }

  public async apply(
    input: unknown,
    approval: Approval,
    options?: DispatchOptions
  ): Promise<PlatformResult> {
    const action = parseAction(input);
    const plan = planAction(this.#config.target, action);
    if (
      !approval.apply ||
      approval.digest !== plan.digest ||
      (plan.billable && !approval.allowBillable)
    ) {
      throw new Error('Exact plan approval and separate billable authorization are required.');
    }
    await this.preflight();
    await this.checkCurrentAgent(action);
    await this.checkPendingFunction(action);
    // No further read/preflight may be inserted after this journal boundary. SDK errors after
    // it remain uncertain; accepting a generic header does not establish create idempotency.
    await options?.beforeDispatch?.();
    try {
      const data = await this.mutate(action);
      return { data: data ?? null, fingerprint: fingerprint(data) };
    } catch (error) {
      throw sanitizedMutationError(action, error);
    }
  }

  private async checkCurrentAgent(action: Action): Promise<void> {
    if (!('expectedFingerprint' in action)) {
      return;
    }
    let current: unknown;
    try {
      current = action.operation.startsWith('templates.')
        ? await this.#client.beta.agents.environments.templates.retrieve(action.id)
        : await this.#client.beta.agents.retrieve(action.id);
    } catch {
      throw new Error('Unable to check current resource; no mutation attempted.');
    }
    if (fingerprint(current) !== action.expectedFingerprint) {
      throw new Error('Resource changed since review; obtain a fresh read and approval.');
    }
  }

  private async checkPendingFunction(action: Action): Promise<void> {
    if (action.operation !== 'sessions.tool-result') return;
    try {
      const session = await this.#client.beta.agents.sessions.retrieve(action.id);
      const pending = pendingFunctionCalls(session, {
        sessionId: action.id,
        turnId: action.turnId,
      }).find((call) => call.callId === action.callId);
      if (
        pending?.name !== action.functionName ||
        pending.fingerprint !== action.expectedCallFingerprint
      ) {
        throw new Error('Pending function changed.');
      }
    } catch {
      throw new Error('Pending function missing, changed or unverifiable; no result submitted.');
    }
  }

  private async mutate(action: Action): Promise<unknown> {
    const agents = this.#client.beta.agents;
    switch (action.operation) {
      case 'agents.create':
        return agents.create(action.body);
      case 'agents.update':
        return agents.update(action.id, action.body);
      case 'agents.delete':
        return agents.delete(action.id);
      case 'sessions.create':
        return agents.sessions.create({ ...action.body, stream: false });
      case 'sessions.send':
        return agents.sessions.events.create(action.id, {
          'Idempotency-Key': action.idempotencyKey,
          events: [
            {
              type: 'agent.session.input.message',
              input: [{ role: 'user', content: [{ type: 'input_text', text: action.input }] }],
            },
          ],
        });
      case 'sessions.cancel':
        return agents.sessions.events.create(action.id, {
          events: [{ type: 'agent.session.input.cancel' }],
        });
      case 'sessions.tool-result':
        return agents.sessions.events.create(action.id, {
          events: [
            {
              type: 'agent.session.input.tool_result',
              turn_id: action.turnId,
              call_id: action.callId,
              ...action.result,
            },
          ],
        });
      case 'sessions.delete':
        return agents.sessions.delete(action.id);
      case 'templates.create':
        return agents.environments.templates.create(action.body);
      case 'templates.update':
        return agents.environments.templates.update(action.id, action.body);
      case 'templates.delete':
        return agents.environments.templates.delete(action.id);
    }
  }
}

/** Default CLI output excludes instructions, messages, tool arguments, and credentials. */
export function summarize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { count: value.length };
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const allowed = new Set(['id', 'object', 'status', 'deleted', 'has_more', 'first_id', 'last_id']);
  const entries = Object.entries(value);
  return Object.fromEntries(
    entries.flatMap(([key, entry]): [string, unknown][] => {
      if (key === 'data' && Array.isArray(entry)) {
        return [['data', entry.map(summarize)]];
      }
      return allowed.has(key) && (typeof entry === 'string' || typeof entry === 'boolean')
        ? [[key, entry]]
        : [];
    })
  );
}
