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
  AgentSessionCredentialDescriptor,
  AgentSessionCreateOptions,
  AgentSessionCreateResult,
  AgentLaunchPreflight,
  AgentLaunchIdentity,
  AgentLaunchCandidateResult,
  AgentLaunchCandidatePage,
  OperatorHistoryCursor,
  OperatorHistoryPage,
  AgentArtifactRequest,
  AgentArtifact,
  AgentHostedCredentialFiles,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Target } from './config.js';
import { HostedArtifactError } from './hosted-artifact-error.js';
import type { Action } from './operations.js';
import { operatorHistory } from './operator-history.js';
import type { OperatorItems } from './operator-items.js';
import { operatorText } from './operator-items.js';
import type { verifiedOperatorRoots } from './operator-provenance.js';
import { OperatorProvenanceError } from './operator-provenance.js';
import { OperatorTurns } from './operator-turns.js';
import { pendingFunctionCalls } from './pending-functions.js';
import type { OpenAIPlatform } from './platform.js';
import { fingerprint, planAction, InputNotSteerableError } from './platform.js';
import type { SessionExecutor } from './session-executor.js';
import { SessionLaunchPort } from './session-launch.js';

export type {
  OperatorBinding,
  OperatorCommand,
  OperatorSnapshot,
} from '@headstart-health/workflow-contracts';

const wrongTarget = 'Wrong runtime target';
const artifactIdentity = 'artifact-identity';
const noInferenceAuthority = 'No current bounded inference authorization';
const sessionGet = 'sessions.get' as const;
const sessionSchema = z.object({ id: z.string(), metadata: z.record(z.string(), z.string()) });
type Platform = Pick<OpenAIPlatform, 'read' | 'apply' | 'preflight' | 'openOperatorObservation'> &
  Partial<Pick<OpenAIPlatform, 'readHostedArtifact'>>;
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
  private readonly turns = new OperatorTurns();
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
    private readonly executor?: SessionExecutor,
    private readonly credentialFiles?: AgentHostedCredentialFiles
  ) {
    z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/))
      .max(30)
      .parse(appFunctions);
    if (appFunctions.includes('ask_operator'))
      throw new Error('Human questions are not application functions');
  }
  private launchPort(): SessionLaunchPort {
    return new SessionLaunchPort(
      this.platform,
      this.target,
      this.launchSettings,
      this.billableUntil,
      this.appFunctions,
      this.executor,
      this.credentialFiles
    );
  }
  async artifactTurnStatus(
    binding: OperatorBinding,
    turnId: string
  ): Promise<'pending' | 'completed' | 'failed' | 'cancelled'> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target))
      throw new HostedArtifactError(artifactIdentity);
    const observed = await this.turns.read(this.platform, binding).catch((error: unknown) => {
      if (error instanceof OperatorProvenanceError) throw new HostedArtifactError(artifactIdentity);
      throw error;
    });
    const turn = observed.roots.find((candidate) => candidate.id === turnId);
    if (!turn) throw new HostedArtifactError(artifactIdentity);
    return turn.status === 'completed' || turn.status === 'failed' || turn.status === 'cancelled'
      ? turn.status
      : 'pending';
  }
  async readArtifact(
    binding: OperatorBinding,
    request: AgentArtifactRequest
  ): Promise<AgentArtifact> {
    const status = await this.artifactTurnStatus(binding, request.turnId);
    if (status === 'failed' || status === 'cancelled')
      throw new HostedArtifactError(artifactIdentity);
    if (status !== 'completed') throw new Error('Hosted artifact turn has not completed');
    if (!this.platform.readHostedArtifact) throw new HostedArtifactError(artifactIdentity);
    this.requireOpen();
    return this.platform.readHostedArtifact(binding.sessionId, request);
  }
  preflightLaunch(
    request: AgentLaunchRequest,
    descriptors?: AgentSessionCredentialDescriptor[]
  ): Promise<AgentLaunchPreflight> {
    this.requireOpen();
    return this.launchPort().preflightLaunch(request, descriptors);
  }
  createSession(
    request: AgentLaunchRequest,
    credentials?: AgentSessionCredential[],
    options?: AgentSessionCreateOptions
  ): Promise<AgentSessionCreateResult> {
    if (this.closed) return Promise.resolve({ status: 'not-attempted', reason: 'validation' });
    return this.launchPort().createSession(request, credentials, options);
  }
  inspectLaunchCandidate(
    expectedTarget: string,
    sessionId: string
  ): Promise<AgentLaunchCandidateResult> {
    this.requireOpen();
    return this.launchPort().inspectLaunchCandidate(expectedTarget, sessionId);
  }
  discoverLaunchCandidates(
    identity: AgentLaunchIdentity,
    after?: string
  ): Promise<AgentLaunchCandidatePage> {
    this.requireOpen();
    return this.launchPort().discoverLaunchCandidates(identity, after);
  }
  inspectSession(receipt: AgentSessionReceipt): Promise<OperatorBinding | null> {
    this.requireOpen();
    return this.launchPort().inspectSession(receipt);
  }
  cancelSession(receipt: AgentSessionReceipt): Promise<void> {
    this.requireOpen();
    return this.launchPort().cancelSession(receipt);
  }
  reconcileEnvironment(
    receipt: AgentSessionReceipt,
    action: 'start' | 'reconcile' | 'stop'
  ): Promise<void> {
    this.requireOpen();
    return this.launchPort().reconcileEnvironment(receipt, action);
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
  async history(
    binding: OperatorBinding,
    cursor: OperatorHistoryCursor | null
  ): Promise<OperatorHistoryPage> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    const page = await operatorHistory(this.platform, binding, cursor, this.turns);
    this.requireOpen();
    return page;
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
    const [{ session, roots, root }, history] = await Promise.all([
      this.turns.read(this.platform, binding),
      this.platform.read({
        operation: 'sessions.items',
        id: binding.sessionId,
        query: { limit: 100, order: 'desc' },
      }),
    ]);
    this.requireOpen();
    observation.items.includeTurns(roots.map((turn) => turn.id));
    const recent = z
      .object({ data: z.array(z.unknown()).max(100), has_more: z.boolean() })
      .parse(history.data);
    if (recent.has_more && !recent.data.length) throw new Error('Invalid recent history page');
    // Recent saved items repair stream gaps; complete history has its independent durable cursor.
    observation.items.recover([...recent.data].reverse());
    const calls = pendingFunctionCalls(session, {
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
    const { session, root } = await this.turns.read(this.platform, binding);
    this.requireOpen();
    if (['completed', 'cancelled', 'failed'].includes(root.status)) return [];
    return pendingFunctionCalls(session, {
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
    return this.dispatch(binding, command, false);
  }
  private async dispatch(
    binding: OperatorBinding,
    command: OperatorCommand,
    recovering: boolean
  ): Promise<OperatorDelivery> {
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
        : await this.inputAction(binding, command, recovering);
    this.requireOpen();
    try {
      await this.platform.apply(action, {
        apply: true,
        digest: planAction(this.target, action).digest,
        allowBillable: command.kind !== 'stop',
      });
    } catch (error) {
      if (
        ['guidance', 'continue'].includes(command.kind) &&
        error instanceof InputNotSteerableError
      )
        return { status: 'rejected', reason: 'not_steerable' };
      throw error;
    }
    return undefined;
  }
  /** Reconcile the SAME durable command; never generate a replacement message or tool result. */
  async recover(binding: OperatorBinding, command: OperatorCommand): Promise<OperatorDelivery> {
    if (command.kind === 'reply') {
      const current = await this.snapshot(binding);
      const question = current.items.find(
        (item) =>
          item.id === command.questionId &&
          item.callFingerprint === command.callFingerprint &&
          current.pendingQuestionIds.includes(item.id)
      );
      if (!question || ['idle', 'completed', 'cancelled', 'failed'].includes(current.status))
        return { status: 'superseded', reason: 'question_closed' };
    }
    // Message idempotency is provided by the original command.id in inputAction. A reply is
    // resent only to its exact pending call; apply rechecks that call immediately before I/O.
    const result = await this.dispatch(binding, command, true);
    // A present refusal says nothing about the earlier attempt whose acknowledgement was lost.
    if (result?.status === 'rejected') throw new Error('Earlier delivery remains unconfirmed');
    return result;
  }
  private async inputAction(
    binding: OperatorBinding,
    command: OperatorCommand,
    recovering: boolean
  ): Promise<Action> {
    if (Date.now() >= this.billableUntil) throw new Error(noInferenceAuthority);
    // Subscribe before sending, and recover the latest root rather than replying to the launch turn.
    const current = await this.snapshot(binding);
    if (command.kind === 'continue') {
      if (
        !command.expectedTurnId ||
        command.questionId !== null ||
        command.callFingerprint !== null ||
        !command.text.trim() ||
        (!recovering &&
          (current.currentTurnId !== command.expectedTurnId ||
            !['idle', 'completed', 'cancelled', 'failed'].includes(current.status)))
      )
        throw new Error('Continuation requires the exact ended turn');
      // Recovery uses the original message key even if its first attempt already started a turn.
      // The application must retain its explicit decision and serialize this against later Stop.
      return {
        operation: 'sessions.send',
        id: binding.sessionId,
        input: command.text,
        idempotencyKey: command.id,
      };
    }
    if (command.expectedTurnId !== undefined)
      throw new Error('Only explicit continuation may carry an ended turn');
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
    this.turns.clear();
  }
}
