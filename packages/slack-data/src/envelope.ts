import { z } from 'zod';

export const slackEnvelopeSchema = z.looseObject({
  ok: z.unknown().optional(),
  blocked: z.unknown().optional(),
  isError: z.unknown().optional(),
  error: z.unknown().optional(),
  paginationComplete: z.unknown().optional(),
  truncated: z.unknown().optional(),
  has_more: z.unknown().optional(),
  next_cursor: z.unknown().optional(),
  response_metadata: z.unknown().optional(),
  text: z.unknown().optional(),
  messageTs: z.unknown().optional(),
  messages: z.unknown().optional(),
  results: z.unknown().optional(),
  pagination_info: z.unknown().optional(),
  content: z.unknown().optional(),
});
export type SlackEnvelope = z.infer<typeof slackEnvelopeSchema>;

export function slackEnvelope(value: unknown): SlackEnvelope {
  return slackEnvelopeSchema.safeParse(value).data ?? {};
}

export function hasSlackContinuation(value: SlackEnvelope): boolean {
  return (
    value.has_more === true ||
    Boolean(value.next_cursor) ||
    Boolean(slackEnvelope(value.response_metadata).next_cursor)
  );
}

export function failedSlackEnvelope(value: SlackEnvelope, truthyErrorFlag = false): boolean {
  return (
    value.ok === false ||
    Boolean(value.blocked) ||
    (truthyErrorFlag ? Boolean(value.isError) : value.isError === true) ||
    Boolean(value.error) ||
    value.paginationComplete === false ||
    value.truncated === true
  );
}

export class SlackResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackResponseError';
  }
}

export function assertSlackSearchSuccess(value: unknown): asserts value is SlackEnvelope {
  const parsed = slackEnvelopeSchema.safeParse(value);
  if (!parsed.success || failedSlackEnvelope(parsed.data)) {
    throw new SlackResponseError('Slack search response is failed or incomplete');
  }
}

/** Decode transport only; callers retain the original capture for provenance. */
export function unwrapSlackSearchResponse(response: unknown): SlackEnvelope {
  assertSlackSearchSuccess(response);
  if (!Object.hasOwn(response, 'content')) return response;
  const content = z
    .tuple([z.object({ type: z.literal('text'), text: z.string() })])
    .safeParse(response.content);
  if (Object.hasOwn(response, 'structuredContent') || !content.success) {
    throw new SlackResponseError('Slack search transport is ambiguous or unsupported');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(content.data[0].text);
  } catch {
    throw new SlackResponseError('Slack search transport is not complete JSON');
  }
  assertSlackSearchSuccess(decoded);
  return decoded;
}
