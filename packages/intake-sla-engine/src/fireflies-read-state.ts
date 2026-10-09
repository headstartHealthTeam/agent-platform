import { FirefliesReadError } from '@headstart-health/fireflies-data';
import { z } from 'zod';

import { requireContract } from './connector-checkpoint.js';

const failureSchema = z.looseObject({
  code: z.enum([
    'FIREFLIES_RATE_LIMITED',
    'FIREFLIES_READ_FAILED',
    'FIREFLIES_BODY_CAPTURE_FAILED',
  ]),
  status: z.number().int().min(400).max(599).nullable(),
  retryAt: z.number(),
});
export function transientFirefliesStatus(status: number | null): boolean {
  return status === 429 || (status !== null && status >= 500 && status <= 599);
}
const stateSchema = z.looseObject({
  version: z.literal(1),
  manifestHash: z.string(),
  attempts: z.record(
    z.string().regex(/^(fireflies_fetch|fireflies_get_transcript):\d+$/),
    z.number().int().min(1).max(2)
  ),
  nextReadAt: z.number(),
  providerPause: failureSchema.refine((value) => transientFirefliesStatus(value.status)).nullable(),
  failure: failureSchema.extend({ index: z.number().int().nonnegative() }).nullable(),
});
export type FirefliesReadState = z.infer<typeof stateSchema>;
export function readFirefliesState(input: unknown, manifestHash: string): FirefliesReadState {
  if (input === undefined)
    return {
      version: 1,
      manifestHash,
      attempts: {},
      failure: null,
      providerPause: null,
      nextReadAt: 0,
    };
  const parsed = stateSchema.safeParse(input);
  requireContract(
    parsed.success && parsed.data.manifestHash === manifestHash,
    'Invalid Fireflies reader state'
  );
  return parsed.data;
}
export function checkFirefliesPause(state: FirefliesReadState, now: number): void {
  const pause = state.providerPause;
  if (pause !== null && now < pause.retryAt)
    throw new FirefliesReadError({
      code: pause.code,
      status: pause.status,
      retryAfterMs: pause.retryAt - now,
    });
  const failure = state.failure;
  if (failure !== null && (!transientFirefliesStatus(failure.status) || now < failure.retryAt))
    throw new FirefliesReadError({
      code: failure.code,
      status: failure.status,
      retryAfterMs: Math.max(0, failure.retryAt - now),
    });
}
