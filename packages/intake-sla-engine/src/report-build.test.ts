import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { billingCollectionReceipt } from './billing-collection.js';
import { readPrivateJson, writePrivateJson } from './private-run-storage.js';
import { buildIntakeReport } from './report-build.js';
import { prepareReportInterpreter } from './report-interpreter-setup.js';
import { REPORT_HISTORY_HEADERS, REPORT_QUEUE_HEADERS } from './report-vocabulary.js';

const directories: string[] = [];
const cutoff = '2026-09-24T16:00:00.000Z';
const id = ['006', '000000000001AAA'].join('');
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true }))
  );
});
async function fixture(): Promise<string> {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-build-')));
  directories.push(directory);
  const artifacts: Readonly<Record<string, unknown>> = {
    'opportunity_rows.json': [
      {
        Id: id,
        Name: 'Synthetic Alpha',
        StageName: 'IA Scheduled',
        Current_SLA__c: 'sla',
        Current_SLA__r: {
          CreatedDate: '2026-09-01',
          Reason_for_Delay_Notes__c: 'Provider will confirm the assessment date.',
        },
      },
    ],
    'billing_collection_contract.json': billingCollectionReceipt({
      records: [],
      opportunityIds: [id],
      cutoff,
    }),
    'reviewer_state.json': {
      capturedAt: cutoff,
      rows: [
        {
          opportunityId: id,
          reviewerNotes: '  Preserve exactly  ',
          copiedToSalesforce: false,
          needsCsmReview: null,
        },
      ],
    },
    'run_history_state.json': {
      headers: REPORT_HISTORY_HEADERS,
      rows: [['old-run', 'raw historical value', false]],
    },
  };
  for (const [name, value] of Object.entries(artifacts))
    await writePrivateJson(path.join(directory, name), value);
  return directory;
}
describe('complete saved report build', () => {
  it('builds all artifacts from frozen sources, preserves reviewer cells, and is repeatable without collection', async () => {
    const runDirectory = await fixture();
    const input = {
      runDirectory,
      runAt: new Date(cutoff),
      source: { mode: 'saved' as const },
      requireReviewerState: true,
      interpretation: prepareReportInterpreter({
        setting: 'on',
        environment: {},
        client: null,
        artifact: {},
      }),
      now: (): Date => new Date('2026-09-25T18:00:00.000Z'),
    };
    const result = await buildIntakeReport(input);
    expect(result.report.runManifest).toMatchObject({
      startedAt: cutoff,
      processedRows: 1,
      blockedRows: 1,
      publishStatus: 'Built - Pending Publish',
    });
    expect(result.workbook.generatedAt).toBe('2026-09-25T18:00:00.000Z');
    expect(result.report.rows[1]?.[REPORT_QUEUE_HEADERS.indexOf('Reviewer Notes')]).toBe(
      '  Preserve exactly  '
    );
    expect(result.report.rows[1]?.[REPORT_QUEUE_HEADERS.indexOf('Copied to Salesforce?')]).toBe(
      false
    );
    expect(result.report.rows[1]?.[REPORT_QUEUE_HEADERS.indexOf('Needs CSM Review')]).toBeNull();
    expect(result.report.runHistoryRows.at(-1)).toEqual(['old-run', 'raw historical value', false]);
    expect(await readPrivateJson(path.join(runDirectory, 'source_status_rows.json'))).toHaveLength(
      22
    );
    expect(
      await readPrivateJson(path.join(runDirectory, 'ai_interpretation_rows.json'))
    ).toMatchObject({ apiEnabled: false, usage: { inputTokens: 0, outputTokens: 0 } });
    expect(
      await readPrivateJson(path.join(runDirectory, 'generation_ledger_state.json'))
    ).toMatchObject([{ sourceCutoff: cutoff, publicationStatus: 'Built - Pending Publish' }]);
    expect(await buildIntakeReport(input)).toEqual(result);
    expect(await readPrivateJson(path.join(runDirectory, 'workbook-values.json'))).toEqual(
      JSON.parse(JSON.stringify(result.workbook))
    );
  }, 30_000);
  it('does not rebuild published runs or bypass missing reviewer capture', async () => {
    const runDirectory = await fixture();
    const input = {
      runDirectory,
      runAt: new Date(cutoff),
      source: { mode: 'saved' as const },
      requireReviewerState: true,
      interpretation: prepareReportInterpreter({
        setting: 'off',
        environment: {},
        client: null,
        artifact: {},
      }),
    };
    await fs.unlink(path.join(runDirectory, 'reviewer_state.json'));
    await expect(buildIntakeReport(input)).rejects.toThrow();
    await expect(fs.access(path.join(runDirectory, 'workbook-values.json'))).rejects.toThrow();
    await writePrivateJson(path.join(runDirectory, 'publication-readback.json'), {
      verified: true,
    });
    await expect(buildIntakeReport(input)).rejects.toThrow('immutable');
  }, 30_000);
});
