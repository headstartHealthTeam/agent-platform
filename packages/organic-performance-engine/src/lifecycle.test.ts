import { describe, expect, it } from 'vitest';

import { buildLifecycle } from './lifecycle.js';
import type { OrganicPerformanceBundle, RouteRule } from './schemas.js';

const resource: RouteRule = {
  id: 'resources',
  exactPaths: ['/resources'],
  prefixes: ['/resources'],
  lifecycle: {
    launchedOn: '2026-09-08',
    evidenceUrl: 'https://example.com/verified-release',
    comparisonPolicy: 'complete-post-launch-months',
  },
};
function periods(month: string): OrganicPerformanceBundle['report']['periods'] {
  const date = new Date(month + '-01T00:00:00Z');
  return [
    { id: 'current', delta: 0 },
    { id: 'previous', delta: -1 },
    { id: 'year_ago', delta: -12 },
  ].map(({ id, delta }) => {
    const start = new Date(date);
    start.setUTCMonth(start.getUTCMonth() + delta);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    if (id !== 'current' && id !== 'previous' && id !== 'year_ago')
      throw new Error('Invalid period');
    return {
      id,
      label: start.toISOString().slice(0, 7),
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  });
}
describe('architecture lifecycle', () => {
  it.each([
    ['2026-07', 'pre_launch', false, false],
    ['2026-08', 'pre_launch', false, false],
    ['2026-09', 'partial_launch_month', false, false],
    ['2026-10', 'first_full_baseline', false, false],
    ['2026-11', 'comparable', true, false],
    ['2027-09', 'comparable', true, false],
    ['2027-10', 'comparable', true, true],
  ])(
    'handles %s without carrying pre-launch labels forward',
    (month, state, momEligible, yoyEligible) => {
      expect(buildLifecycle(periods(month), [resource])[0]).toMatchObject({
        state,
        momEligible,
        yoyEligible,
        firstFullMonth: '2026-10-01',
      });
    }
  );
  it('supports a first-day launch, partial reporting, omitted history, and established sections', () => {
    const full = {
      ...resource,
      lifecycle: {
        ...resource.lifecycle,
        launchedOn: '2026-09-01',
        evidenceUrl: 'https://example.com/release',
        comparisonPolicy: 'complete-post-launch-months',
      },
    } satisfies RouteRule;
    expect(buildLifecycle(periods('2026-09'), [full])[0]?.current.eligible).toBe(true);
    const current = periods('2026-10').find((p) => p.id === 'current');
    if (!current) throw new Error('Missing fixture');
    expect(buildLifecycle([{ ...current, endDate: '2026-10-20' }], [resource])[0]).toMatchObject({
      state: 'incomplete_month',
      previous: { status: 'missing_period' },
    });
    expect(
      buildLifecycle(periods('2026-08'), [
        {
          id: 'legacy',
          exactPaths: [],
          prefixes: ['/blogs'],
        },
      ])[0]
    ).toMatchObject({ state: 'comparable', firstFullMonth: null, yoyEligible: true });
  });
  it('does not relabel later missing history as a newly launched baseline', () => {
    const currentOnly = periods('2029-10').filter((p) => p.id === 'current');
    expect(buildLifecycle(currentOnly, [resource])[0]).toMatchObject({
      state: 'comparison_unavailable',
      momEligible: false,
      firstFullMonth: '2026-10-01',
    });
  });
});
