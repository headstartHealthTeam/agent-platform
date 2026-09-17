import { readFile } from 'node:fs/promises';

import type {
  OperatorBinding,
  OperatorCommand,
  OperatorSnapshot,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { resolveConfig, type Target } from './config.js';
import { readCredential } from './credential.js';
import type { Action } from './operations.js';
import type { OperatorItems } from './operator-items.js';
import { operatorText } from './operator-items.js';
import { pendingFunctionCalls } from './pending-functions.js';
import { OpenAIPlatform, fingerprint, planAction } from './platform.js';

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
type Platform = Pick<OpenAIPlatform, 'read' | 'apply' | 'openOperatorObservation'>;

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
    const [session, turn, history] = await Promise.all([
      this.platform.read({ operation: 'sessions.get', id: binding.sessionId }),
      this.platform.read({
        operation: 'sessions.turn.get',
        id: binding.sessionId,
        turnId: binding.turnId,
      }),
      this.platform.read({
        operation: 'sessions.items',
        id: binding.sessionId,
        query: { limit: 100, order: 'asc' },
      }),
    ]);
    const verified = sessionSchema.parse(session.data);
    this.requireOpen();
    const root = turnSchema.parse(turn.data);
    if (
      verified.id !== binding.sessionId ||
      verified.metadata['workflow_revision'] !== binding.workflowRevision ||
      root.id !== binding.turnId ||
      root.session_id !== binding.sessionId
    )
      throw new Error('Run provenance changed');
    observation.items.recover(pageSchema.parse(history.data).data);
    const calls = pendingFunctionCalls(session.data, {
      sessionId: binding.sessionId,
      turnId: binding.turnId,
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
    const status =
      root.status === 'completed' || root.status === 'failed' || root.status === 'cancelled'
        ? root.status
        : questions.length
          ? ('waiting' as const)
          : ('running' as const);
    return {
      status,
      items: [...observation.items.values(), ...questions],
      pendingQuestionIds: questions.map((item) => item.id),
    };
  }
  async send(binding: OperatorBinding, command: OperatorCommand): Promise<void> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error('Wrong runtime target');
    if (command.kind === 'guidance')
      throw new Error('Cross-turn guidance requires its separate dispatch contract');
    const verified = sessionSchema.parse(
      (await this.platform.read({ operation: 'sessions.get', id: binding.sessionId })).data
    );
    if (
      verified.id !== binding.sessionId ||
      verified.metadata['workflow_revision'] !== binding.workflowRevision
    )
      throw new Error('Run provenance changed');
    let action: Action;
    if (command.kind === 'stop') action = { operation: 'sessions.cancel', id: binding.sessionId };
    else {
      if (Date.now() >= this.billableUntil || !command.questionId || !command.callFingerprint)
        throw new Error('No current bounded inference authorization');
      action = {
        operation: 'sessions.tool-result',
        id: binding.sessionId,
        turnId: binding.turnId,
        callId: command.questionId,
        functionName: 'ask_operator',
        expectedCallFingerprint: command.callFingerprint,
        result: { success: true, output: command.text },
      };
    }
    this.requireOpen();
    await this.platform.apply(action, {
      apply: true,
      digest: planAction(this.target, action).digest,
      allowBillable: command.kind === 'reply',
    });
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
