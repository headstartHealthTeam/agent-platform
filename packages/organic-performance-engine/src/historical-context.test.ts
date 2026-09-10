import { describe, expect, it } from 'vitest';

import { buildHistoricalContext } from './historical-context.js';

describe('historical context policy', () => {
  it('separates August reporting, change-history, and metric-history windows', () => {
    const context = buildHistoricalContext('2026-08-31');
    expect(context.changeHistory).toEqual({
      months: 12,
      startDate: '2025-09-01',
      endDate: '2026-08-31',
    });
    expect(context.metricHistory).toEqual({
      months: 16,
      startDate: '2025-05-01',
      endDate: '2026-08-31',
    });
    expect(context.performanceEvidenceCutoff).toBe('2026-08-31');
    expect(context.sameMonthReleaseRequired).toBe(false);
    expect(context.retainOlderMaterialInitiatives).toBe(true);
    expect(context.evidenceStatus).toBe('requires_agent_collection_and_coverage_verification');
  });

  it.each([
    ['2024-02-29', '2023-03-01', '2022-11-01'],
    ['2026-01-31', '2025-02-01', '2024-10-01'],
    ['2026-08-15', '2025-09-01', '2025-05-01'],
  ])('uses UTC calendar months without extending beyond %s', (end, changes, metrics) => {
    const context = buildHistoricalContext(end);
    expect(context.changeHistory.startDate).toBe(changes);
    expect(context.metricHistory.startDate).toBe(metrics);
    expect(context.changeHistory.endDate).toBe(end);
    expect(context.metricHistory.endDate).toBe(end);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-08-31T00:00:00Z', '', undefined])(
    'rejects an invalid or missing report end: %s',
    (end) => {
      expect(() => buildHistoricalContext(end)).toThrow();
    }
  );
});
