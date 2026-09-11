import type { OrganicPerformanceBundle, RouteRule } from './schemas.js';

type Period = OrganicPerformanceBundle['report']['periods'][number];
interface Availability {
  readonly eligible: boolean;
  readonly status:
    'available' | 'pre_launch' | 'partial_launch_month' | 'incomplete_month' | 'missing_period';
}

function firstFullMonth(launchedOn: string): string {
  const date = new Date(launchedOn + 'T00:00:00Z');
  if (date.getUTCDate() !== 1) {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function availability(period: Period | undefined, rule: RouteRule): Availability {
  if (!period) return { eligible: false, status: 'missing_period' };
  if (!rule.lifecycle) return { eligible: true, status: 'available' };
  if (period.endDate < rule.lifecycle.launchedOn) return { eligible: false, status: 'pre_launch' };
  if (period.startDate < firstFullMonth(rule.lifecycle.launchedOn))
    return { eligible: false, status: 'partial_launch_month' };
  const end = new Date(period.startDate + 'T00:00:00Z');
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const full =
    period.startDate.endsWith('-01') && end.toISOString().slice(0, 10) === period.endDate;
  return { eligible: full, status: full ? 'available' : 'incomplete_month' };
}

export interface CohortLifecycle {
  readonly id: string;
  readonly launchedOn: string | null;
  readonly launchEvidence: string | null;
  readonly firstFullMonth: string | null;
  readonly current: Availability;
  readonly previous: Availability;
  readonly year_ago: Availability;
  readonly momEligible: boolean;
  readonly yoyEligible: boolean;
  readonly state:
    Availability['status'] | 'first_full_baseline' | 'comparison_unavailable' | 'comparable';
}

/** Evidence for interpretation, not stakeholder copy. Observations are never discarded. */
export function buildLifecycle(
  periods: readonly Period[],
  rules: readonly RouteRule[]
): CohortLifecycle[] {
  return rules.map((rule) => {
    const current = availability(
      periods.find((p) => p.id === 'current'),
      rule
    );
    const previous = availability(
      periods.find((p) => p.id === 'previous'),
      rule
    );
    const yearAgo = availability(
      periods.find((p) => p.id === 'year_ago'),
      rule
    );
    const first = rule.lifecycle ? firstFullMonth(rule.lifecycle.launchedOn) : null;
    const isFirst = first !== null && periods.find((p) => p.id === 'current')?.startDate === first;
    return {
      id: rule.id,
      launchedOn: rule.lifecycle?.launchedOn ?? null,
      launchEvidence: rule.lifecycle?.evidenceUrl ?? null,
      firstFullMonth: first,
      current,
      previous,
      year_ago: yearAgo,
      momEligible: current.eligible && previous.eligible,
      yoyEligible: current.eligible && yearAgo.eligible,
      state: !current.eligible
        ? current.status
        : isFirst
          ? 'first_full_baseline'
          : !previous.eligible
            ? 'comparison_unavailable'
            : 'comparable',
    };
  });
}
