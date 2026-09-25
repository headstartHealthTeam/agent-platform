import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  intakeStringArgument,
  optionalIntakeArgument,
  parseIntakeArguments,
} from './cli-arguments.js';
import { syntheticCliArguments } from './cli-launch.test-support.js';
import { runSavedPublicationCommand } from './cli-publication.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { publicationStorageFixture } from './google-publication-fixture.test-helper.js';
import { sha256Json } from './json-fingerprint.js';
import { writePrivateJson } from './private-run-storage.js';
import { readPublicationJson } from './publication-command-storage.js';
import { publicationPlanHash } from './publication-plan.js';

let directory: string;
const IDS = ['02-review-queue', '08-terminal-marker', '09-run-history'];
const MANIFEST = 'publication_stages_manifest.json';
const OBSERVATIONS = 'publication_stage_readbacks.json';
const RECEIPT = 'publication-readback.json';
const CAPTURED_AT = '2026-01-01T00:00:00Z';
beforeEach(async () => {
  directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'intake-cli-')));
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
const write = (name: string, value: unknown): Promise<void> =>
  writePrivateJson(path.join(directory, name), value);
async function manualFixture(): Promise<void> {
  const stages = [];
  for (const id of IDS) {
    const payload = { requests: [{ synthetic: id }] };
    const stage = {
      id,
      file: `${id}.json`,
      payloadHash: sha256Json(payload),
      calls: [{ file: `${id}-call.json`, payloadHash: sha256Json(payload) }],
      assertions: [
        { id, kind: 'values', rowCount: 1, columnCount: 1, expectedHash: sha256Json([[id]]) },
      ],
    };
    stages.push(stage);
    await write(stage.file, payload);
    await write(`${id}-call.json`, payload);
  }
  const finalAssertions = stages.flatMap((stage) => stage.assertions);
  const binding = {
    runId: 'run',
    spreadsheetId: 'sheet',
    planHash: publicationPlanHash(stages, finalAssertions),
  };
  await write(MANIFEST, { ...binding, stages, finalAssertions });
  await write('publication-gate.json', {
    ...binding,
    passed: true,
    evaluatedAt: new Date().toISOString(),
  });
  await write(OBSERVATIONS, { ...binding, stages: [] });
  await write('actual.json', {});
}
function launch(args: readonly string[]): Promise<IntakeCommandResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [...syntheticCliArguments(import.meta.url), ...args],
      { cwd: directory, encoding: 'utf8', timeout: 15_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : 1,
          stdout,
          stderr,
        });
      }
    );
  });
}
function rawCapture(): unknown {
  const titles = [
    'Review Queue',
    'On-Hold Review',
    'Evidence Detail',
    'Data Dictionary',
    'Source & Run Notes',
    'Generation Ledger',
    'Run History',
  ];
  const timestamp = CAPTURED_AT;
  return {
    version: 1,
    spreadsheetId: 'sheet',
    capturedAt: timestamp,
    valueRenderOption: 'USER_ENTERED',
    extentsVerified: true,
    concurrency: {
      currentRunId: 'run',
      checkedAt: timestamp,
      conflict: false,
      operatorVerified: true,
    },
    sheets: titles.map((title, sheetId) => {
      const rows =
        title === 'Review Queue' || title === 'On-Hold Review'
          ? [
              [
                'Opportunity Name',
                'Salesforce',
                'Needs CSM Review',
                'Reviewer Notes',
                'Copied to Salesforce?',
                'Reviewed By',
                'Reviewed At',
              ],
            ]
          : title === 'Source & Run Notes'
            ? [
                ['Run ID', 'prior'],
                ['Last Refresh (ET)', 'prior time'],
              ]
            : title === 'Run History'
              ? [['Run ID'], ['prior']]
              : [['Header']];
      return {
        title,
        sheetId,
        rowCount: 100,
        columnCount: 10,
        usedRowCount: rows.length,
        rangeComplete: true,
        values: rows.map((row) => row.map((stringValue) => ({ stringValue }))),
      };
    }),
  };
}
describe('local Intake saved-command CLI', () => {
  it('retains original flag parsing without an invented unknown-option restriction', () => {
    expect(
      parseIntakeArguments([
        'positional',
        '--run-dir',
        'first',
        '--unused',
        '--run-dir',
        'second',
        '--empty',
        '',
        '--last',
      ])
    ).toEqual({ 'run-dir': 'second', unused: true, empty: true, last: true });
    expect(intakeStringArgument({ value: 'value' }, 'value', 'usage')).toBe('value');
    expect(() => intakeStringArgument({ value: true }, 'value', 'usage')).toThrow('usage');
    expect(optionalIntakeArgument({}, 'value')).toBeUndefined();
    expect(optionalIntakeArgument({ value: 'value' }, 'value')).toBe('value');
    expect(() => optionalIntakeArgument({ value: true }, 'value')).toThrow('requires a value');
  });
  it.each([
    'review:next-publish-stage',
    'review:capture-publish-readback',
    'review:verify-publish',
    'build-google-payloads',
  ])('shows usage for missing %s arguments', async (command) => {
    await expect(runSavedPublicationCommand(command, [])).rejects.toThrow(
      'Usage: headstart-intake-sla'
    );
  });
  it('routes saved stage inspection and incomplete verification with exit status two', async () => {
    await manualFixture();
    const args = ['--run-dir', directory, '--unused'];
    const next = await runSavedPublicationCommand('review:next-publish-stage', args);
    expect(next.exitCode).toBe(0);
    expect(JSON.parse(next.stdout)).toMatchObject({ complete: false, stageId: IDS[0] });
    const incomplete = await runSavedPublicationCommand('review:verify-publish', [
      ...args,
      '--actual',
      path.join(directory, 'actual.json'),
    ]);
    expect(incomplete.exitCode).toBe(2);
    expect(JSON.parse(incomplete.stdout)).toHaveProperty('publicationStatus', 'In Progress');
    await expect(fs.access(path.join(directory, RECEIPT))).rejects.toThrow();
  }, 30_000);
  it('runs the actual process from another working directory through stage and final readbacks', async () => {
    await manualFixture();
    const args = ['--run-dir', directory];
    expect(
      (
        await launch([
          'review:verify-publish',
          ...args,
          '--actual',
          path.join(directory, 'actual.json'),
        ])
      ).exitCode
    ).toBe(2);
    for (const id of IDS) {
      const next = await launch(['review:next-publish-stage', ...args]);
      expect(next.stderr).toBe('');
      expect(JSON.parse(next.stdout)).toHaveProperty('stageId', id);
      await write('actual.json', { assertions: [{ id, values: [[id]] }] });
      const captured = await launch([
        'review:capture-publish-readback',
        ...args,
        '--stage-id',
        id,
        '--actual',
        path.join(directory, 'actual.json'),
      ]);
      expect(captured.exitCode).toBe(0);
      expect(JSON.parse(captured.stdout)).toMatchObject({ recorded: id, verifiedAssertions: 1 });
    }
    expect(JSON.parse((await launch(['review:next-publish-stage', ...args])).stdout)).toEqual({
      complete: true,
    });
    await write('actual.json', {
      runId: 'run',
      spreadsheetId: 'sheet',
      assertions: IDS.map((id) => ({ id, values: [[id]] })),
    });
    const final = await launch([
      'review:verify-publish',
      ...args,
      '--actual',
      path.join(directory, 'actual.json'),
    ]);
    expect(final.exitCode).toBe(0);
    expect(final.stderr).toBe('');
    expect(await readPublicationJson(path.join(directory, RECEIPT))).toHaveProperty(
      'complete',
      true
    );
  }, 30_000);
  it('prepares the original staged files through the actual positional builder command', async () => {
    for (const [name, value] of Object.entries(publicationStorageFixture()))
      await write(name, value);
    const result = await launch(['build-google-payloads', directory]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      runId: 'run',
      spreadsheetId: 'sheet',
      runHistoryLast: true,
    });
    expect(await readPublicationJson(path.join(directory, MANIFEST))).toHaveProperty(
      'runHistoryLast',
      true
    );
  }, 20_000);
  it('captures supplied Google state and preserves the command-specific sanitized failure', async () => {
    await write('input.json', rawCapture());
    const args = [
      '--run-dir',
      directory,
      '--spreadsheet-id',
      'sheet',
      '--run-id',
      'run',
      '--input',
      path.join(directory, 'input.json'),
    ];
    const captured = await runSavedPublicationCommand('review:google-capture', args);
    expect(captured).toEqual({
      exitCode: 0,
      stdout: '{"captured":true,"reviewerRows":0,"conflict":false}\n',
      stderr: '',
    });
    await expect(
      fs.access(path.join(directory, 'google_state_capture.json'))
    ).resolves.toBeUndefined();
    const invalid = await runSavedPublicationCommand('review:google-capture', [
      '--run-dir',
      directory,
      '--input',
    ]);
    expect(invalid).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '{"code":"GOOGLE_STATE_CAPTURE_FAILED"}\n',
    });
  }, 30_000);
  it('does not validate an unused value-less input flag during retained-capture revalidation', async () => {
    await write('google_state_capture.json', rawCapture());
    await write('proof.json', {
      checkedAt: '2026-01-02T00:00:00Z',
      response: {
        isError: false,
        structuredContent: {
          id: 'sheet',
          mime_type: 'application/vnd.google-apps.spreadsheet',
          modified_time: CAPTURED_AT,
        },
      },
      concurrency: {
        currentRunId: 'run',
        checkedAt: '2026-01-02T00:00:00Z',
        conflict: false,
        operatorVerified: true,
      },
    });
    const result = await runSavedPublicationCommand('review:google-capture', [
      '--run-dir',
      directory,
      '--spreadsheet-id',
      'sheet',
      '--run-id',
      'run',
      '--input',
      '--revalidate',
      path.join(directory, 'proof.json'),
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(
      await readPublicationJson(path.join(directory, 'google_state_capture.json'))
    ).toHaveProperty('revalidation.checkedAt', '2026-01-02T00:00:00Z');
  }, 30_000);
  it('exits nonzero for unknown commands and malformed required arguments', async () => {
    await expect(runSavedPublicationCommand('unknown', [])).rejects.toThrow(
      'Unknown Intake command'
    );
    for (const args of [[], ['review:next-publish-stage', '--run-dir'], ['unknown']]) {
      const result = await launch(args);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^Error: /);
    }
  }, 20_000);
});
