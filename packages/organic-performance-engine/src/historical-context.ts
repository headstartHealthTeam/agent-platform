import { z } from 'zod';

const POLICY = {
  policyVersion: 'organic-historical-context/v1',
  policyBasis: 'approved_operating_policy_not_industry_standard',
  evidenceStatus: 'requires_agent_collection_and_coverage_verification',
  retainOlderMaterialInitiatives: true,
  sameMonthReleaseRequired: false,
  observationWindowOwner: 'agent_per_initiative',
  evidencePacketRequired: true,
} as const;

interface HistoricalWindow {
  readonly months: number;
  readonly startDate: string;
  readonly endDate: string;
}

export type HistoricalContext = typeof POLICY & {
  readonly changeHistory: HistoricalWindow;
  readonly metricHistory: HistoricalWindow;
  readonly performanceEvidenceCutoff: string;
};

/** Requested investigation windows, not a claim that contextual evidence was collected. */
export function buildHistoricalContext(reportEnd: unknown): HistoricalContext {
  const endDate = z.iso.date().parse(reportEnd);
  const window = (months: number): HistoricalWindow => {
    const start = new Date(`${endDate}T00:00:00Z`);
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - months + 1);
    return { months, startDate: start.toISOString().slice(0, 10), endDate };
  };

  return {
    ...POLICY,
    changeHistory: window(12),
    metricHistory: window(16),
    performanceEvidenceCutoff: endDate,
  };
}
