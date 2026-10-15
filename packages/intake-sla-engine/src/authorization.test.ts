import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAuthorizationGate } from './authorization-gate.js';
import {
  treatmentAuthorizationSubmitted,
  treatmentPlanEnteredReview,
} from './authorization-record.js';
import type { AuthorizationRecord } from './authorization-types.js';

const AS_OF = '2026-09-11T17:31:07.000Z';
const approved: AuthorizationRecord = {
  id: 'synthetic-auth',
  type: 'Initial',
  status: 'Active',
  determination: 'Approved',
  initialApprovalDate: '2026-09-10',
  initialSubmissionDate: '2026-09-01',
  payer: 'Example Payer',
};
const resolve = (
  authorizations: readonly AuthorizationRecord[],
  phase = 'Initial'
): ReturnType<typeof resolveAuthorizationGate> =>
  resolveAuthorizationGate({ phase, authorizations, asOf: AS_OF });
afterEach(() => {
  vi.useRealTimers();
});

describe('approved authorization decisions', () => {
  it('keeps Initial Consultation, Treatment Plan Review and payer authorization distinct', () => {
    expect(resolve([{ ...approved, type: 'Initial Consultation' }]).state).toBe('Missing');
    expect(resolve([{ ...approved, type: 'Treatment Auth Request' }], 'Treatment').state).toBe(
      'Missing'
    );
    expect(resolve([{ ...approved, type: 'other' }]).state).toBe('Missing');
    expect(resolve([{ ...approved, authorizationType: ' Treatment ' }], 'Treatment').state).toBe(
      'Pending'
    );
    expect(
      treatmentPlanEnteredReview({
        type: 'Treatment Auth Request',
        portalSubmissionDate: '2026-09-10',
      })
    ).toBe(true);
    expect(treatmentPlanEnteredReview({ type: 'Treatment' })).toBe(false);
    expect(treatmentPlanEnteredReview({ type: 'Treatment Auth Request' })).toBe(false);
    expect(
      treatmentAuthorizationSubmitted({ type: 'Treatment', treatmentSubmissionDate: '2026-09-10' })
    ).toBe(true);
    expect(
      treatmentAuthorizationSubmitted({ type: 'Initial', treatmentSubmissionDate: '2026-09-10' })
    ).toBe(false);
    expect(treatmentAuthorizationSubmitted({ type: 'Treatment' })).toBe(false);
  });

  it('requires phase-specific approval provenance or explicit no-auth-needed', () => {
    expect(resolve([approved])).toMatchObject({
      state: 'Approved',
      satisfied: true,
      confidence: 'High',
      blockingRecordId: null,
      authorizationId: 'synthetic-auth',
      submissionDate: '2026-09-01',
      determinationDate: '2026-09-10',
      denialOccurred: false,
      denialReason: null,
      denialExplanation: null,
      denialRecordId: null,
    });
    expect(resolve([{ ...approved, initialApprovalDate: null }])).toMatchObject({
      state: 'Pending',
      satisfied: false,
    });
    expect(
      resolve([
        { ...approved, status: 'Approved', determination: '', initialApprovalDate: '2026-09-10' },
      ]).satisfied
    ).toBe(true);
    expect(resolve([{ ...approved, status: 'Unknown', determination: 'Unknown' }]).satisfied).toBe(
      false
    );
    expect(
      resolve([{ ...approved, status: 'Denied', determination: 'Denied', noAuthNeeded: true }])
        .state
    ).toBe('No Auth Needed');
    const treatment = {
      ...approved,
      type: 'Treatment',
      treatmentApprovalDate: '2026-09-10',
      treatmentSubmissionDate: '2026-09-01',
    };
    expect(resolve([treatment], 'Treatment')).toMatchObject({
      state: 'Approved',
      determinationDate: '2026-09-10',
      submissionDate: '2026-09-01',
    });
    expect(resolve([{ ...treatment, treatmentApprovalDate: null }], 'Treatment').satisfied).toBe(
      false
    );
  });

  it('keeps unresolved requests operative outside service windows and while inactive', () => {
    const states = [
      ['Additional Details', 'Additional Details Required'],
      ['pending appeal', 'Appeal'],
      ['Appeal Pending', 'Appeal'],
      ['Peer Review', 'Peer Review'],
      ['Clinical Review', 'Pending Review'],
      ['Pending Review', 'Pending Review'],
      ['Partially Approved', 'Partial Approval'],
      ['Partial Approval', 'Partial Approval'],
      ['Denied', 'Denied'],
      ['Withdrawn', 'Withdrawn'],
      ['Pending', 'Pending'],
      ['Appeal', 'Appeal'],
      ['', 'Pending'],
    ] as const;
    for (const [determination, state] of states) {
      const row = {
        id: 'synthetic-open',
        type: 'Treatment',
        status: 'Inactive',
        determination,
        active: false,
        authStartDate: '2030-01-01',
        authExpirationDate: '2020-01-01',
        treatmentSubmissionDate: '2026-09-10',
      };
      if (determination === 'Appeal' || determination === '') continue;
      const result = resolve([row], 'Treatment');
      expect(result.state).toBe(state);
      expect(result.satisfied).toBe(false);
      expect(result.appealKind).toBe(
        state === 'Appeal' ? 'appeal' : state === 'Peer Review' ? 'peer review' : null
      );
    }
    expect(resolve([{ id: 'synthetic', type: 'Initial', determination: 'Appeal' }]).state).toBe(
      'Appeal'
    );
    expect(resolve([{ type: 'Initial' }]).state).toBe('Pending');
    expect(resolve([{}], 'Other').state).toBe('Pending');
  });

  it('excludes superseded, terminal and resolved inactive/out-of-window records', () => {
    for (const extra of [
      { superseded: true },
      { status: 'Cancelled' },
      { determination: 'Void' },
      { status: 'Inactive' },
      { active: false },
      { authStartDate: '2026-09-12' },
      { authExpirationDate: '2026-09-10' },
    ])
      expect(resolve([{ ...approved, ...extra }]).state).toBe('Missing');
    expect(
      resolve([{ ...approved, authStartDate: AS_OF, authExpirationDate: AS_OF }]).satisfied
    ).toBe(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(AS_OF));
    expect(resolveAuthorizationGate({ phase: 'Initial' }).state).toBe('Missing');
  });

  it('preserves episode conflicts and denial details without merging unrelated payer episodes', () => {
    const denial = {
      ...approved,
      id: 'synthetic-denied',
      determination: 'Denied',
      denialReason: 'Additional clinical documentation',
      denialExplanation: 'Signed plan requested.',
    };
    const result = resolve([approved, denial]);
    expect(result).toMatchObject({
      state: 'Conflict',
      satisfied: false,
      confidence: 'Low',
      conflict: true,
      denialOccurred: true,
      denialReason: 'Additional clinical documentation',
      denialExplanation: 'Signed plan requested.',
      denialRecordId: 'synthetic-denied',
    });
    const newer = { ...approved, id: 'newer', initialApprovalDate: '2026-09-11T12:00:00Z' };
    expect(
      resolve([
        newer,
        { ...denial, initialApprovalDate: '2026-08-01', initialSubmissionDate: null },
      ]).state
    ).toBe('Approved');
    expect(
      resolve([newer, { ...denial, payer: 'Different Payer', initialApprovalDate: '2026-09-11' }])
        .state
    ).toBe('Approved');
    expect(
      resolve([
        { ...newer, authorizationNumber: 'episode' },
        {
          ...denial,
          authorizationNumber: 'episode',
          initialApprovalDate: '2026-08-01',
          initialSubmissionDate: null,
        },
      ]).state
    ).toBe('Conflict');
    const explicitReason = resolve([{ ...approved, denialReason: 'Historical details' }]);
    expect(explicitReason.denialOccurred).toBe(true);
    expect(resolve([{ type: 'Initial', status: 'Denied' }]).denialRecordId).toBeNull();
  });

  it('requires every insurance position and retains priority among unresolved positions', () => {
    const primary = { ...approved, insurancePosition: 'Primary' };
    const secondary = {
      ...approved,
      id: 'secondary',
      insuranceSlot: 'Secondary',
      determination: 'Denied',
    };
    expect(resolve([primary, secondary])).toMatchObject({
      state: 'Denied',
      coverage: 'secondary',
      satisfied: false,
      conflict: false,
    });
    expect(resolve([primary, { ...secondary, determination: 'Approved' }])).toMatchObject({
      state: 'Approved',
      satisfied: true,
      reason:
        'Current initial authorization prerequisites are satisfied for all insurance positions.',
    });
    expect(
      resolve([
        { ...primary, noAuthNeeded: true },
        { ...secondary, noAuthNeeded: true },
      ]).state
    ).toBe('No Auth Needed');
    const tertiary = {
      ...approved,
      id: 'tertiary',
      clientInsurance: 'Tertiary',
      determination: 'Pending',
    };
    expect(resolve([tertiary, secondary]).coverage).toBe('secondary');
    expect(
      resolve([
        primary,
        { ...approved, id: 'same-position', insurancePosition: 'Primary', determination: 'Denied' },
        secondary,
      ]).conflict
    ).toBe(true);
  });
});
