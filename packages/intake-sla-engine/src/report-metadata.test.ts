import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  APPROVED_INTERPRETER_MODEL,
  APPROVED_INTERPRETER_PROVIDER,
} from './interpretation-binding.js';
import { buildReportMetadata, type ReportMetadataInput } from './report-metadata.js';
import { assessTranscriptInventoryArtifact } from './run-artifact-health.js';

function baseline(): ReportMetadataInput {
  return {
    runId: 'synthetic-run',
    runAtEastern: '9/24/2026, 4:00 PM ET',
    engineVersion: 'source-version',
    firefliesArtifactHealth: { complete: true, retainedCount: 3, reason: null },
    interpretation: {
      mode: 'api',
      config: { model: APPROVED_INTERPRETER_MODEL, provider: APPROVED_INTERPRETER_PROVIDER },
      usage: { inputTokens: 12, outputTokens: 5 },
    },
    activeRows: 4,
    onHoldRows: 2,
    totalRows: 6,
  };
}
function note(input: ReportMetadataInput, key: string): unknown {
  return buildReportMetadata(input).find((row) => row[0] === key)?.[1];
}
describe('approved report run notes', () => {
  it('retains the complete forty-four-row source metadata and ordering', () => {
    const input = baseline();
    const before = structuredClone(input);
    const rows = buildReportMetadata(input);
    expect(rows).toHaveLength(44);
    // Independently computed from the approved builder with this synthetic input.
    expect(createHash('sha256').update(JSON.stringify(rows)).digest('hex')).toBe(
      'f37537313017924461d78d58309a80cac49b9f3412dee12f624d0bd05348a94a'
    );
    expect(input).toEqual(before);
    expect(note(input, 'AI Interpretation')).toBe(
      'Enabled with gpt-5.6-sol through openai-responses; 12 input and 5 output tokens used.'
    );
  });
  it('distinguishes complete inventory from a blocked artifact with a reason or fallback', () => {
    expect(
      note(
        {
          ...baseline(),
          firefliesArtifactHealth: {
            complete: false,
            retainedCount: 0,
            reason: 'Synthetic failure',
          },
        },
        'Fireflies Transcript Inventory'
      )
    ).toBe('Blocked: Synthetic failure');
    expect(
      note(
        {
          ...baseline(),
          firefliesArtifactHealth: { complete: false, retainedCount: 0, reason: '' },
        },
        'Fireflies Transcript Inventory'
      )
    ).toBe('Blocked: current-run transcript inventory was not retained.');
    const health = assessTranscriptInventoryArtifact();
    expect(
      note({ ...baseline(), firefliesArtifactHealth: health }, 'Fireflies Transcript Inventory')
    ).toBe('0 full transcripts retained and verified for this run.');
  });
  it('describes precomputed evidence separately and does not turn zero rows into available interpretation', () => {
    expect(
      note({ ...baseline(), interpretation: { mode: 'precomputed', rows: 4 } }, 'AI Interpretation')
    ).toBe(
      'Enabled from contract-bound precomputed interpretations for 4 Opportunity row(s); packet bindings and transcript support spans were revalidated.'
    );
    const zero = note(
      { ...baseline(), interpretation: { mode: 'precomputed', rows: 0 } },
      'AI Interpretation'
    );
    expect(zero).toBe(
      note({ ...baseline(), interpretation: { mode: 'unavailable' } }, 'AI Interpretation')
    );
    expect(zero).toBe(
      'No API or precomputed interpretations were available. Candidate transcript segments are excluded from conclusions and required provider-facing rows are Blocked.'
    );
  });
});
