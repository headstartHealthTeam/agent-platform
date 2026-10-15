import { z } from 'zod';

type JsonValue = z.infer<ReturnType<typeof z.json>>;
export interface StructuredResponseRequest {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly schema: Readonly<Record<string, JsonValue>>;
  readonly schemaName: string;
  readonly reasoningEffort: string;
  readonly signal?: AbortSignal;
}
export interface StructuredResponseResult {
  readonly data: JsonValue;
  readonly usage: JsonValue | null;
  readonly responseId: string | null;
  readonly model: string;
}
export type StructuredResponsesClient = (
  request: StructuredResponseRequest
) => Promise<StructuredResponseResult>;

export class StructuredResponseError extends Error {
  readonly status: number | null;
  readonly retryAfterMs: number;
  constructor(message: string, status: number | null = null, retryAfterMs = 0) {
    super(message);
    this.name = 'StructuredResponseError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const requestSchema = z.object({
  model: z.string().min(1),
  instructions: z.string(),
  input: z.string(),
  schema: z.record(z.string(), z.json()),
  schemaName: z.string().min(1),
  reasoningEffort: z.string().min(1),
});
const responseSchema = z.object({
  output_text: z.string().optional(),
  output: z
    .array(
      z.object({
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      })
    )
    .optional(),
  usage: z.json().nullish(),
  id: z.string().nullish(),
  model: z.string().nullish(),
});

function retryDelay(header: string | null, now: number): number {
  if (header === null) return 0;
  const parts = header.split('.');
  const numeric = parts.length <= 2 && parts.every((part) => /^\d+$/.test(part));
  const delay = numeric ? Number(header) * 1000 : Date.parse(header) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

function decodeResponse(value: unknown, model: string): StructuredResponseResult {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success)
    throw new StructuredResponseError('OpenAI structured response envelope is invalid.');
  const payload = parsed.data;
  const text =
    payload.output_text !== undefined && payload.output_text.length > 0
      ? payload.output_text
      : (payload.output ?? [])
          .flatMap((item) => item.content ?? [])
          .filter((item) => item.type === 'output_text')
          .map((item) => item.text ?? '')
          .join('');
  if (!text)
    throw new StructuredResponseError('OpenAI structured response returned no output text.');
  let data: JsonValue;
  try {
    const decoded: unknown = JSON.parse(text);
    data = z.json().parse(decoded);
  } catch {
    throw new StructuredResponseError('OpenAI structured response output is not valid JSON.');
  }
  return {
    data,
    usage: payload.usage ?? null,
    responseId: payload.id ?? null,
    model: payload.model ?? model,
  };
}

/** Isolated data-plane entry point: no environment credentials or Agents lifecycle preflight. */
export function createStructuredResponsesClient(options: {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}): StructuredResponsesClient {
  if (!options.apiKey)
    throw new StructuredResponseError('An explicit OpenAI credential is required.');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  return async (request: StructuredResponseRequest): Promise<StructuredResponseResult> => {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) throw new StructuredResponseError('OpenAI structured request is invalid.');
    const input = parsed.data;
    let response: Response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        redirect: 'error',
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: input.model,
          store: false,
          instructions: input.instructions,
          input: input.input,
          reasoning: { effort: input.reasoningEffort },
          text: {
            format: {
              type: 'json_schema',
              name: input.schemaName,
              strict: true,
              schema: input.schema,
            },
          },
        }),
      });
    } catch {
      throw new StructuredResponseError('OpenAI structured request failed before a response.');
    }
    if (!response.ok) {
      throw new StructuredResponseError(
        `OpenAI structured request failed (HTTP ${String(response.status)}).`,
        response.status,
        retryDelay(response.headers.get('retry-after'), now())
      );
    }
    const payload: unknown = await response.json().catch(() => null);
    return decodeResponse(payload, input.model);
  };
}
