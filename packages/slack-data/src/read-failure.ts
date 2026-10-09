import { z } from 'zod';

export interface SlackFailureMetadata {
  readonly status: number | null;
  readonly retryMs: number;
  readonly failed: boolean;
}
const envelopeSchema = z.object({
  status: z.unknown().optional(),
  statusCode: z.unknown().optional(),
  structuredContent: z.unknown().optional(),
  content: z.unknown().optional(),
  error: z.unknown().optional(),
  error_code: z.unknown().optional(),
  isError: z.unknown().optional(),
  ok: z.unknown().optional(),
  headers: z.unknown().optional(),
  retryAfter: z.unknown().optional(),
  retryAfterMs: z.unknown().optional(),
});
type Envelope = z.infer<typeof envelopeSchema>;
function envelope(value: unknown): Envelope {
  return envelopeSchema.safeParse(value).data ?? {};
}
function envelopes(root: Envelope): Envelope[] {
  const result = [root, envelope(root.structuredContent)];
  const content = z
    .tuple([z.object({ type: z.literal('text'), text: z.string() })])
    .safeParse(root.content);
  if (content.success) {
    try {
      const value: unknown = JSON.parse(content.data[0].text);
      result.push(envelope(value));
    } catch {
      // Non-JSON native text does not constitute a success/failure receipt.
    }
  }
  return result;
}
function hasHeaderGetter(value: unknown): value is { get: (name: string) => unknown } {
  return (
    typeof value === 'object' && value !== null && 'get' in value && typeof value.get === 'function'
  );
}
function retryDelay(root: Envelope, now: number): number {
  const retryAfter =
    (hasHeaderGetter(root.headers) ? root.headers.get('retry-after') : undefined) ??
    root.retryAfter;
  const parts = typeof retryAfter === 'string' ? retryAfter.trim().split('.') : [];
  const numeric =
    parts.length >= 1 && parts.length <= 2 && parts.every((part) => /^\d+$/.test(part));
  const seconds = numeric
    ? Number(retryAfter) * 1000
    : typeof retryAfter === 'string'
      ? Date.parse(retryAfter) - now
      : 0;
  return Math.max(
    typeof root.retryAfterMs === 'number' && Number.isFinite(root.retryAfterMs)
      ? root.retryAfterMs
      : 0,
    Number.isFinite(seconds) ? seconds : 0
  );
}
/** Provider metadata only; consumers own retries, pacing, budgets and durable recovery. */
export function slackReadFailureMetadata(value: unknown, now = Date.now()): SlackFailureMetadata {
  try {
    const root = envelope(value);
    const values = envelopes(root);
    const status =
      values
        .flatMap((item) => [item.status, item.statusCode])
        .find(
          (candidate): candidate is number =>
            typeof candidate === 'number' &&
            Number.isInteger(candidate) &&
            candidate >= 400 &&
            candidate <= 599
        ) ??
      (values.some((item) =>
        [item.error, item.error_code].some(
          (code) => code === 'ratelimited' || code === 'rate_limited'
        )
      )
        ? 429
        : null);
    return {
      status,
      retryMs: retryDelay(root, now),
      failed: values.some(
        (item) => item.isError === true || item.ok === false || Boolean(item.error)
      ),
    };
  } catch {
    // A property accessor is untrusted provider behavior; never propagate its content or cause.
    return { status: null, retryMs: 0, failed: true };
  }
}
