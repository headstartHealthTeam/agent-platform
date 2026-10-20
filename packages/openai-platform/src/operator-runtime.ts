import type {
  OperatorBinding,
  OperatorCommand,
  OperatorDelivery,
  OperatorSnapshot,
  AgentFunctionCall,
  AgentFunctionResult,
  AgentLaunchRequest,
  AgentSessionReceipt,
  AgentEnvironmentSnapshot,
  AgentSessionCredential,
  AgentSessionCredentialDescriptor,
  AgentSessionCreateOptions,
  AgentSessionCreateResult,
  AgentLaunchPreflight,
  AgentLaunchIdentity,
  AgentInferenceRequest,
  AgentLaunchCandidateResult,
  AgentLaunchCandidatePage,
  OperatorHistoryCursor,
  OperatorHistoryPage,
  AgentArtifactRequest,
  AgentArtifact,
  AgentHostedCredentialFiles,
  AgentConversationManifest,
  AgentConversationPart,
  AgentBrowserRequest,
  AgentPublicBrowserDecision,
  AgentPublicResearchRequest,
  AgentResearchFileTransfer,
  AgentResearchFileReceipt,
  AgentWorkspaceFile,
  AgentWorkspaceFileReceipt,
  AgentPreparedSessionStartResult,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import { pendingBrowserApprovals } from './browser-approvals.js';
import type { Target } from './config.js';
import { exportConversation, deleteConversation } from './conversation-archive.js';
import { HostedArtifactError } from './hosted-artifact-error.js';
import {
  requireInferenceAuthority,
  noInferenceAuthority,
  type InferenceAuthority,
} from './inference-authority.js';
import type { Action } from './operations.js';
import { operatorHistory } from './operator-history.js';
import type { OperatorItems } from './operator-items.js';
import { operatorText } from './operator-items.js';
import type { verifiedOperatorRoots } from './operator-provenance.js';
import { OperatorProvenanceError } from './operator-provenance.js';
import { operatorReadBudget } from './operator-read-budget.js';
import { OperatorTurns } from './operator-turns.js';
import { pendingFunctionCalls } from './pending-functions.js';
import type { OpenAIPlatform } from './platform.js';
import { fingerprint, planAction, InputNotSteerableError } from './platform.js';
import { PreparedSessionPort } from './prepared-session.js';
import { publicBrowserDecision } from './public-browser-policy.js';
import { publicResearchLaunch } from './public-research.js';
import { publicResearchSettings } from './research-launch.js';
import type { SessionExecutor } from './session-executor.js';
import { SessionLaunchPort } from './session-launch.js';

export type {
  OperatorBinding,
  OperatorCommand,
  OperatorSnapshot,
} from '@headstart-health/workflow-contracts';

const wrongTarget = 'Wrong runtime target';
const publicBrowser = 'public-browser';
const artifactIdentity = 'artifact-identity';
const sessionGet = 'sessions.get' as const;
const sessionSchema = z.object({ id: z.string(), metadata: z.record(z.string(), z.string()) });
type Platform = Pick<OpenAIPlatform, 'read' | 'apply' | 'preflight' | 'openOperatorObservation'> &
  Partial<
    Pick<
      OpenAIPlatform,
      'readHostedArtifact' | 'stageResearchFile' | 'stageWorkspaceFile' | 'stagePreparedSessionFile'
    >
  >;
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
    private readonly inferenceAuthority: InferenceAuthority = 0,
    private readonly appFunctions: readonly string[] = [],
    private readonly launchSettings?: unknown,
    private readonly executor?: SessionExecutor,
    private readonly credentialFiles?: AgentHostedCredentialFiles
  ) {
    if (executor && typeof inferenceAuthority !== 'number')
      throw new Error('Self-hosted execution requires bounded inference authorization');
    z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/))
      .max(30)
      .parse(appFunctions);
    if (appFunctions.includes('ask_operator'))
      throw new Error('Human questions are not application functions');
  }
  private launchPort(request?: AgentLaunchRequest): SessionLaunchPort {
    const publicResearch = request?.definition.research === publicBrowser;
    return new SessionLaunchPort(
      this.platform,
      this.target,
      publicResearch ? publicResearchSettings(this.launchSettings) : this.launchSettings,
      this.inferenceAuthority,
      this.appFunctions,
      publicResearch ? undefined : this.executor,
      publicResearch ? undefined : this.credentialFiles
    );
  }
  publicResearchLaunch(request: AgentPublicResearchRequest): Promise<AgentLaunchRequest> {
    return Promise.resolve(publicResearchLaunch(request));
  }
  async stageWorkspaceFile(
    binding: OperatorBinding,
    file: AgentResearchFileTransfer,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentResearchFileReceipt> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    const { session, root } = await this.turns.read(this.platform, binding);
    if (['cancelled', 'failed'].includes(root.status))
      throw new Error('Destination turn is stopped or failed');
    const environment = z
      .object({
        environment: z.object({ type: z.literal('openai_hosted'), id: z.string().min(1) }),
      })
      .parse(session).environment;
    if (!this.platform.stageWorkspaceFile) throw new Error('Workspace upload is unavailable');
    return this.platform.stageWorkspaceFile(environment.id, file, async () => {
      this.requireOpen();
      await beforeDispatch();
      this.requireOpen();
    });
  }
  async stageResearchFile(
    binding: OperatorBinding,
    file: AgentResearchFileTransfer,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentResearchFileReceipt> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    const { session, root } = await this.turns.read(this.platform, binding);
    if (['completed', 'cancelled', 'failed'].includes(root.status))
      throw new Error('Research destination turn is no longer active');
    const environment = z
      .object({
        environment: z.object({ type: z.literal('openai_hosted'), id: z.string().min(1) }),
      })
      .parse(session).environment;
    if (!this.platform.stageResearchFile) throw new Error('Research file transfer is unavailable');
    return this.platform.stageResearchFile(environment.id, file, async () => {
      this.requireOpen();
      await beforeDispatch();
      this.requireOpen();
    });
  }
  async exportConversation(
    binding: OperatorBinding,
    retain: (part: AgentConversationPart) => Promise<void>
  ): Promise<AgentConversationManifest> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    const manifest = await exportConversation(this.platform, binding, async (part) => {
      this.requireOpen();
      await retain(part);
    });
    this.requireOpen();
    return manifest;
  }
  async deleteConversation(
    archive: AgentConversationManifest,
    beforeDispatch: () => Promise<void>
  ): Promise<{ status: 'deleted' | 'absent' }> {
    this.requireOpen();
    if (archive.binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    return deleteConversation(this.platform, this.target, archive, async () => {
      this.requireOpen();
      await beforeDispatch();
    });
  }
  async artifactTurnStatus(
    binding: OperatorBinding,
    turnId: string
  ): Promise<'pending' | 'completed' | 'failed' | 'cancelled'> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
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
    if (!this.platform.readHostedArtifact)
      throw new Error('Hosted artifact transport is not configured');
    this.requireOpen();
    return this.platform.readHostedArtifact(binding.sessionId, request);
  }
  preflightLaunch(
    request: AgentLaunchRequest,
    descriptors?: AgentSessionCredentialDescriptor[]
  ): Promise<AgentLaunchPreflight> {
    this.requireOpen();
    return this.launchPort(request).preflightLaunch(request, descriptors);
  }
  createSession(
    request: AgentLaunchRequest,
    credentials?: AgentSessionCredential[],
    options?: AgentSessionCreateOptions
  ): Promise<AgentSessionCreateResult> {
    if (this.closed) return Promise.resolve({ status: 'not-attempted', reason: 'validation' });
    return this.launchPort(request).createSession(request, credentials, options);
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
  inspectEnvironment(receipt: AgentSessionReceipt): Promise<AgentEnvironmentSnapshot> {
    this.requireOpen();
    return this.launchPort().inspectEnvironment(receipt);
  }
  stagePreparedSessionFile(
    receipt: AgentSessionReceipt,
    file: AgentWorkspaceFile,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentWorkspaceFileReceipt> {
    this.requireOpen();
    return new PreparedSessionPort(this.platform, this.target, this.inferenceAuthority).stage(
      receipt,
      file,
      async () => {
        this.requireOpen();
        await beforeDispatch();
        this.requireOpen();
      }
    );
  }
  startPreparedSession(
    receipt: AgentSessionReceipt,
    input: string,
    beforeDispatch: () => Promise<void>
  ): Promise<AgentPreparedSessionStartResult> {
    this.requireOpen();
    return new PreparedSessionPort(this.platform, this.target, this.inferenceAuthority, () => {
      this.requireOpen();
    }).start(receipt, input, async () => {
      this.requireOpen();
      await beforeDispatch();
      this.requireOpen();
    });
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
    const result = operatorReadBudget(this.platform, (reader) => this.observe(binding, reader));
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
    const page = await operatorReadBudget(this.platform, (reader) =>
      operatorHistory(reader, binding, cursor, this.turns)
    );
    this.requireOpen();
    return page;
  }
  private async observe(
    binding: OperatorBinding,
    reader: Pick<Platform, 'read' | 'openOperatorObservation'>
  ): Promise<OperatorSnapshot> {
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
        opened = await reader.openOperatorObservation(binding);
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
      this.turns.read(reader, binding),
      reader.read({
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
  /** Current provider requests only; reading never grants access or resumes inference. */
  async pendingPublicBrowserRequests(binding: OperatorBinding): Promise<AgentBrowserRequest[]> {
    this.requireOpen();
    if (binding.target !== fingerprint(this.target)) throw new Error(wrongTarget);
    const { session, root } = await this.turns.read(this.platform, binding);
    this.requireOpen();
    z.object({ metadata: z.object({ research_mode: z.literal(publicBrowser) }) }).parse(session);
    if (['completed', 'cancelled', 'failed'].includes(root.status)) return [];
    return pendingBrowserApprovals(session, { sessionId: binding.sessionId, turnId: root.id });
  }
  async answerPublicBrowserRequest(
    binding: OperatorBinding,
    request: AgentBrowserRequest,
    beforeDispatch: (decision: AgentPublicBrowserDecision) => Promise<void>
  ): Promise<AgentPublicBrowserDecision> {
    const authority: AgentInferenceRequest = {
      operation: publicBrowser,
      binding,
      turnId: request.turnId,
      requestId: request.requestId,
      fingerprint: request.fingerprint,
    };
    await requireInferenceAuthority(this.inferenceAuthority, authority);
    const current = (await this.pendingPublicBrowserRequests(binding)).find(
      (candidate) =>
        candidate.fingerprint === request.fingerprint &&
        candidate.requestId === request.requestId &&
        candidate.turnId === request.turnId &&
        candidate.sessionId === request.sessionId
    );
    if (!current) throw new Error('Public browser request is no longer pending');
    // Derive from freshly read provider data, not the caller's copy or untrusted reason text.
    const decision = await publicBrowserDecision(current);
    const action: Action = {
      operation: 'sessions.browser-approval',
      id: binding.sessionId,
      turnId: current.turnId,
      requestId: current.requestId,
      expectedRequestFingerprint: current.fingerprint,
      response: decision.response,
    };
    this.requireOpen();
    await this.platform.apply(
      action,
      { apply: true, allowBillable: true, digest: planAction(this.target, action).digest },
      {
        beforeDispatch: async () => {
          this.requireOpen();
          await requireInferenceAuthority(this.inferenceAuthority, authority);
          await beforeDispatch(decision);
          this.requireOpen();
          await requireInferenceAuthority(this.inferenceAuthority, authority);
        },
      }
    );
    return decision;
  }
  async completeFunction(
    binding: OperatorBinding,
    call: AgentFunctionCall,
    result: AgentFunctionResult
  ): Promise<void> {
    const authority = {
      operation: 'function-result' as const,
      binding,
      turnId: call.turnId,
      callId: call.callId,
      fingerprint: call.fingerprint,
    };
    await requireInferenceAuthority(this.inferenceAuthority, authority);
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
    await this.platform.apply(
      action,
      { apply: true, digest: planAction(this.target, action).digest, allowBillable: true },
      {
        beforeDispatch: async () => {
          this.requireOpen();
          await requireInferenceAuthority(this.inferenceAuthority, authority);
        },
      }
    );
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
      await this.platform.apply(
        action,
        {
          apply: true,
          digest: planAction(this.target, action).digest,
          allowBillable: command.kind !== 'stop',
        },
        {
          beforeDispatch: async () => {
            this.requireOpen();
            if (command.kind !== 'stop')
              await requireInferenceAuthority(this.inferenceAuthority, {
                operation: 'input',
                binding,
                commandId: command.id,
              });
          },
        }
      );
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
    await requireInferenceAuthority(this.inferenceAuthority, {
      operation: 'input',
      binding,
      commandId: command.id,
    });
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
