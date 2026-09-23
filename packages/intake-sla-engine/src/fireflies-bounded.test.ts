import { describe, expect, it } from 'vitest';

import type { BoundedSearchAttempt } from './fireflies-bounded-contract.js';
import { resolveBoundedCoverage } from './fireflies-bounded-coverage.js';
import {
  boundedFixture,
  first,
  replanBoundedFixture,
} from './fireflies-bounded-fixture.test-support.js';
import type { BoundedFixture } from './fireflies-bounded-fixture.test-support.js';
import { buildFirefliesCandidateManifest } from './fireflies-bounded.js';
import { validateCandidateBody, verifyCandidateInventory } from './fireflies-candidate-body.js';
import type { RunMeetingRequest } from './fireflies-collection.js';
import { sha256Json } from './json-fingerprint.js';

function fallback(input: BoundedFixture): {
  primary: RunMeetingRequest;
  request: RunMeetingRequest;
  attempt: BoundedSearchAttempt;
  proof: {
    opportunityId: string;
    priorRequestKey: string;
    usableMeetingIds: string[];
    providerIdentityVerified: boolean;
  };
} {
  const primary = input.collectionPlan.meetingRequests.find(
    (request) => request.executionTier === 'Primary'
  );
  const request = input.collectionPlan.meetingRequests.find(
    (value) =>
      value.executionTier === 'Identity Fallback' && value.providerName === primary?.providerName
  );
  const attempt = input.searchExecution.attempts.find(
    (value) => value.requestKey === request?.requestKey
  );
  if (primary === undefined || request === undefined || attempt === undefined)
    throw new Error('Missing fallback fixture');
  const proof = {
    opportunityId: first(input.profiles).opportunityId,
    priorRequestKey: primary.requestKey,
    usableMeetingIds: ['synthetic-candidate'],
    providerIdentityVerified: true,
  };
  Object.assign(attempt, {
    completed: false,
    skipped: true,
    pages: 0,
    meetingIds: [],
    skipProofs: [proof],
  });
  return { primary, request, attempt, proof };
}
describe('bounded current-run candidate evidence', () => {
  it('excludes unrelated live bodies while preserving required body completeness', () => {
    const input = boundedFixture();
    const manifest = buildFirefliesCandidateManifest(input);
    expect(manifest.counts).toMatchObject({
      discovered: 2,
      candidateBodies: 1,
      reuse: 0,
      blockedRows: 0,
    });
    expect(verifyCandidateInventory(manifest, [first(input.fetched)])).toBe(true);
    for (const records of [[], [first(input.fetched), first(input.fetched)]])
      expect(() => verifyCandidateInventory(manifest, records)).toThrow('incomplete');
    expect(() => validateCandidateBody(manifest, input.fetched.at(1))).toThrow('does not match');
    first(first(input.discovery.pages).meetings).isLive = true;
    const live = buildFirefliesCandidateManifest(input);
    expect(live.meetings).toHaveLength(1);
    expect(() => validateCandidateBody(live, { ...first(input.fetched), isLive: true })).toThrow(
      'complete processed'
    );
  });
  it('uses the frozen cutoff and validates even empty-result identity windows', () => {
    const input = boundedFixture();
    const meeting = first(first(input.discovery.pages).meetings);
    meeting.date = input.discovery.asOf;
    expect(buildFirefliesCandidateManifest(input).meetings).toHaveLength(1);
    meeting.date = input.discovery.asOf.replace('17:00:00', '17:00:01');
    input.discovery.query.toDate = meeting.date;
    expect(buildFirefliesCandidateManifest(input).meetings).toHaveLength(0);
    const malformed = boundedFixture();
    first(malformed.profiles).searchWindow.fromDate = 'invalid';
    expect(() => buildFirefliesCandidateManifest(malformed)).toThrow();
    first(malformed.profiles).searchWindow = { fromDate: '2026-01-10', toDate: '2026-01-01' };
    replanBoundedFixture(malformed);
    expect(() => buildFirefliesCandidateManifest(malformed)).toThrow('reversed');
  });
  it('keeps search provenance failures and incomplete searches distinct', () => {
    const mutations: ((input: BoundedFixture) => void)[] = [
      (input): void => {
        input.searchExecution.runId = 'other';
      },
      (input): void => {
        input.searchExecution.scopeHash = 'other';
      },
      (input): void => {
        input.searchExecution.accessVerified = false;
      },
      (input): void => {
        first(input.searchExecution.attempts).pages = 0;
      },
      (input): void => {
        first(input.searchExecution.attempts).meetingIds.push('missing');
      },
      (input): void => {
        first(input.searchExecution.attempts).requestKey = 'unknown';
      },
      (input): void => {
        input.searchExecution.attempts.push(first(input.searchExecution.attempts));
      },
      (input): void => {
        input.profiles.push(first(input.profiles));
      },
      (input): void => {
        first(first(input.profiles).providerRoles).emails = ['changed@example.test'];
      },
    ];
    for (const mutate of mutations) {
      const input = boundedFixture();
      mutate(input);
      expect(() => buildFirefliesCandidateManifest(input)).toThrow();
    }
    const input = boundedFixture();
    input.searchExecution.attempts.pop();
    expect(buildFirefliesCandidateManifest(input).counts).toMatchObject({
      blockedRows: 1,
      incompleteSearches: 1,
      candidateBodies: 1,
    });
    first(input.searchExecution.attempts).completed = false;
    expect(first(buildFirefliesCandidateManifest(input).rows).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'Incomplete search' })])
    );
  });
  it('accepts fallback skips only with usable lower-tier proof and nonempty current bodies', () => {
    const input = boundedFixture();
    const { proof } = fallback(input);
    const manifest = buildFirefliesCandidateManifest(input);
    expect(manifest.counts.blockedRows).toBe(0);
    expect(manifest.fallbackSkips).toHaveLength(1);
    expect(verifyCandidateInventory(manifest, [first(input.fetched)])).toBe(true);
    expect(() =>
      verifyCandidateInventory(manifest, [
        { ...first(input.fetched), fullTranscript: '', transcriptEmpty: true },
      ])
    ).toThrow('silent');
    proof.usableMeetingIds = ['synthetic-unrelated'];
    expect(() => buildFirefliesCandidateManifest(input)).toThrow('prior-tier');
    const invalid = boundedFixture();
    const values = fallback(invalid);
    values.attempt.pages = 1;
    expect(() => buildFirefliesCandidateManifest(invalid)).toThrow('Invalid fallback');
    values.attempt.pages = 0;
    values.proof.providerIdentityVerified = false;
    expect(() => buildFirefliesCandidateManifest(invalid)).toThrow('one usable');
  });
  it('retains original blocked identity receipts while resolving only usable primary CSM exceptions', () => {
    const input = boundedFixture();
    const role = first(first(input.profiles).providerRoles);
    role.csmEmails = [];
    role.csmNames = [];
    replanBoundedFixture(input);
    const manifest = buildFirefliesCandidateManifest(input);
    const hash = sha256Json(manifest);
    expect(first(manifest.rows).status).toBe('Blocked');
    const resolved = resolveBoundedCoverage(manifest, input, [first(input.fetched)]);
    expect(first(resolved.rows).status).toBe('Complete');
    expect(resolved.resolutions).toHaveLength(1);
    expect(sha256Json(manifest)).toBe(hash);
    for (const records of [
      [],
      [{ ...first(input.fetched), fullTranscript: '', transcriptEmpty: true }],
      [
        {
          ...first(input.fetched),
          participants: [],
          meetingAttendees: [],
          organizerEmail: 'other@example.test',
        },
      ],
    ])
      expect(first(resolveBoundedCoverage(manifest, input, records).rows).status).toBe('Blocked');
    first(input.searchExecution.attempts).completed = false;
    expect(first(resolveBoundedCoverage(manifest, input, input.fetched).rows).status).toBe(
      'Blocked'
    );
    const complete = boundedFixture();
    const completeManifest = buildFirefliesCandidateManifest(complete);
    expect(
      resolveBoundedCoverage(completeManifest, complete, complete.fetched).resolutions
    ).toEqual([]);
  });
  it('requires exact candidate metadata, current retrieval and explicit body completion', () => {
    const input = boundedFixture();
    const manifest = buildFirefliesCandidateManifest(input);
    for (const patch of [
      { title: 'changed' },
      { retrievedAt: '2026-01-09' },
      { retrievedAt: '2099-01-01' },
      { complete: false },
      { fullTranscript: '' },
      { retrievalEndpoint: 'summary-only' },
    ])
      expect(() =>
        validateCandidateBody(manifest, { ...first(input.fetched), ...patch })
      ).toThrow();
  });
  it('blocks only the identities dependent on a missing provider query', () => {
    const input = boundedFixture();
    const other = {
      ...structuredClone(first(input.profiles)),
      opportunityId: 'synthetic-other-opportunity',
      opportunityName: 'Other Synthetic Client',
      renderingProvider: { name: 'Other Provider', email: 'other@example.test' },
    };
    Object.assign(first(other.providerRoles), {
      primaryName: 'Other Provider',
      names: ['Other Provider'],
      emails: ['other@example.test'],
      providerProfileEmails: ['other@example.test'],
    });
    input.profiles.push(other);
    replanBoundedFixture(input);
    input.searchExecution.attempts = input.collectionPlan.meetingRequests
      .filter((request) => request.participantEmail !== 'provider@example.test')
      .map((request) => ({
        requestKey: request.requestKey,
        completed: true,
        paginationComplete: true,
        pages: 1,
        meetingIds: [],
      }));
    const manifest = buildFirefliesCandidateManifest(input);
    expect(
      manifest.rows.find((row) => row.opportunityId === first(input.profiles).opportunityId)?.status
    ).toBe('Blocked');
    expect(manifest.rows.find((row) => row.opportunityId === other.opportunityId)?.status).toBe(
      'Complete'
    );
    expect(manifest.counts.blockedRows).toBe(1);
  });
  it('cannot skip a fallback while another primary email is missing or incomplete', () => {
    for (const incomplete of [false, true]) {
      const input = boundedFixture();
      first(first(input.profiles).providerRoles).emails.push('alternative@example.test');
      replanBoundedFixture(input);
      const alternative = input.collectionPlan.meetingRequests.find(
        (request) => request.participantEmail === 'alternative@example.test'
      );
      if (alternative === undefined) throw new Error('Missing alternate primary fixture');
      if (incomplete)
        input.searchExecution.attempts.push({
          requestKey: alternative.requestKey,
          completed: false,
          paginationComplete: false,
          pages: 0,
          meetingIds: [],
        });
      fallback(input);
      expect(() => buildFirefliesCandidateManifest(input)).toThrow(
        'Primary email searches remain mandatory before fallback skips'
      );
    }
  });
});
