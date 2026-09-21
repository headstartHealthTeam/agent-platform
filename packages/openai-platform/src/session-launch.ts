import type {
  AgentLaunchPort,
  AgentLaunchRequest,
  AgentSessionReceipt,
  AgentSessionCredential,
  OperatorBinding,
} from '@headstart-health/workflow-contracts';
import { z } from 'zod';

import type { Target } from './config.js';
import type { SessionExecutor } from './docker-executor.js';
import { actionSchema } from './operations.js';
import { fingerprint, planAction, type OpenAIPlatform } from './platform.js';
import { selfHostedExecutorConnection } from './self-hosted.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const receiptSchema = z
  .object({
    sessionId: id,
    target: id,
    workflowRevision: id,
    requestId: z.uuid(),
  })
  .strict();

/** Provider settings and native MCP bindings come from protected deployment configuration.
 * The owning application retains launch admission and the durable exactly-once attempt record.
 */
export class SessionLaunchPort implements AgentLaunchPort {
  constructor(
    private readonly platform: Pick<OpenAIPlatform, 'read' | 'apply'>,
    private readonly target: Target,
    private readonly settings: unknown,
    private readonly billableUntil: number,
    private readonly appFunctions: readonly string[],
    private readonly executor?: SessionExecutor
  ) {}

  async createSession(
    request: AgentLaunchRequest,
    credentials?: AgentSessionCredential[]
  ): Promise<AgentSessionReceipt> {
    if (Date.now() >= this.billableUntil) throw new Error('Inference authorization expired');
    z.uuid().parse(request.requestId);
    id.parse(request.workflowRevision);
    const settings = z
      .object({
        model: z.string().min(1),
        reasoning: z.unknown(),
        environment: z.unknown(),
        mcpServers: z.array(z.unknown()).default([]),
      })
      .strict()
      .parse(this.settings);
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
          tools: [...functions, ...this.bindCredentials(settings.mcpServers, credentials)],
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
    const result = await this.platform.apply(action, {
      apply: true,
      allowBillable: true,
      digest: planAction(this.target, action).digest,
    });
    const session = z
      .object({
        id,
        metadata: z.object({
          workflow_revision: z.literal(request.workflowRevision),
          launch_request: z.literal(request.requestId),
        }),
      })
      .parse(result.data);
    return {
      sessionId: session.id,
      target: fingerprint(this.target),
      workflowRevision: request.workflowRevision,
      requestId: request.requestId,
    };
  }

  private bindCredentials(servers: unknown[], credentials?: AgentSessionCredential[]): unknown[] {
    if (credentials === undefined) return servers;
    const parsed = z
      .array(
        z
          .object({
            serverLabel: z.string().min(1),
            audience: z.url(),
            authorization: z
              .string()
              .min(1)
              .max(16384)
              .refine((value) => !/[\r\n]/.test(value)),
            allowedTools: z.array(z.string().min(1)).min(1),
          })
          .strict()
      )
      .parse(credentials);
    if (
      parsed.length !== servers.length ||
      new Set(parsed.map((item) => item.serverLabel)).size !== parsed.length
    )
      throw new Error('MCP credential binding mismatch');
    return servers.map((value) => {
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
        transport: { ...server.transport, authorization: credential.authorization },
      };
    });
  }

  async inspectSession(value: AgentSessionReceipt): Promise<OperatorBinding | null> {
    const receipt = receiptSchema.parse(value);
    await this.session(receipt);
    const result = await this.platform.read({
      operation: 'sessions.turns',
      id: receipt.sessionId,
      query: { limit: 100, order: 'asc' },
    });
    const page = z
      .object({
        data: z
          .array(
            z.object({
              id,
              session_id: z.literal(receipt.sessionId),
              subagent_id: z.string().nullable(),
            })
          )
          .max(100),
        has_more: z.literal(false),
      })
      .parse(result.data);
    const roots = page.data.filter((turn) => turn.subagent_id === null);
    if (roots.length > 1) throw new Error('Unbound session has unexpected additional roots');
    const root = roots[0];
    return root
      ? {
          sessionId: receipt.sessionId,
          turnId: root.id,
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
    await this.session(receipt);
    const action = { operation: 'sessions.cancel' as const, id: receipt.sessionId };
    await this.platform.apply(action, {
      apply: true,
      allowBillable: false,
      digest: planAction(this.target, action).digest,
    });
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
