import { z } from 'zod';

import { workflowIdentifierSchema, workflowVersionSchema } from './manifest.js';

const workflowReferenceSchema = z
  .object({
    id: workflowIdentifierSchema,
    version: workflowVersionSchema,
    repositoryCommit: z.string().regex(/^[a-f0-9]{40}$/),
  })
  .strict();

export const workflowRunRequestSchema = z
  .object({
    runId: z.uuid(),
    workflow: workflowReferenceSchema,
    trigger: z
      .object({
        type: z.enum(['manual', 'schedule', 'event']),
        idempotencyKey: z.string().min(1),
        requestedBy: z.string().min(1),
      })
      .strict(),
    requestedAt: z.iso.datetime(),
    input: z.unknown(),
  })
  .strict();

export const workflowRunStatusSchema = z.enum([
  'queued',
  'running',
  'awaiting-approval',
  'succeeded',
  'failed',
  'cancelled',
]);

export const workflowRunResultSchema = z
  .object({
    runId: z.uuid(),
    workflow: workflowReferenceSchema,
    status: workflowRunStatusSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().optional(),
    output: z.unknown().optional(),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        retryable: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((result, context) => {
    const terminal = ['succeeded', 'failed', 'cancelled'].includes(result.status);
    if (terminal && result.completedAt === undefined) {
      context.addIssue({
        code: 'custom',
        message: `${result.status} results require completedAt`,
        path: ['completedAt'],
      });
    }
    if (!terminal && result.completedAt !== undefined) {
      context.addIssue({
        code: 'custom',
        message: `${result.status} results cannot have completedAt`,
        path: ['completedAt'],
      });
    }
    if (result.status === 'succeeded' && result.output === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'succeeded results require output',
        path: ['output'],
      });
    }
    if (result.status === 'failed' && result.error === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'failed results require error details',
        path: ['error'],
      });
    }
    if (result.status !== 'failed' && result.error !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'only failed results may contain error details',
        path: ['error'],
      });
    }
  });

export type WorkflowRunRequest = z.infer<typeof workflowRunRequestSchema>;
export type WorkflowRunResult = z.infer<typeof workflowRunResultSchema>;
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;

export const parseWorkflowRunRequest = (value: unknown): WorkflowRunRequest =>
  workflowRunRequestSchema.parse(value);
