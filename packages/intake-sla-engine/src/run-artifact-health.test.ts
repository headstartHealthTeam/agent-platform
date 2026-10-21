import { describe, expect, it } from 'vitest';

import { cacheFixture, executeCache } from './fireflies-cache-fixture.test-support.js';
import { sha256Json } from './json-fingerprint.js';
import { assessTranscriptInventoryArtifact } from './run-artifact-health.js';

const runAt = '2026-09-09T13:18:08.000Z';
describe('retained transcript inventory health', () => {
  it('distinguishes explicitly confirmed empty transcripts from missing content', () => {
    const result = assessTranscriptInventoryArtifact({
      expectedCount: 2,
      runAt,
      records: [
        {
          transcriptId: 'with-content',
          fullTranscript: 'Complete synthetic transcript',
          retrievedAt: runAt,
        },
        {
          transcriptId: 'confirmed-empty',
          fullTranscript: '',
          transcriptEmpty: true,
          retrievedAt: runAt,
        },
      ],
    });
    expect(result).toMatchObject({
      status: 'Complete',
      explicitlyEmptyCount: 1,
      missingTranscriptCount: 0,
      reason: null,
    });
    expect(
      assessTranscriptInventoryArtifact({
        expectedCount: 1,
        runAt,
        records: [{ transcriptId: 'missing', fullTranscript: '', retrievedAt: runAt }],
      })
    ).toMatchObject({ status: 'Blocked', missingTranscriptCount: 1, explicitlyEmptyCount: 0 });
  });
  it('accounts for missing/duplicate identities, incomplete collection, content aliases and freshness boundaries', () => {
    const records = [
      { transcriptId: 'same', transcript: 'Content', collectedAt: runAt },
      { id: 'same', sentences: ['Content'], searchedAt: runAt },
      { transcriptId: '', transcriptEmpty: true, retrievedAt: 'invalid' },
    ];
    const result = assessTranscriptInventoryArtifact({ expectedCount: '4', records, runAt });
    expect(result).toMatchObject({
      expectedCount: 4,
      duplicateCount: 1,
      uniqueCount: 1,
      staleCount: 1,
      explicitlyEmptyCount: 1,
    });
    expect(result.issues).toEqual([
      'Transcript records are missing source identities.',
      'Retained 3 of 4 requested transcripts.',
      '1 duplicate transcript IDs were retained.',
      '1 transcript records were not retrieved during the current run.',
      'Only 1 unique transcript IDs were retained.',
    ]);
    for (const offset of [-43_200_000, 43_200_000, -43_200_001, 43_200_001]) {
      const retrievedAt = Date.parse(runAt) + offset;
      expect(
        assessTranscriptInventoryArtifact({
          runAt,
          records: [{ id: 'id', fullTranscript: 'Text', retrievedAt }],
        }).staleCount
      ).toBe(Math.abs(offset) > 43_200_000 ? 1 : 0);
    }
    expect(assessTranscriptInventoryArtifact()).toMatchObject({ complete: true, expectedCount: 0 });
    expect(
      assessTranscriptInventoryArtifact({ expectedCount: 'invalid', records: null })
    ).toMatchObject({ complete: true, expectedCount: 0 });
    for (const retrievedAt of [null, false, {}, [], undefined]) {
      expect(
        assessTranscriptInventoryArtifact({
          runAt,
          records: [{ id: 'id', fullTranscript: 'Text', searchedAt: retrievedAt }],
        }).staleCount
      ).toBe(1);
    }
  });
  it('retains the complete collection-plan hash including metadata outside the date window', () => {
    const input = cacheFixture();
    input.collectionPlan = Object.assign({}, input.collectionPlan, {
      profilesHash: 'synthetic-profile-hash',
      queryCount: 2,
    });
    input.discovery.collectionPlanHash = sha256Json(input.collectionPlan);
    const result = executeCache(input);
    expect(
      assessTranscriptInventoryArtifact({
        records: result.records,
        runAt: input.discovery.asOf,
        cacheProof: result.proof,
      }).complete
    ).toBe(true);
  });
  it('only accepts older retrieval timestamps when linked cache provenance verifies for this run', () => {
    const first = executeCache(cacheFixture());
    const input = cacheFixture(11);
    const reused = executeCache(input, first, 'reuse');
    expect(
      assessTranscriptInventoryArtifact({
        expectedCount: 1,
        records: reused.records,
        runAt: input.discovery.asOf,
      }).complete
    ).toBe(false);
    for (const value of [input.discovery.asOf, new Date(input.discovery.asOf)]) {
      expect(
        assessTranscriptInventoryArtifact({
          expectedCount: 1,
          records: reused.records,
          runAt: value,
          cacheProof: reused.proof,
        }).complete
      ).toBe(true);
    }
    expect(
      assessTranscriptInventoryArtifact({
        records: reused.records,
        runAt: null,
        cacheProof: reused.proof,
      }).issues
    ).toHaveLength(1);
    expect(
      assessTranscriptInventoryArtifact({
        records: reused.records,
        runAt: input.discovery.asOf,
        cacheProof: {},
      }).complete
    ).toBe(false);
  });
});
