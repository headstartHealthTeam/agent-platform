import { readFile } from 'node:fs/promises';

import type {
  OperatorBinding,
  OperatorCommand,
  OperatorDelivery,
  OperatorSnapshot,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { resolveConfig, type Target } from './config.js';
import { readCredential } from './credential.js';
import type { Action } from './operations.js';
import type { OperatorItems } from './operator-items.js';
import { operatorText } from './operator-items.js';
import { pendingFunctionCalls } from './pending-functions.js';
import { OpenAIPlatform, fingerprint, planAction, InputNotSteerableError } from './platform.js';

export type {
  OperatorBinding,
  OperatorCommand,
  OperatorSnapshot,
} from '@headstart-health/workflow-contracts';

const turnSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  subagent_id: z.null(),
  status: z.enum(['queued', 'in_progress', 'waiting', 'completed', 'failed', 'cancelled']),
});
const sessionSchema = z.object({ id: z.string(), metadata: z.record(z.string(), z.string()) });
const pageSchema = z.object({ data: z.array(z.unknown()).max(100), has_more: z.literal(false) });
const turnsSchema = pageSchema.extend({
  data: z.array(turnSchema.extend({ subagent_id: z.string().nullable() })).max(100),
});
type Platform = Pick<OpenAIPlatform, 'read' | 'apply' | 'openOperatorObservation'>;
function operatorStatus(
  status: z.infer<typeof turnSchema>['status'],
  hasQuestions: boolean
): OperatorSnapshot['status'] {
  if (status === 'completed') return 'idle';
  if (status === 'failed' || status === 'cancelled') return status;
  return hasQuestions ? 'waiting' : 'running';
}

/** Case records, operator authorization and durable outbox claims remain with the owning service. */
export class OperatorRuntimePort {
  private closed = false;
  private opening = 0;
  private readonly pending = new Map<
    string,
    { binding: string; result: Promise<OperatorSnapshot> }
  >();
  private observations = new Map<
    string,
    {
      binding: string;
      items: OperatorItems;
      close: () => void;
      failed: boolean;
      expiry: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private readonly platform: Platform,
    private readonly target: Target,
    private readonly billableUntil = 0
  ) {}
  async snapshot(binding: OperatorBinding): Promise<OperatorSnapshot> {
    this.requireOpen();
    const identity = fingerprint(binding);
    const prior = this.pending.get(binding.sessionId);
    if (prior) {
      if (prior.binding !== identity) throw new Error('Observation binding changed');
      return prior.result;
    }
    const result = this.observe(binding);
    this.pending.set(binding.sessionId, { binding: identity, result });
    try {
      return await result;
    } finally {
      this.pending.delete(binding.sessionId);
    }
  }
  private async observe(binding: OperatorBinding): Promise<OperatorSnapshot> {
    if (binding.target !== fingerprint(this.target)) throw new Error('Wrong runtime target');
    let observation = this.observations.get(binding.sessionId);
    if (observation && observation.binding !== fingerprint(binding))
      throw new Error('Observation binding changed');
    if (observation?.failed) {
      clearTimeout(observation.expiry);
      observation.close();
      this.observations.delete(binding.sessionId);
      observation = undefined;
    }
    if (!observation) {
      if (this.observations.size + this.opening >= 20)
        throw new Error('Observation capacity reached');
      this.opening += 1;
      let opened: Awaited<ReturnType<Platform['openOperatorObservation']>>;
      try {
        opened = await this.platform.openOperatorObservation(binding);
      } finally {
        this.opening -= 1;
      }
      if (this.closed) {
        opened.completion.catch(() => undefined);
        opened.close();
        this.requireOpen();
      }
      const expiry = setTimeout(() => {
        opened.close();
        this.observations.delete(binding.sessionId);
      }, 45_000);
      expiry.unref();
      const entry = { ...opened, binding: fingerprint(binding), failed: false, expiry };
      this.observations.set(binding.sessionId, entry);
      opened.completion.catch(() => {
        entry.failed = true;
      });
      observation = entry;
    }
    observation.expiry.refresh();
    const [session, turns, history] = await Promise.all([
      this.platform.read({ operation: 'sessions.get', id: binding.sessionId }),
      this.platform.read({
        operation: 'sessions.turns',
        id: binding.sessionId,
        query: { limit: 100, order: 'asc' },
      }),
      this.platform.read({
        operation: 'sessions.items',
        id: binding.sessionId,
        query: { limit: 100, order: 'asc' },
      }),
    ]);
    const verified = sessionSchema.parse(session.data);
    this.requireOpen();
    const roots = turnsSchema.parse(turns.data).data.filter((turn) => turn.subagent_id === null);
    const root = roots.at(-1);
    if (
      verified.id !== binding.sessionId ||
      verified.metadata['workflow_revision'] !== binding.workflowRevision ||
      !root ||
      roots[0]?.id !== binding.turnId ||
      roots.some((turn) => turn.session_id !== binding.sessionId) ||
      new Set(roots.map((turn) => turn.id)).size !== roots.length ||
      roots.slice(0, -1).some((turn) => turn.status !== 'completed')
    )
      throw new Error('Run provenance changed');
    observation.items.includeTurns(roots.map((turn) => turn.id));
    observation.items.recover(pageSchema.parse(history.data).data);
    const calls = pendingFunctionCalls(session.data, {
      sessionId: binding.sessionId,
      turnId: root.id,
    });
    const questions = calls.map((call) => {
      if (call.name !== 'ask_operator') throw new Error('Unsupported pending function');
      const args = z
        .object({
          question: z.string().min(1).max(10000),
          evidenceReference: z.string().max(1000).optional(),
        })
        .strict()
        .parse(call.arguments);
      return {
        id: call.callId,
        kind: 'question' as const,
        text: operatorText(args.question),
        final: true,
        callFingerprint: call.fingerprint,
      };
    });
    return {
      status: operatorStatus(root.status, questions.length > 0),
      currentTurnId: root.id,
      items: [...observation.items.values(), ...questions],
      pendingQuestionIds: questions.map((item) => item.id),
    };
  }
  async send(binding: OperatorBinding, command: OperatorCommand): Promise<OperatorDelivery> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error('Wrong runtime target');
    const verified = sessionSchema.parse(
      (await this.platform.read({ operation: 'sessions.get', id: binding.sessionId })).data
    );
    if (
      verified.id !== binding.sessionId ||
      verified.metadata['workflow_revision'] !== binding.workflowRevision
    )
      throw new Error('Run provenance changed');
    const action: Action =
      command.kind === 'stop'
        ? { operation: 'sessions.cancel', id: binding.sessionId }
        : await this.inputAction(binding, command);
    this.requireOpen();
    try {
      await this.platform.apply(action, {
        apply: true,
        digest: planAction(this.target, action).digest,
        allowBillable: command.kind !== 'stop',
      });
    } catch (error) {
      if (command.kind === 'guidance' && error instanceof InputNotSteerableError)
        return { status: 'rejected', reason: 'not_steerable' };
      throw error;
    }
    return undefined;
  }
  private async inputAction(binding: OperatorBinding, command: OperatorCommand): Promise<Action> {
    if (Date.now() >= this.billableUntil)
      throw new Error('No current bounded inference authorization');
    // Subscribe before sending, and recover the latest root rather than replying to the launch turn.
    const current = await this.snapshot(binding);
    if (current.status === 'cancelled' || current.status === 'failed')
      throw new Error('Stopped or failed work requires a separate continuation decision');
    if (command.kind === 'guidance') {
      if (command.questionId !== null || command.callFingerprint !== null || !command.text.trim())
        throw new Error('Guidance is not an answer to a pending function');
      return {
        operation: 'sessions.send',
        id: binding.sessionId,
        input: command.text,
        idempotencyKey: command.id,
      };
    } else {
      if (!command.questionId || !command.callFingerprint || !current.currentTurnId)
        throw new Error('No current bounded inference authorization');
      return {
        operation: 'sessions.tool-result',
        id: binding.sessionId,
        turnId: current.currentTurnId,
        callId: command.questionId,
        functionName: 'ask_operator',
        expectedCallFingerprint: command.callFingerprint,
        result: { success: true, output: command.text },
      };
    }
  }
  private requireOpen(): void {
    if (this.closed) throw new Error('Runtime observer is closed');
  }
  close(): void {
    this.closed = true;
    for (const observer of this.observations.values()) {
      clearTimeout(observer.expiry);
      observer.close();
    }
    this.observations.clear();
  }
}

/** Private local application composition only; never runs inside the isolated agent executor. */
export async function createLocalOperatorRuntimePort(options: {
  configPath: string;
  billableUntil?: string;
}): Promise<OperatorRuntimePort> {
  const config = resolveConfig(JSON.parse(await readFile(options.configPath, 'utf8')));
  const key = await readCredential(config.credential);
  const expiry = options.billableUntil ? Date.parse(options.billableUntil) : 0;
  if (!Number.isFinite(expiry)) throw new Error('Invalid bounded authorization expiry');
  return new OperatorRuntimePort(new OpenAIPlatform(config, key), config.target, expiry);
}
