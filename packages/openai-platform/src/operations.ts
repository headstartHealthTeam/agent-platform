import type { AgentUpdateParams } from 'openai/resources/beta/agents/agents';
import { z } from 'zod';

const reasoning = z
  .object({
    effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
    summary: z.enum(['auto', 'concise', 'detailed']).nullable().optional(),
  })
  .strict()
  .transform((value) => ({
    effort: value.effort,
    ...(value.summary === undefined ? {} : { summary: value.summary }),
  }));
const tools = z.array(
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('web_search') }).strict(),
    z.object({ type: z.literal('tool_search') }).strict(),
    z
      .object({
        type: z.literal('function'),
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.string(), z.unknown()),
      })
      .strict(),
    z
      .object({
        type: z.literal('mcp'),
        server_label: z.string(),
        transport: z
          .object({
            type: z.literal('http'),
            server_url: z.url().refine((url) => new URL(url).protocol === 'https:'),
          })
          .strict(),
        allowed_tools: z.array(z.string()),
        required: z.boolean(),
      })
      .strict(),
  ])
);

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/);
const model = z.string().min(1).max(200);
const metadata = z
  .record(z.string().max(64), z.string().max(512))
  .refine((value) => Object.keys(value).length <= 16);
const agentFields = {
  name: z.string().max(256).nullable().optional(),
  instructions: z.string().max(100_000).nullable().optional(),
  metadata: metadata.nullable().optional(),
  reasoning: reasoning.nullable().optional(),
  tools: tools.nullable().optional(),
};
const agentObject = z.object({ model, ...agentFields }).strict();
type AgentFields = z.infer<typeof agentObject>;
function optionalAgentFields(value: Omit<AgentFields, 'model'>): Omit<AgentUpdateParams, 'model'> {
  return {
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.instructions === undefined ? {} : { instructions: value.instructions }),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
    ...(value.reasoning === undefined ? {} : { reasoning: value.reasoning }),
    ...(value.tools === undefined ? {} : { tools: value.tools }),
  };
}
const agentCreate = agentObject.transform((value) => ({
  model: value.model,
  ...optionalAgentFields(value),
}));
const agentUpdate = agentObject
  .partial()
  .refine((value) => Object.keys(value).length > 0)
  .transform((value) => ({
    ...optionalAgentFields(value),
    ...(value.model === undefined ? {} : { model: value.model }),
  }));
const network = z
  .object({
    access: z.enum(['enabled', 'disabled', 'restricted']),
    allowed_domains: z.array(z.string()).optional(),
  })
  .strict()
  .transform((value) => ({
    access: value.access,
    ...(value.allowed_domains === undefined ? {} : { allowed_domains: value.allowed_domains }),
  }));
const inlineSkill = z
  .object({
    type: z.literal('inline'),
    name: z.string(),
    description: z.string(),
    source: z
      .object({
        type: z.literal('base64'),
        media_type: z.literal('application/zip'),
        data: z.string().min(1).max(10_000_000),
      })
      .strict(),
  })
  .strict();
const template = z
  .object({
    name: z.string().nullable().optional(),
    network: network.optional(),
    skills: z.array(inlineSkill).optional(),
  })
  .strict()
  .transform((value) => ({
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.network === undefined ? {} : { network: value.network }),
    ...(value.skills === undefined ? {} : { skills: value.skills }),
  }));
const environment = z.union([
  z.object({ type: z.literal('none') }).strict(),
  z
    .object({
      type: z.literal('self_hosted'),
      workspace_directory: z
        .string()
        .min(2)
        .max(4096)
        .refine(
          (value) =>
            value.startsWith('/') &&
            !value.includes('\\') &&
            !/\p{Cc}/u.test(value) &&
            value
              .split('/')
              .slice(1)
              .every((part) => part !== '' && part !== '.' && part !== '..')
        ),
    })
    .strict(),
  z
    .object({
      type: z.literal('openai_hosted'),
      environment_template_id: id.optional(),
      network: network.optional(),
    })
    .strict()
    .transform((value) => ({
      type: value.type,
      ...(value.environment_template_id === undefined
        ? {}
        : { environment_template_id: value.environment_template_id }),
      ...(value.network === undefined ? {} : { network: value.network }),
    })),
]);
// Keep the supervised surface explicit: use one saved agent OR one inline configuration.
// Overrides, capability-directory mounts and environment credentials are not accepted here.
const sessionAgent = z
  .object({
    model,
    instructions: z.string().max(100_000).optional(),
    reasoning: reasoning.optional(),
    tools: tools.optional(),
  })
  .strict()
  .transform((value) => ({
    model: value.model,
    ...(value.instructions === undefined ? {} : { instructions: value.instructions }),
    ...(value.reasoning === undefined ? {} : { reasoning: value.reasoning }),
    ...(value.tools === undefined ? {} : { tools: value.tools }),
  }));
const sessionFields = {
  environment,
  input: z.string().min(1).max(100_000).optional(),
  metadata: metadata.default({}),
};
const sessionCreate = z
  .union([
    z.object({ agent_id: id, ...sessionFields }).strict(),
    z.object({ agent: sessionAgent, ...sessionFields }).strict(),
  ])
  .refine((value) => value.environment.type !== 'none' || value.input !== undefined)
  .transform(({ input, ...value }) => ({
    ...value,
    ...(input === undefined ? {} : { input }),
  }));
const query = z
  .object({ limit: z.number().int().min(1).max(100).default(20), after: id.optional() })
  .strict()
  .default({ limit: 20 })
  .transform((value) => ({
    limit: value.limit,
    ...(value.after === undefined ? {} : { after: value.after }),
  }));
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const readSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('models.list') }).strict(),
  z.object({ operation: z.literal('agents.list'), query }).strict(),
  z.object({ operation: z.literal('agents.get'), id }).strict(),
  z.object({ operation: z.literal('sessions.list'), query }).strict(),
  z.object({ operation: z.literal('sessions.get'), id }).strict(),
  z.object({ operation: z.literal('sessions.turns'), id, query }).strict(),
  z.object({ operation: z.literal('sessions.items'), id, query }).strict(),
  z.object({ operation: z.literal('templates.list'), query }).strict(),
  z.object({ operation: z.literal('templates.get'), id }).strict(),
]);
export const actionSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('agents.create'), body: agentCreate }).strict(),
  z
    .object({
      operation: z.literal('agents.update'),
      id,
      expectedFingerprint: fingerprint,
      body: agentUpdate,
    })
    .strict(),
  z
    .object({ operation: z.literal('agents.delete'), id, expectedFingerprint: fingerprint })
    .strict(),
  z
    .object({
      operation: z.literal('sessions.create'),
      body: sessionCreate,
    })
    .strict(),
  z
    .object({
      operation: z.literal('sessions.send'),
      id,
      input: z.string().min(1).max(100_000),
      idempotencyKey: id,
    })
    .strict(),
  z.object({ operation: z.literal('sessions.cancel'), id }).strict(),
  z.object({ operation: z.literal('sessions.delete'), id }).strict(),
  z.object({ operation: z.literal('templates.create'), body: template }).strict(),
  z
    .object({
      operation: z.literal('templates.update'),
      id,
      expectedFingerprint: fingerprint,
      body: template,
    })
    .strict(),
  z
    .object({ operation: z.literal('templates.delete'), id, expectedFingerprint: fingerprint })
    .strict(),
]);
export type ReadOperation = z.infer<typeof readSchema>;
export type Action = z.infer<typeof actionSchema>;
export function parseAction(input: unknown): Action {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Invalid or unsupported OpenAI action; check the documented action contract.');
  }
  return parsed.data;
}
export function isBillable(action: Action): boolean {
  return action.operation === 'sessions.create' || action.operation === 'sessions.send';
}
