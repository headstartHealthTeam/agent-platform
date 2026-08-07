import { describe, expect, it } from 'vitest';

import {
  parseWorkflowRunRequest,
  workflowRunRequestSchema,
  workflowRunResultSchema,
} from './run.js';

const workflow = {
  id: 'synthetic-read-only-example',
  version: '0.1.0',
  repositoryCommit: 'a'.repeat(40),
};

describe('workflow run contracts', () => {
  it('accepts a durable run request with an idempotency key', () => {
    const request = workflowRunRequestSchema.parse({
      runId: '9c3a3491-b6af-4778-b546-c46f8088dd68',
      workflow,
      trigger: {
        type: 'manual',
        idempotencyKey: 'synthetic-run-001',
        requestedBy: 'synthetic-reviewer',
      },
      requestedAt: '2026-08-07T12:00:00.000Z',
      input: { subject: 'Synthetic example' },
    });

    expect(request.trigger.idempotencyKey).toBe('synthetic-run-001');
  });

  it('accepts a terminal failure without requiring an output', () => {
    const result = workflowRunResultSchema.parse({
      runId: '9c3a3491-b6af-4778-b546-c46f8088dd68',
      workflow,
      status: 'failed',
      startedAt: '2026-08-07T12:00:00.000Z',
      completedAt: '2026-08-07T12:00:05.000Z',
      error: { code: 'EXECUTION_FAILED', message: 'Synthetic failure', retryable: false },
    });

    expect(result.status).toBe('failed');
  });

  it('fails closed when parsing an invalid durable run request', () => {
    expect(() => parseWorkflowRunRequest({ runId: 'not-a-uuid' })).toThrow();
  });

  it('rejects a succeeded result without completion metadata and output', () => {
    expect(() =>
      workflowRunResultSchema.parse({
        runId: '9c3a3491-b6af-4778-b546-c46f8088dd68',
        workflow,
        status: 'succeeded',
        startedAt: '2026-08-07T12:00:00.000Z',
      })
    ).toThrow(/require completedAt/);
  });

  it('rejects a failed result without error details', () => {
    expect(() =>
      workflowRunResultSchema.parse({
        runId: '9c3a3491-b6af-4778-b546-c46f8088dd68',
        workflow,
        status: 'failed',
        startedAt: '2026-08-07T12:00:00.000Z',
        completedAt: '2026-08-07T12:00:05.000Z',
      })
    ).toThrow(/require error details/);
  });

  it('rejects completion metadata on a nonterminal result', () => {
    expect(() =>
      workflowRunResultSchema.parse({
        runId: '9c3a3491-b6af-4778-b546-c46f8088dd68',
        workflow,
        status: 'running',
        startedAt: '2026-08-07T12:00:00.000Z',
        completedAt: '2026-08-07T12:00:05.000Z',
      })
    ).toThrow(/cannot have completedAt/);
  });
});
