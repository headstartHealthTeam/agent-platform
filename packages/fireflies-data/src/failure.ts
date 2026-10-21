import { z } from 'zod';

export type FirefliesFailureCode =
  'FIREFLIES_RATE_LIMITED' | 'FIREFLIES_READ_FAILED' | 'FIREFLIES_BODY_CAPTURE_FAILED';

export class FirefliesReadError extends Error {
  readonly code: FirefliesFailureCode;
  readonly status: number | null;
  readonly retryAfterMs: number;

  constructor(options: {
    readonly code: FirefliesFailureCode;
    readonly status?: number | null;
    readonly retryAfterMs?: number;
  }) {
    super(options.code);
    this.name = 'FirefliesReadError';
    this.code = options.code;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? 0;
  }
}

const envelopeSchema = z.looseObject({
  status: z.unknown().optional(),
  statusCode: z.unknown().optional(),
  code: z.unknown().optional(),
  error_code: z.unknown().optional(),
  error: z.unknown().optional(),
  errors: z.unknown().optional(),
  isError: z.unknown().optional(),
  ok: z.unknown().optional(),
  message: z.unknown().optional(),
  headers: z.unknown().optional(),
  retryAfter: z.unknown().optional(),
  retry_after: z.unknown().optional(),
  retryAfterMs: z.unknown().optional(),
  structuredContent: z.unknown().optional(),
  content: z.unknown().optional(),
});
type Envelope = z.infer<typeof envelopeSchema>;

function envelope(value: unknown): Envelope {
  return envelopeSchema.safeParse(value).data ?? {};
}

function responseText(value: unknown): string {
  const parsed = z
    .tuple([z.object({ type: z.literal('text'), text: z.string() })])
    .safeParse(value);
  return parsed.success ? parsed.data[0].text : '';
}

function errorEnvelopes(value: unknown, text: string): Envelope[] {
  const root = envelope(value);
  const result = [root, envelope(root.structuredContent)];
  try {
    const parsed: unknown = JSON.parse(text);
    result.push(envelope(parsed));
  } catch {
    // Native success responses are rendered text, not JSON.
  }
  return [
    ...result,
    ...result.flatMap((item) => (Array.isArray(item.errors) ? item.errors.map(envelope) : [])),
  ];
}

function statusCode(values: readonly Envelope[]): number | null {
  const candidates = values.flatMap((item) => {
    const nested = envelope(item.error);
    return [item.status, item.statusCode, nested.status, nested.code];
  });
  for (const candidate of candidates) {
    const value =
      typeof candidate === 'string' || typeof candidate === 'number' ? Number(candidate) : NaN;
    if (Number.isInteger(value) && value >= 400 && value <= 599) return value;
  }
  return null;
}

function explicitFailure(item: Envelope): boolean {
  return (
    item.isError === true ||
    item.ok === false ||
    Boolean(item.error) ||
    (Array.isArray(item.errors) && item.errors.length > 0)
  );
}

function quotaCode(item: Envelope): boolean {
  return [item.code, item.error_code, envelope(item.error).code, item.error].some(
    (code) =>
      typeof code === 'string' &&
      /^(?:rate_?limit(?:ed|_exceeded)?|too_many_requests|quota_exceeded)$/i.test(code)
  );
}

function message(item: Envelope): string {
  const value = envelope(item.error).message ?? item.message;
  return typeof value === 'string' ? value : '';
}

function milliseconds(value: unknown, now: number): number {
  if (typeof value === 'number') return value * 1000;
  if (typeof value !== 'string') return 0;
  const parts = value.trim().split('.');
  const numeric = parts.length <= 2 && parts.every((part) => /^\d+$/.test(part));
  return numeric ? Number(value) * 1000 : Date.parse(value) - now;
}

function retryDelay(item: Envelope, now: number): number {
  const headers =
    item.headers instanceof Headers
      ? item.headers.get('retry-after')
      : envelope(item.headers)['retry-after'];
  const delay = milliseconds(headers ?? item.retryAfter ?? item.retry_after, now);
  const direct =
    typeof item.retryAfterMs === 'number' && Number.isFinite(item.retryAfterMs)
      ? item.retryAfterMs
      : 0;
  return Math.max(0, Number.isFinite(delay) ? delay : 0, direct);
}

/** Classify provider envelopes, never a quota phrase embedded in a transcript. */
export function firefliesReadFailure(value: unknown, now = Date.now()): FirefliesReadError | null {
  const text = responseText(envelope(value).content);
  const values = errorEnvelopes(value, text);
  const status = statusCode(values);
  const failed = value instanceof Error || status !== null || values.some(explicitFailure);
  const nativeError = /^(?:Error\b|Too many requests\b|Rate limit(?:ed| exceeded)\b)/i.test(
    text.trim()
  );
  const failureText = [text, ...values.map(message)].join(' ');
  const quota =
    status === 429 ||
    values.some(quotaCode) ||
    ((failed || nativeError) &&
      /\b(?:429|rate[- ]limit|too many requests|quota)\b/i.test(failureText));
  if (!failed && !nativeError && !quota) return null;
  return new FirefliesReadError({
    code: quota ? 'FIREFLIES_RATE_LIMITED' : 'FIREFLIES_READ_FAILED',
    status: quota ? 429 : status,
    retryAfterMs: Math.max(0, ...values.map((item) => retryDelay(item, now))),
  });
}
