import { readFile } from 'node:fs/promises';

import type {
  OperatorBinding,
  OperatorCommand,
  OperatorDelivery,
  OperatorSnapshot,
  AgentFunctionCall,
  AgentFunctionResult,
  AgentLaunchRequest,
  AgentSessionReceipt,
  AgentSessionCredential,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { credentialSchema, resolveConfig, type Target } from './config.js';
import { readCredential } from './credential.js';
import {
  DockerSessionExecutor,
  dockerExecutorSettingsSchema,
  type SessionExecutor,
} from './docker-executor.js';
import type { Action } from './operations.js';
import type { OperatorItems } from './operator-items.js';
import { operatorText } from './operator-items.js';
import { verifiedOperatorRoots } from './operator-provenance.js';
import { pendingFunctionCalls } from './pending-functions.js';
import { OpenAIPlatform, fingerprint, planAction, InputNotSteerableError } from './platform.js';
import { sessionHistory } from './session-history.js';
import { SessionLaunchPort } from './session-launch.js';

export type {
  OperatorBinding,
  OperatorCommand,
  OperatorSnapshot,
} from '@headstart-health/workflow-contracts';

const wrongTarget = 'Wrong runtime target';
const noInferenceAuthority = 'No current bounded inference authorization';
const sessionGet = 'sessions.get' as const;
const sessionSchema = z.object({ id: z.string(), metadata: z.record(z.string(), z.string()) });
type Platform = Pick<OpenAIPlatform, 'read' | 'apply' | 'openOperatorObservation'>;
function operatorStatus(
  status: ReturnType<typeof verifiedOperatorRoots>['root']['status'],
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
    private readonly billableUntil = 0,
    private readonly appFunctions: readonly string[] = [],
    private readonly launchSettings?: unknown,
    private readonly executor?: SessionExecutor
  ) {
    z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/))
      .max(30)
      .parse(appFunctions);
    if (appFunctions.includes('ask_operator'))
      throw new Error('Human questions are not application functions');
  }
  createSession(
    request: AgentLaunchRequest,
    credentials?: AgentSessionCredential[]
  ): Promise<AgentSessionReceipt> {
    this.requireOpen();
    return new SessionLaunchPort(
      this.platform,
      this.target,
      this.launchSettings,
      this.billableUntil,
      this.appFunctions,
      this.executor
    ).createSession(request, credentials);
  }
  inspectSession(receipt: AgentSessionReceipt): Promise<OperatorBinding | null> {
    this.requireOpen();
    return new SessionLaunchPort(
      this.platform,
      this.target,
      this.launchSettings,
      this.billableUntil,
      this.appFunctions,
      this.executor
    ).inspectSession(receipt);
  }
  cancelSession(receipt: AgentSessionReceipt): Promise<void> {
    this.requireOpen();
    return new SessionLaunchPort(
      this.platform,
      this.target,
      this.launchSettings,
      this.billableUntil,
      this.appFunctions,
      this.executor
    ).cancelSession(receipt);
  }
  reconcileEnvironment(
    receipt: AgentSessionReceipt,
    action: 'start' | 'reconcile' | 'stop'
  ): Promise<void> {
    this.requireOpen();
    return new SessionLaunchPort(
      this.platform,
      this.target,
      this.launchSettings,
      this.billableUntil,
      this.appFunctions,
      this.executor
    ).reconcileEnvironment(receipt, action);
  }
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
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
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
      this.platform.read({ operation: sessionGet, id: binding.sessionId }),
      sessionHistory(this.platform, binding.sessionId, 'sessions.turns'),
      sessionHistory(this.platform, binding.sessionId, 'sessions.items'),
    ]);
    this.requireOpen();
    const { roots, root } = verifiedOperatorRoots(binding, session.data, turns);
    observation.items.includeTurns(roots.map((turn) => turn.id));
    observation.items.recover(history.data);
    const calls = pendingFunctionCalls(session.data, {
      sessionId: binding.sessionId,
      turnId: root.id,
    });
    const questions = calls
      .filter((call) => !this.appFunctions.includes(call.name))
      .map((call) => {
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
  /** Read-only application channel, separate from the sanitized operator feed. */
  async pendingFunctions(binding: OperatorBinding): Promise<AgentFunctionCall[]> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    const [session, turns] = await Promise.all([
      this.platform.read({ operation: sessionGet, id: binding.sessionId }),
      sessionHistory(this.platform, binding.sessionId, 'sessions.turns'),
    ]);
    this.requireOpen();
    const { root } = verifiedOperatorRoots(binding, session.data, turns);
    if (['completed', 'cancelled', 'failed'].includes(root.status)) return [];
    return pendingFunctionCalls(session.data, {
      sessionId: binding.sessionId,
      turnId: root.id,
    }).filter((call) => this.appFunctions.includes(call.name));
  }
  async completeFunction(
    binding: OperatorBinding,
    call: AgentFunctionCall,
    result: AgentFunctionResult
  ): Promise<void> {
    if (Date.now() >= this.billableUntil) throw new Error(noInferenceAuthority);
    const pending = (await this.pendingFunctions(binding)).find(
      (item) =>
        item.callId === call.callId &&
        item.turnId === call.turnId &&
        item.name === call.name &&
        item.sessionId === call.sessionId &&
        item.fingerprint === call.fingerprint
    );
    if (!pending) throw new Error('Application function is no longer pending');
    const action: Action = {
      operation: 'sessions.tool-result',
      id: binding.sessionId,
      turnId: pending.turnId,
      callId: pending.callId,
      functionName: pending.name,
      expectedCallFingerprint: pending.fingerprint,
      result,
    };
    this.requireOpen();
    await this.platform.apply(action, {
      apply: true,
      digest: planAction(this.target, action).digest,
      allowBillable: true,
    });
  }
  async send(binding: OperatorBinding, command: OperatorCommand): Promise<OperatorDelivery> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    const verified = sessionSchema.parse(
      (await this.platform.read({ operation: sessionGet, id: binding.sessionId })).data
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
    if (Date.now() >= this.billableUntil) throw new Error(noInferenceAuthority);
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
        throw new Error(noInferenceAuthority);
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
  applicationFunctions?: string[];
  launchSettings?: unknown;
  executorSettings?: unknown;
}): Promise<OperatorRuntimePort> {
  const config = resolveConfig(JSON.parse(await readFile(options.configPath, 'utf8')));
  const key = await readCredential(config.credential);
  const expiry = options.billableUntil ? Date.parse(options.billableUntil) : 0;
  if (!Number.isFinite(expiry)) throw new Error('Invalid bounded authorization expiry');
  let executor: SessionExecutor | undefined;
  if (options.executorSettings !== undefined) {
    const settings = dockerExecutorSettingsSchema
      .extend({ credential: credentialSchema })
      .strict()
      .parse(options.executorSettings);
    if (options.launchSettings !== undefined) {
      z.object({
        environment: z.object({
          type: z.literal('self_hosted'),
          workspace_directory: z.literal('/workspace'),
        }),
        mcpServers: z
          .array(z.object({ type: z.literal('mcp'), connection_origin: z.literal('service') }))
          .default([]),
      }).parse(options.launchSettings);
    }
    executor = new DockerSessionExecutor(
      { imageId: settings.imageId },
      fingerprint(config.target),
      async () => {
        const environmentKey = await readCredential(settings.credential);
        if (environmentKey === key)
          throw new Error('Executor credential must differ from application credential');
        return environmentKey;
      }
    );
  }
  return new OperatorRuntimePort(
    new OpenAIPlatform(config, key),
    config.target,
    expiry,
    options.applicationFunctions,
    options.launchSettings,
    executor
  );
}
