import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import { GOVERNED_SHEETS } from './google-capture-values.js';
import { captureGooglePublicationState } from './google-state-capture.js';
import { verifyGoogleStateCapture } from './google-state-storage.js';
import { sha256Json } from './json-fingerprint.js';
import { writePrivateJson } from './private-run-storage.js';

const CAPTURED = '2026-01-01T00:00:00Z';
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});
function fixture(): {
  version: number;
  spreadsheetId: string;
  capturedAt: string;
  valueRenderOption: string;
  extentsVerified: boolean;
  concurrency: object;
  sheets: unknown[];
} {
  const headers = [
    'Opportunity Name',
    'Salesforce',
    'Needs CSM Review',
    'Reviewer Notes',
    'Copied to Salesforce?',
    'Reviewed By',
    'Reviewed At',
  ];
  return {
    version: 1,
    spreadsheetId: 'synthetic',
    capturedAt: CAPTURED,
    valueRenderOption: 'USER_ENTERED',
    extentsVerified: true,
    concurrency: {
      currentRunId: 'current',
      checkedAt: CAPTURED,
      conflict: false,
      operatorVerified: true,
    },
    sheets: GOVERNED_SHEETS.map((title, sheetId) => {
      const rows =
        title.endsWith('Review') || title === 'Review Queue'
          ? [headers]
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
async function harness(): Promise<string> {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-google-state-'))
  );
  directories.push(directory);
  return directory;
}
async function save(directory: string, raw: unknown): Promise<void> {
  const result = captureGooglePublicationState(raw, 'synthetic', 'current');
  for (const [name, value] of Object.entries({
    google_state_capture: raw,
    google_sheet_metadata_current: result.metadata,
    google_publication_state: result.state,
    live_sheet_marker_current: result.marker,
    reviewer_state_current: result.reviewer,
    competing_run_state: result.competing,
  }))
    await writePrivateJson(path.join(directory, `${name}.json`), value);
}
describe('raw Google state and projection transaction verification', () => {
  it('preserves legacy raw timestamp values instead of imposing a new string-only gate', async () => {
    const directory = await harness();
    for (const timestamp of [0, 1, 2026]) {
      const raw = {
        ...fixture(),
        capturedAt: timestamp,
        concurrency: {
          currentRunId: 'current',
          checkedAt: timestamp,
          conflict: false,
          operatorVerified: true,
        },
      };
      const result = captureGooglePublicationState(raw, 'synthetic', 'current');
      expectTypeOf(result.metadata.capturedAt).toEqualTypeOf<unknown>();
      expect(result.metadata.capturedAt).toBe(timestamp);
      expect(result.competing.checkedAt).toBe(timestamp);
      expect(result.metadata.captureHash).toBe(sha256Json(raw));
      await save(directory, raw);
      await expect(
        verifyGoogleStateCapture(directory, 'synthetic', 'current')
      ).resolves.toBeUndefined();
      const revalidated = {
        ...raw,
        revalidation: {
          checkedAt: timestamp,
          response: {
            isError: false,
            structuredContent: {
              id: 'synthetic',
              mime_type: 'application/vnd.google-apps.spreadsheet',
              modified_time: timestamp,
            },
          },
          concurrency: raw.concurrency,
        },
      };
      const refreshed = captureGooglePublicationState(revalidated, 'synthetic', 'current');
      expect(refreshed.competing.checkedAt).toBe(timestamp);
      expect(refreshed.metadata.revalidatedAt).toBe(timestamp === 0 ? undefined : timestamp);
      expect(Object.hasOwn(refreshed.metadata, 'revalidatedAt')).toBe(timestamp !== 0);
      await save(directory, revalidated);
      await expect(
        verifyGoogleStateCapture(directory, 'synthetic', 'current')
      ).resolves.toBeUndefined();
    }
  });
  it('consumes only governed extents while retaining all raw provenance in hashes', async () => {
    const directory = await harness();
    const raw = { ...fixture(), optionalMetadata: { retain: [false, 0, null] } };
    raw.sheets.push({
      title: 'Unrelated tab',
      sheetId: 99,
      values: 'not consumed',
      rowCount: false,
    });
    const result = captureGooglePublicationState(raw, 'synthetic', 'current');
    expect(result.metadata.captureHash).toBe(sha256Json(raw));
    expect(result.state.sheets).toHaveLength(7);
    await save(directory, raw);
    const before = await fs.readFile(path.join(directory, 'google_state_capture.json'), 'utf8');
    await expect(
      verifyGoogleStateCapture(directory, 'synthetic', 'current')
    ).resolves.toBeUndefined();
    expect(await fs.readFile(path.join(directory, 'google_state_capture.json'), 'utf8')).toBe(
      before
    );
    raw.sheets.push({ title: 'Unrelated tab', sheetId: 100 });
    expect(() => captureGooglePublicationState(raw, 'synthetic', 'current')).toThrow(
      'Duplicate Google Sheet'
    );
    raw.sheets.pop();
    raw.sheets.push({ title: 'Other', sheetId: 99 });
    expect(() => captureGooglePublicationState(raw, 'synthetic', 'current')).toThrow(
      'Duplicate Google Sheet'
    );
  });
  it('rejects malformed consumed rows and preserves the original validation order', () => {
    const raw = fixture();
    raw.sheets[0] = {
      title: 'Review Queue',
      sheetId: 0,
      rowCount: 100,
      columnCount: 10,
      usedRowCount: 1,
      rangeComplete: true,
      values: [null],
    };
    expect(() => captureGooglePublicationState(raw, 'synthetic', 'current')).toThrow(
      'extent capture'
    );
    expect(() =>
      captureGooglePublicationState(
        { ...raw, revalidation: { checkedAt: CAPTURED } },
        'synthetic',
        'current'
      )
    ).toThrow('unchanged-file proof');
    expect(() =>
      captureGooglePublicationState({ ...raw, sheets: [null] }, 'synthetic', 'current')
    ).toThrow(TypeError);
    expect(() => captureGooglePublicationState(null, 'synthetic', 'current')).toThrow('provenance');
  });
  it('checks every projection and does not accept a changed raw envelope', async () => {
    const directory = await harness();
    const raw = fixture();
    const names = [
      'google_sheet_metadata_current',
      'google_publication_state',
      'live_sheet_marker_current',
      'reviewer_state_current',
      'competing_run_state',
    ];
    for (const name of names) {
      await save(directory, raw);
      await writePrivateJson(path.join(directory, `${name}.json`), { changed: true });
      await expect(verifyGoogleStateCapture(directory, 'synthetic', 'current')).rejects.toThrow(
        'transaction'
      );
    }
    await save(directory, raw);
    await writePrivateJson(path.join(directory, 'google_state_capture.json'), {
      ...raw,
      extra: 'changed',
    });
    await expect(verifyGoogleStateCapture(directory, 'synthetic', 'current')).rejects.toThrow(
      'transaction'
    );
    await save(directory, raw);
    await fs.unlink(path.join(directory, 'reviewer_state_current.json'));
    await expect(verifyGoogleStateCapture(directory, 'synthetic', 'current')).rejects.toMatchObject(
      { code: 'ENOENT' }
    );
  });
  it('retains compatibility with an unhashed legacy snapshot, but never ignores invalid JSON or a claimed capture', async () => {
    const directory = await harness();
    const metadata = path.join(directory, 'google_sheet_metadata_current.json');
    await writePrivateJson(metadata, { capturedAt: CAPTURED, sheets: [] });
    await expect(
      verifyGoogleStateCapture(directory, 'synthetic', 'current')
    ).resolves.toBeUndefined();
    await writePrivateJson(metadata, { captureHash: 'claimed' });
    await expect(verifyGoogleStateCapture(directory, 'synthetic', 'current')).rejects.toThrow(
      'provenance'
    );
    await fs.writeFile(path.join(directory, 'google_state_capture.json'), '{', { mode: 0o600 });
    await expect(verifyGoogleStateCapture(directory, 'synthetic', 'current')).rejects.toThrow(
      SyntaxError
    );
  });
  it('verifies retained snapshot proof without changing its timestamp or raw hashes', async () => {
    const directory = await harness();
    const raw = {
      ...fixture(),
      revalidation: {
        checkedAt: '2026-01-02T00:00:00Z',
        response: {
          isError: false,
          structuredContent: {
            id: 'synthetic',
            mime_type: 'application/vnd.google-apps.spreadsheet',
            modified_time: CAPTURED,
          },
        },
        concurrency: {
          currentRunId: 'current',
          checkedAt: '2026-01-02T00:00:00Z',
          conflict: false,
          operatorVerified: true,
        },
        extraProofMetadata: { retained: true },
      },
    };
    const result = captureGooglePublicationState(raw, 'synthetic', 'current');
    expect(result.metadata.capturedAt).toBe(CAPTURED);
    expect(result.metadata.revalidationHash).toBe(sha256Json(raw.revalidation));
    await save(directory, raw);
    await expect(
      verifyGoogleStateCapture(directory, 'synthetic', 'current')
    ).resolves.toBeUndefined();
  });
});
