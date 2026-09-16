import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  artifactByteLimit,
  artifactValidationReply,
  validateReviewArtifacts,
} from './artifact-validation.js';

const inputJson = fs.readFileSync(
  fileURLToPath(new URL('../fixtures/input.valid.json', import.meta.url)),
  'utf8'
);
const proposalJson = fs.readFileSync(
  fileURLToPath(new URL('../fixtures/output.valid.json', import.meta.url)),
  'utf8'
);

describe('application artifact validation', () => {
  it('validates the exact source bytes and exposes only the application handoff projection', () => {
    const result = validateReviewArtifacts({ inputJson, proposalJson });
    expect(result.protocol).toBe('credentialing-validation/v1');
    expect(result.inputFingerprint).toBe(
      `sha256:${createHash('sha256').update(inputJson).digest('hex')}`
    );
    expect(result.proposalFingerprint).toBe(
      `sha256:${createHash('sha256').update(proposalJson).digest('hex')}`
    );
    expect(result.work).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('evidence');
    expect(result.readiness).toBe('prepared-for-review');
    expect(artifactValidationReply({ inputJson, proposalJson })).toEqual({
      ok: true,
      value: result,
    });
    const whitespace = validateReviewArtifacts({ inputJson: `${inputJson}\n`, proposalJson });
    expect(whitespace.inputFingerprint).not.toBe(result.inputFingerprint);
    expect(whitespace.reviewFingerprint).toBe(result.reviewFingerprint);
  });

  it.each([
    null,
    { inputJson: '{}', proposalJson },
    { inputJson, proposalJson: 'not json' },
    { inputJson, proposalJson, readiness: 'approved' },
    { inputJson: ' '.repeat(artifactByteLimit + 1), proposalJson },
    { inputJson, proposalJson: proposalJson.replace('prepared-for-review', 'submitted') },
    { inputJson, proposalJson: proposalJson.replace('H-01', 'H-02') },
  ])('fails closed with a static diagnostic', (request) => {
    expect(artifactValidationReply(request)).toEqual({ ok: false, code: 'invalid-artifacts' });
  });
});

describe('validation worker entry', () => {
  it('sends one bounded reply and closes its channel', async () => {
    vi.resetModules();
    const port = { postMessage: vi.fn(), close: vi.fn() };
    vi.doMock('node:worker_threads', () => ({
      parentPort: port,
      workerData: { inputJson, proposalJson },
    }));
    await import('./artifact-worker.js');
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith(
      artifactValidationReply({ inputJson, proposalJson })
    );
    expect(port.close).toHaveBeenCalledOnce();
    vi.doUnmock('node:worker_threads');
  });
  it('refuses execution without an application message channel', async () => {
    vi.resetModules();
    vi.doMock('node:worker_threads', () => ({ parentPort: null, workerData: {} }));
    await expect(import('./artifact-worker.js')).rejects.toThrow('requires a worker');
    vi.doUnmock('node:worker_threads');
  });
});
