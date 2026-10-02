import { describe, expect, it } from 'vitest';

import { resolveBoundedCoverage } from './fireflies-bounded-coverage.js';
import {
  boundedFixture,
  first,
  replanBoundedFixture,
} from './fireflies-bounded-fixture.test-support.js';
import { buildFirefliesCandidateManifest } from './fireflies-bounded.js';
import {
  firefliesIdentityConfidence,
  firefliesReportCoverage,
} from './fireflies-report-coverage.js';
import { indexReviewerState, restoreReviewerState, reviewerStateDiff } from './reviewer-state.js';
import { sourceOutcome } from './source-outcome.js';
import { blockingRequiredSources } from './source-requirements.js';
import { linkStaffingByOpportunity } from './staffing-linkage.js';
import { truncateWithEllipsis, unicodeLength, unicodeSlice } from './text-truncation.js';

describe('report input projection without source or reviewer mutation', () => {
  it('preserves code points, String coercion and the approved small-limit behavior', () => {
    expect(truncateWithEllipsis(`${'a'.repeat(7)}🛑tail`, 10)).toBe(`${'a'.repeat(7)}...`);
    expect(unicodeLength('a🛑b')).toBe(3);
    expect(unicodeSlice('a🛑b', 1, 2)).toBe('🛑');
    expect(unicodeSlice('a🛑b', -2)).toBe('🛑b');
    expect(unicodeSlice()).toBe('');
    expect(unicodeLength()).toBe(0);
    expect(truncateWithEllipsis()).toBe('');
    expect(truncateWithEllipsis('🛑', 0)).toBe('...');
    expect(truncateWithEllipsis(null)).toBe('null');
  });
  it('links direct and request-owned staffing while preserving direct record identity and metadata', () => {
    const direct = {
      Id: 'staff-1',
      Client_Opportunity_Record__c: 'opp-one',
      extra: { retained: true },
    };
    const indirect = { Id: 'staff-2', extra: { retained: true } };
    const input = {
      staffingRecords: [direct, indirect],
      rbtRequests: [
        {
          Id: 'req-one',
          Name: 'Request One',
          Client_Opportunity__c: 'opp-one',
          RBT_Assigned__c: 'staff-1',
        },
        {
          Id: 'req-two',
          Name: 'Request Two',
          Client_Opportunity__c: 'opp-two',
          RBT_Assigned__c: 'staff-2',
        },
        { opportunityId: 'opp-three', staffingId: 'staff-2' },
        { opportunityId: 'opp-four', staffingId: 'missing' },
      ],
    };
    const before = structuredClone(input);
    const result = linkStaffingByOpportunity(input);
    expect(result.get('opp-one')).toEqual([direct]);
    expect(result.get('opp-one')?.[0]).toBe(direct);
    expect(result.get('opp-two')).toEqual([
      { ...indirect, _linkedViaRbtRequestId: 'req-two', _linkedViaRbtRequestName: 'Request Two' },
    ]);
    expect(result.get('opp-three')).toEqual([
      { ...indirect, _linkedViaRbtRequestId: undefined, _linkedViaRbtRequestName: undefined },
    ]);
    expect(result.has('opp-four')).toBe(false);
    expect(input).toEqual(before);
    expect(linkStaffingByOpportunity({}).size).toBe(0);
  });
  it('retains nullish alias selection and the original capital-Id duplicate behavior', () => {
    const firstStaff = { id: 'lower-one', opportunityId: 'opp' };
    const secondStaff = { id: 'lower-two', opportunityId: 'opp' };
    expect(
      linkStaffingByOpportunity({ staffingRecords: [firstStaff, secondStaff] }).get('opp')
    ).toEqual([firstStaff]);
    expect(
      linkStaffingByOpportunity({
        staffingRecords: [
          { Id: 'empty', Client_Opportunity_Record__c: '', opportunityId: 'fallback' },
        ],
      }).size
    ).toBe(0);
    const linked = linkStaffingByOpportunity({
      staffingRecords: [{ Id: null, id: 'lower' }],
      rbtRequests: [{ id: 'req', name: 'Request', opportunityId: 'opp', staffingId: 'lower' }],
    });
    expect(linked.get('opp')).toEqual([
      { Id: null, id: 'lower', _linkedViaRbtRequestId: 'req', _linkedViaRbtRequestName: 'Request' },
    ]);
  });
  it('restores exact reviewer values including whitespace, booleans, falsey values and object identity', () => {
    const richValue = { formatted: true };
    const prior = [
      {
        'Opportunity ID': 'opp',
        'Needs CSM Review': true,
        'Reviewer Notes': '  keep spaces  ',
        'Copied to Salesforce?': false,
        'Reviewed By': richValue,
        'Reviewed At': 0,
      },
    ];
    const generated = [
      {
        'Opportunity ID': 'opp',
        'Needs CSM Review': false,
        'Reviewer Notes': '',
        generated: 'summary',
      },
    ];
    const restored = restoreReviewerState(generated, prior);
    expect(restored).toEqual([{ ...generated[0], ...prior[0] }]);
    expect(restored[0]?.['Reviewed By']).toBe(richValue);
    expect(reviewerStateDiff(prior, restored)).toEqual([]);
    expect(generated[0]?.['Reviewer Notes']).toBe('');
    const untouched = restoreReviewerState(generated, []);
    expect(untouched).toEqual(generated);
    expect(untouched[0]).not.toBe(generated[0]);
  });
  it('uses last duplicate state, null defaults, nullish IDs and ordered strict-value differences', () => {
    const rows = [
      { opportunityId: 'opp', 'Reviewer Notes': 'old' },
      { 'Opportunity ID': null, opportunityId: 'opp', 'Reviewer Notes': 'new' },
      { 'Opportunity ID': '', opportunityId: 'ignored', 'Reviewer Notes': 'skip' },
      {},
    ];
    const indexed = indexReviewerState(rows);
    expect([...indexed.keys()]).toEqual(['opp']);
    expect(indexed.get('opp')).toEqual({
      'Needs CSM Review': null,
      'Reviewer Notes': 'new',
      'Copied to Salesforce?': null,
      'Reviewed By': null,
      'Reviewed At': null,
    });
    expect(reviewerStateDiff(rows, [])).toEqual([
      { opportunityId: 'opp', field: 'Reviewer Notes', before: 'new', after: null },
    ]);
    expect(
      reviewerStateDiff(
        [{ opportunityId: 'opp', 'Needs CSM Review': false, 'Reviewer Notes': '' }],
        [{ opportunityId: 'opp', 'Needs CSM Review': 0, 'Reviewer Notes': null }]
      )
    ).toEqual([
      { opportunityId: 'opp', field: 'Needs CSM Review', before: false, after: 0 },
      { opportunityId: 'opp', field: 'Reviewer Notes', before: '', after: null },
    ]);
    expect(restoreReviewerState([{}], rows)).toEqual([{}]);
  });
});

describe('Fireflies report coverage consumes the complete bounded proof', () => {
  it('composes real proof output into detail, confidence and required-source blocking', () => {
    const input = boundedFixture();
    Object.assign(first(first(input.profiles).providerRoles), { csmNames: [], csmEmails: [] });
    replanBoundedFixture(input);
    const manifest = buildFirefliesCandidateManifest(input);
    const opportunityId = first(input.profiles).opportunityId;
    const row = { searchedAt: input.discovery.asOf, searchCoverage: { status: 'Complete' } };
    const identity = {
      firefliesIdentityCoverage: { status: 'Blocked', missing: ['Current or prior CSM'] },
    };
    for (const records of [[first(input.fetched)], []]) {
      const proof = resolveBoundedCoverage(manifest, input, records);
      const coverage = firefliesReportCoverage({
        opportunityId,
        identity,
        boundedCoverage: proof,
        row,
      });
      const outcome = sourceOutcome({
        ...coverage,
        row,
        items: [{ substantive: true, matchQuality: 'Direct', processGateRelevance: 'Relevant' }],
        source: 'Fireflies',
        asOf: input.discovery.asOf,
      });
      const complete = records.length > 0;
      expect(outcome.status).toBe(complete ? 'Found' : 'Blocked');
      expect(blockingRequiredSources([outcome])).toHaveLength(complete ? 0 : 1);
      expect(firefliesIdentityConfidence(coverage, '')).toBe(complete ? 'High' : 'Partial');
      expect(firefliesIdentityConfidence(coverage, 'ambiguous match')).toBe(
        'Likely - verification required'
      );
      expect(coverage.coverageDetail).toBe(
        complete ? '' : 'Provider identity coverage is Blocked; missing Current or prior CSM.'
      );
    }
    const proof = resolveBoundedCoverage(manifest, input, [first(input.fetched)]);
    for (const broken of [
      undefined,
      { ...proof, rows: manifest.rows },
      { ...proof, resolutions: [{ opportunityId: 'other' }] },
    ])
      expect(
        firefliesReportCoverage({ opportunityId, identity, boundedCoverage: broken, row })
          .identityComplete
      ).toBe(false);
    const partial = firefliesReportCoverage({
      opportunityId,
      identity,
      boundedCoverage: proof,
      row: { searchCoverage: { status: 'Partial' } },
    });
    expect(partial).toMatchObject({
      identityComplete: true,
      coverageStatus: 'Partial',
    });
    expect(partial.coverageDetail).toContain('complete current-run');
  });
  it('retains explicit complete identity, default blocked text and truthy review indicators', () => {
    const incomplete = firefliesReportCoverage({ opportunityId: 'opp' });
    expect(incomplete).toMatchObject({
      identityComplete: false,
      coverageStatus: 'Partial',
    });
    expect(incomplete.coverageDetail).toContain('coverage is Blocked.');
    expect(
      firefliesReportCoverage({
        opportunityId: 'opp',
        identity: { firefliesIdentityCoverage: { status: '', missing: [] } },
      }).coverageDetail
    ).toContain('coverage is Blocked.');
    const coverage = firefliesReportCoverage({
      opportunityId: 'opp',
      identity: { firefliesIdentityCoverage: { status: 'Complete' } },
      row: { searchCoverage: { status: 'Complete' } },
    });
    expect(coverage.coverageStatus).toBe('Complete');
    expect(firefliesIdentityConfidence(coverage, false)).toBe('High');
    expect(firefliesIdentityConfidence(coverage, [])).toBe('Likely - verification required');
  });
});
