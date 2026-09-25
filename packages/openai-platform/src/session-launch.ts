import type {
  AgentLaunchPort,
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
  OperatorBinding,
  AgentHostedCredentialFiles,
} from '@headstart-health/workflow-contracts';
import { credentialContentSha256 } from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Target } from './config.js';
import { bindHostedCredentialFiles, credentialFilePaths } from './hosted-credential-files.js';
import { runtimeCredentialBindings } from './hosted-credentials.js';
import { actionSchema, type Action } from './operations.js';
import {
  fingerprint,
  planAction,
  MutationOutcomeUnknownError,
  type OpenAIPlatform,
} from './platform.js';
import { selfHostedExecutorConnection } from './self-hosted.js';
import type { SessionExecutor } from './session-executor.js';
import { visitSessionHistory } from './session-history.js';
import { inspectLaunchCandidate, discoverLaunchCandidates } from './session-recovery.js';

const launchSettings = z
  .object({
    model: z.string().min(1),
    reasoning: z.unknown(),
    environment: z.unknown(),
    mcpServers: z.array(z.unknown()).default([]),
    runtimeCredentials: runtimeCredentialBindings.optional(),
    credentialFiles: credentialFilePaths.optional(),
  })
  .strict();

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const notAttempted = 'not-attempted';
async function retainCredentialProtection(
  action: Extract<Action, { operation: 'sessions.create' }>,
  paths: string[] | undefined,
  retain: AgentSessionCreateOptions['retainCredentialProtection']
): Promise<'validation' | 'credential-protection' | null> {
  if (!paths?.length || action.body.environment.type !== 'openai_hosted') return null;
  if (!retain) return 'validation';
  try {
    await retain({
      contentSha256: (action.body.environment.files ?? []).flatMap((file) =>
        file.type === 'inline' && paths.includes(file.path)
          ? [credentialContentSha256(Buffer.from(file.data, 'base64'))]
          : []
      ),
    });
    return null;
  } catch {
    return 'credential-protection';
  }
}
const receiptSchema = z
  .object({
    sessionId: id,
    target: id,
    workflowRevision: id,
    requestId: z.uuid(),
  })
  .strict();

function creationResult(
  data: unknown,
  request: AgentLaunchRequest,
  target: string
): AgentSessionCreateResult {
  const hint = z
    .object({ id: z.unknown().optional(), _request_id: z.unknown().optional() })
    .safeParse(data);
  const candidateId = id.safeParse(hint.success ? hint.data.id : undefined);
  const requestId = id.safeParse(hint.success ? hint.data._request_id : undefined);
  const providerRequestId = requestId.success ? { providerRequestId: requestId.data } : {};
  const session = z
    .object({
      id,
      metadata: z.object({
        workflow_revision: z.literal(request.workflowRevision),
        launch_request: z.literal(request.requestId),
      }),
    })
    .safeParse(data);
  if (!session.success)
    return {
      status: 'unknown',
      reason: 'invalid-response',
      ...(candidateId.success ? { candidateSessionId: candidateId.data } : {}),
      ...providerRequestId,
    };
  return {
    status: 'created',
    receipt: {
      sessionId: session.data.id,
      target,
      workflowRevision: request.workflowRevision,
      requestId: request.requestId,
    },
    ...providerRequestId,
  };
}

/** Provider settings and native MCP bindings come from protected deployment configuration.
 * The owning application retains launch admission and the durable exactly-once attempt record.
 */
export class SessionLaunchPort implements AgentLaunchPort {
  constructor(
    private readonly platform: Pick<OpenAIPlatform, 'read' | 'apply' | 'preflight'> &
      Partial<Pick<OpenAIPlatform, 'provisionHostedCredentials'>>,
    private readonly target: Target,
    private readonly settings: unknown,
    private readonly billableUntil: number,
    private readonly appFunctions: readonly string[],
    private readonly executor?: SessionExecutor,
    private readonly credentialFiles?: AgentHostedCredentialFiles
  ) {}

  async preflightLaunch(
    request: AgentLaunchRequest,
    descriptors?: AgentSessionCredentialDescriptor[]
  ): Promise<AgentLaunchPreflight> {
    try {
      await this.prepare(request, descriptors, false);
      await this.platform.preflight();
      if (Date.now() >= this.billableUntil) throw new Error('Expired');
      return { target: fingerprint(this.target) };
    } catch {
      throw new Error(
        'Launch preflight failed; no session creation or source credential issuance was requested.'
      );
    }
  }

  async createSession(
    request: AgentLaunchRequest,
    credentials?: AgentSessionCredential[],
    options?: AgentSessionCreateOptions
  ): Promise<AgentSessionCreateResult> {
    if (options?.expectedTarget !== fingerprint(this.target))
      return { status: notAttempted, reason: 'validation' };
    let action: Extract<Action, { operation: 'sessions.create' }>;
    try {
      action = await this.prepare(request, credentials, true);
    } catch {
      return { status: notAttempted, reason: 'validation' };
    }
    const protectionFailure = await retainCredentialProtection(
      action,
      launchSettings.parse(this.settings).credentialFiles,
      options.retainCredentialProtection
    );
    if (protectionFailure) return { status: notAttempted, reason: protectionFailure };
    const runtime = this.runtimeBindings(launchSettings.parse(this.settings), credentials);
    if (runtime.length) {
      if (
        !options.beforeDispatch ||
        !options.retainCredentialVault ||
        !this.platform.provisionHostedCredentials
      )
        return { status: notAttempted, reason: 'validation' };
      try {
        await this.platform.preflight();
        const vaultId = await this.platform.provisionHostedCredentials(
          {
            target: options.expectedTarget,
            requestId: request.requestId,
            workflowRevision: request.workflowRevision,
          },
          runtime.map((binding) => {
            const credential = credentials?.find(
              (value) => value.serverLabel === binding.serverLabel
            );
            if (!credential) throw new Error('Missing runtime credential');
            return {
              name: binding.name,
              host: binding.host,
              authorization: credential.authorization,
            };
          }),
          options.retainCredentialVault,
          options.credentialVault
        );
        action.body.vault_ids = [vaultId];
      } catch {
        return { status: notAttempted, reason: 'preflight' };
      }
    }
    const dispatch: { crossed: boolean; reason: 'preflight' | 'before-dispatch' } = {
      crossed: false,
      reason: 'preflight',
    };
    let data: unknown;
    try {
      const result = await this.platform.apply(
        action,
        {
          apply: true,
          allowBillable: true,
          digest: planAction(this.target, action).digest,
        },
        {
          beforeDispatch: async () => {
            dispatch.reason = 'before-dispatch';
            if (Date.now() >= this.billableUntil) throw new Error('Expired');
            await options.beforeDispatch?.();
            if (Date.now() >= this.billableUntil) throw new Error('Expired');
            dispatch.crossed = true;
          },
        }
      );
      data = result.data;
    } catch (error) {
      if (!dispatch.crossed) return { status: notAttempted, reason: dispatch.reason };
      return {
        status: 'unknown',
        reason: 'provider-outcome',
        ...(error instanceof MutationOutcomeUnknownError && error.providerRequestId
          ? { providerRequestId: error.providerRequestId }
          : {}),
      };
    }
    return creationResult(data, request, options.expectedTarget);
  }

  inspectLaunchCandidate(
    expectedTarget: string,
    sessionId: string
  ): Promise<AgentLaunchCandidateResult> {
    return inspectLaunchCandidate(this.platform, this.target, expectedTarget, sessionId);
  }
  discoverLaunchCandidates(
    identity: AgentLaunchIdentity,
    after?: string
  ): Promise<AgentLaunchCandidatePage> {
    return discoverLaunchCandidates(this.platform, this.target, identity, after);
  }

  private async prepare(
    request: AgentLaunchRequest,
    bindings: AgentSessionCredentialDescriptor[] | undefined,
    includeAuthorization: boolean
  ): Promise<Extract<Action, { operation: 'sessions.create' }>> {
    if (Date.now() >= this.billableUntil) throw new Error('Inference authorization expired');
    z.uuid().parse(request.requestId);
    id.parse(request.workflowRevision);
    const settings = launchSettings.parse(this.settings);
    const functions = request.definition.tools;
    if (
      functions.some(
        (tool) => tool.name !== 'ask_operator' && !this.appFunctions.includes(tool.name)
      )
    )
      throw new Error('Unregistered application function');
    // Validate the same narrow official-SDK surface as supervised use. In particular, settings
    // cannot introduce another function handler or reusable-agent credential configuration.
    const action = actionSchema.parse({
      operation: 'sessions.create',
      body: {
        agent: {
          model: settings.model,
          reasoning: settings.reasoning,
          instructions: request.definition.instructions,
          tools: [
            ...functions,
            ...this.bindCredentials(settings.mcpServers, bindings, includeAuthorization),
          ],
        },
        environment: settings.environment,
        input: request.input,
        metadata: {
          workflow_revision: request.workflowRevision,
          launch_request: request.requestId,
        },
      },
    });
    if (
      action.operation !== 'sessions.create' ||
      !('agent' in action.body) ||
      action.body.agent.tools?.slice(functions.length).some((tool) => tool.type !== 'mcp')
    )
      throw new Error('Only native MCP source bindings are permitted');
    if (action.body.environment.type === 'self_hosted' && !this.executor)
      throw new Error('Self-hosted executor is not configured');
    this.runtimeBindings(settings, bindings);
    const files =
      typeof this.credentialFiles === 'function'
        ? await this.credentialFiles()
        : this.credentialFiles;
    bindHostedCredentialFiles(action, settings.credentialFiles, files);
    return action;
  }

  private runtimeBindings(
    settings: z.infer<typeof launchSettings>,
    credentials?: AgentSessionCredentialDescriptor[]
  ): { name: string; host: string; serverLabel: string }[] {
    if (!settings.runtimeCredentials) return [];
    const environment = z
      .object({
        type: z.literal('openai_hosted'),
        environment_template_id: z.string().optional(),
        env: z.record(z.string(), z.string()).nullish(),
        network: z
          .object({
            access: z.enum(['enabled', 'disabled', 'restricted']),
            allowed_domains: z.array(z.string()).optional(),
          })
          .optional(),
      })
      .parse(settings.environment);
    if (
      environment.environment_template_id &&
      (environment.env === undefined || environment.network === undefined)
    )
      throw new Error(
        'Template runtime credentials require explicit environment and network settings'
      );
    return settings.runtimeCredentials.map((binding) => {
      const credential = credentials?.find((value) => value.serverLabel === binding.serverLabel);
      if (!credential || environment.env?.[binding.environmentVariable] !== undefined)
        throw new Error('Runtime credential configuration mismatch');
      const url = new URL(credential.audience);
      if (
        url.protocol !== 'https:' ||
        (url.port !== '' && url.port !== '443' && url.port !== '8443') ||
        environment.network?.access === 'disabled' ||
        (environment.network?.access === 'restricted' &&
          !environment.network.allowed_domains?.some(
            (domain) =>
              domain === url.hostname ||
              (domain.startsWith('*.') && url.hostname.endsWith(domain.slice(1)))
          ))
      )
        throw new Error('Runtime credential destination unavailable');
      return {
        name: binding.environmentVariable,
        host: url.hostname,
        serverLabel: binding.serverLabel,
      };
    });
  }

  private bindCredentials(
    servers: unknown[],
    credentials: AgentSessionCredentialDescriptor[] | undefined,
    includeAuthorization: boolean
  ): unknown[] {
    if (credentials === undefined) return servers;
    const parsed = z
      .array(
        z
          .object({
            serverLabel: z.string().min(1),
            audience: z.url(),
            authorization: includeAuthorization
              ? z
                  .string()
                  .min(1)
                  .max(16384)
                  .refine((value) => !/[\r\n]/.test(value))
              : z.never().optional(),
            allowedTools: z.array(z.string().min(1)).min(1),
          })
          .strict()
      )
      .parse(credentials);
    if (
      !parsed.length ||
      parsed.length > servers.length ||
      parsed.some(
        (credential) =>
          servers.filter((value) => {
            const server = z.object({ server_label: z.string() }).safeParse(value);
            return server.success && server.data.server_label === credential.serverLabel;
          }).length !== 1
      ) ||
      new Set(parsed.map((item) => item.serverLabel)).size !== parsed.length
    )
      throw new Error('MCP credential binding mismatch');
    return servers.map((value) => {
      const label = z.object({ server_label: z.string() }).parse(value).server_label;
      // Other native MCP connections use their own reviewed deployment binding; a Headstart run
      // credential does not replace them or require every source to share its identity scheme.
      if (!parsed.some((credential) => credential.serverLabel === label)) return value;
      const server = z
        .object({
          type: z.literal('mcp'),
          server_label: z.string(),
          connection_origin: z.literal('service'),
          required: z.literal(true),
          allowed_tools: z.array(z.string()).min(1),
          transport: z.object({ type: z.literal('http'), server_url: z.url() }).strict(),
        })
        .strict()
        .parse(value);
      const credential = parsed.find((item) => item.serverLabel === server.server_label);
      if (
        credential?.audience !== server.transport.server_url ||
        server.allowed_tools.some((tool) => !credential.allowedTools.includes(tool))
      )
        throw new Error('MCP credential target or tool scope mismatch');
      return {
        ...server,
        transport: {
          ...server.transport,
          ...(credential.authorization === undefined
            ? {}
            : { authorization: credential.authorization }),
        },
      };
    });
  }

  async inspectSession(value: AgentSessionReceipt): Promise<OperatorBinding | null> {
    const receipt = receiptSchema.parse(value);
    await this.session(receipt);
    const checkpoint: { rootId: string | null } = { rootId: null };
    const schema = z.array(
      z.object({
        id,
        session_id: z.literal(receipt.sessionId),
        subagent_id: z.string().nullable(),
      })
    );
    await visitSessionHistory(this.platform, receipt.sessionId, 'sessions.turns', (data) => {
      for (const turn of schema.parse(data)) {
        if (turn.subagent_id !== null) continue;
        if (checkpoint.rootId !== null)
          throw new Error('Unbound session has unexpected additional roots');
        checkpoint.rootId = turn.id;
      }
    });
    return checkpoint.rootId
      ? {
          sessionId: receipt.sessionId,
          turnId: checkpoint.rootId,
          target: receipt.target,
          workflowRevision: receipt.workflowRevision,
        }
      : null;
  }
  private async session(value: AgentSessionReceipt): Promise<unknown> {
    const receipt = receiptSchema.parse(value);
    if (receipt.target !== fingerprint(this.target)) throw new Error('Wrong launch target');
    const session = await this.platform.read({ operation: 'sessions.get', id: receipt.sessionId });
    z.object({
      id: z.literal(receipt.sessionId),
      metadata: z.object({
        workflow_revision: z.literal(receipt.workflowRevision),
        launch_request: z.literal(receipt.requestId),
      }),
    }).parse(session.data);
    return session.data;
  }
  async cancelSession(receipt: AgentSessionReceipt): Promise<void> {
    try {
      if (this.quiescent(await this.session(receipt))) return;
      const action = { operation: 'sessions.cancel' as const, id: receipt.sessionId };
      await this.platform.apply(action, {
        apply: true,
        allowBillable: false,
        digest: planAction(this.target, action).digest,
      });
      // Event acceptance is not observed termination. One fresh read per reconciliation attempt;
      // the owning application retains no-input intent and schedules any further cleanup.
      if (this.quiescent(await this.session(receipt))) return;
    } catch {
      // Neither provider failures nor malformed/mismatched evidence establish safe release.
    }
    throw new Error('Session quiescence is unconfirmed; retain cleanup intent and reconcile.');
  }
  private quiescent(value: unknown): boolean {
    const status = z
      .object({ status: z.enum(['idle', 'failed', 'in_progress', 'requires_action']) })
      .parse(value).status;
    return status === 'idle' || status === 'failed';
  }

  async reconcileEnvironment(
    receipt: AgentSessionReceipt,
    action: 'start' | 'reconcile' | 'stop'
  ): Promise<void> {
    // Stop can operate on the exact locally owned compute even if the provider is unavailable.
    const parsed = receiptSchema.parse(receipt);
    if (parsed.target !== fingerprint(this.target)) throw new Error('Wrong launch target');
    if (action === 'stop' || Date.now() >= this.billableUntil) {
      await this.executor?.stop(parsed.sessionId);
      if (action !== 'stop') throw new Error('Executor authority expired');
      return;
    }
    const raw = await this.session(parsed);
    const session = z
      .object({
        status: z.string(),
        environment: z.object({ type: z.string() }),
        required_actions: z.array(z.object({ type: z.string() })).default([]),
      })
      .parse(raw);
    if (['failed', 'cancelled'].includes(session.status)) {
      await this.executor?.stop(parsed.sessionId);
      return;
    }
    if (session.environment.type !== 'self_hosted') return;
    if (!this.executor) throw new Error('Self-hosted executor is not configured');
    if (
      action === 'start' ||
      session.required_actions.some((item) => item.type === 'environment_connection')
    ) {
      await this.executor.ensure(
        selfHostedExecutorConnection(raw, parsed.sessionId),
        this.billableUntil
      );
    }
  }
}
