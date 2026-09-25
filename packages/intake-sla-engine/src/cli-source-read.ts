import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  createGoogleAdcTokenProvider,
  GoogleReaderError,
} from '@headstart-health/google-read-transport';
import { z } from 'zod';

import {
  intakeStringArgument,
  optionalIntakeArgument,
  parseIntakeArguments,
} from './cli-arguments.js';
import type { IntakeCommandResult } from './cli-publication.js';
import { preserveCollectionRecord } from './collection-decoding.js';
import { captureProperty } from './google-capture-property.js';
import { createGoogleReadOnlyAdapter } from './google-publication-adapter.js';
import {
  localArtifactPath,
  privateDirectory,
  readPrivateJson,
  requireMutableRun,
  writePrivateJson,
} from './private-run-storage.js';
import { checkIntakeProductionFingerprint } from './production-fingerprint.js';
import { assertCommandGate } from './publication-command-storage.js';
import { finalizePublication } from './publication-executor.js';
import { assertPublicationGateBinding } from './publication-payload.js';
import { verifyPublicationStageActual } from './publication-readback.js';
import { connectIntakeSalesforce, intakeSalesforceTargetFromEnv } from './salesforce-reader.js';

const baselineSchema = z.looseObject({
  capturedAt: z.unknown().optional(),
  apex: z.record(z.string(), z.string()),
  flows: z.record(
    z.string(),
    z.looseObject({ activeVersionId: z.string(), versionNumber: z.number() })
  ),
  slaMetadata: z.array(z.tuple([z.string(), z.number().nullable(), z.string()])),
});
const readManifestSchema = z.object({
  runId: z.string(),
  spreadsheetId: z.string(),
  planHash: z.string(),
});
function success(value: unknown, pretty = false, exitCode = 0): IntakeCommandResult {
  return {
    exitCode,
    stdout: `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`,
    stderr: '',
  };
}

/** Explicit host target and approved private baseline; metadata queries only, never Salesforce writes. */
export async function runProductionDriftCommand(
  argv: readonly string[],
  environment: Readonly<NodeJS.ProcessEnv> = process.env
): Promise<IntakeCommandResult> {
  let phase = 'configuration';
  try {
    const args = parseIntakeArguments(argv);
    const baselineFile =
      optionalIntakeArgument(args, 'fingerprint') ?? environment['SLA_PRODUCTION_FINGERPRINT_PATH'];
    if (!baselineFile) throw new Error('Explicit private Production fingerprint required');
    const directory = await privateDirectory(
      intakeStringArgument(args, 'run-dir', 'review:drift requires --run-dir')
    );
    const baseline = preserveCollectionRecord(baselineSchema).parse(
      await readPrivateJson(baselineFile)
    );
    phase = 'verified-salesforce-read';
    const reader = await connectIntakeSalesforce(intakeSalesforceTargetFromEnv(environment));
    const checked = await checkIntakeProductionFingerprint(reader, baseline);
    phase = 'private-receipt';
    await writePrivateJson(path.join(directory, 'production-drift-check.json'), checked);
    return success(checked.result, true, checked.result.publishable ? 0 : 2);
  } catch {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify({ code: 'INTAKE_PRODUCTION_DRIFT_FAILED', phase })}\n`,
    };
  }
}

function verifyQueueFilters(response: unknown): void {
  const raw = captureProperty(response, 'sheets');
  const sheets: readonly unknown[] = Array.isArray(raw) ? raw : [];
  for (const title of ['Review Queue', 'On-Hold Review']) {
    const selected = sheets.filter(
      (sheet) => captureProperty(captureProperty(sheet, 'properties'), 'title') === title
    );
    const sheet = selected[0];
    const range = captureProperty(captureProperty(sheet, 'basicFilter'), 'range');
    const hasRange = Boolean(range);
    if (
      selected.length !== 1 ||
      !hasRange ||
      captureProperty(range, 'sheetId') !==
        captureProperty(captureProperty(sheet, 'properties'), 'sheetId')
    )
      throw new GoogleReaderError('GOOGLE_READER_FILTER_METADATA_MISSING');
  }
}

/** The approved ADC readback path has no apply capability and remains usable after write-lease expiry. */
export async function runGoogleReadCommand(argv: readonly string[]): Promise<IntakeCommandResult> {
  try {
    const args = parseIntakeArguments(argv);
    const action = args['action'];
    const spreadsheetId = args['spreadsheet-id'];
    const hasRunDirectory = Boolean(args['run-dir']);
    if (
      !['preflight', 'stage', 'final'].includes(String(action)) ||
      !hasRunDirectory ||
      typeof spreadsheetId !== 'string' ||
      !/^[\w-]+$/.test(spreadsheetId)
    )
      throw new GoogleReaderError('GOOGLE_READER_ARGUMENTS_REQUIRED');
    const directory = await privateDirectory(
      intakeStringArgument(args, 'run-dir', 'run directory required')
    );
    await requireMutableRun(directory);
    let manifest;
    if (action !== 'preflight') {
      const raw = await readPrivateJson(path.join(directory, 'publication_stages_manifest.json'));
      if (captureProperty(raw, 'spreadsheetId') !== spreadsheetId)
        throw new GoogleReaderError('GOOGLE_READER_TARGET_MISMATCH');
      const gate = await readPrivateJson(path.join(directory, 'publication-gate.json'));
      assertCommandGate(gate);
      manifest = preserveCollectionRecord(readManifestSchema).parse(raw);
      assertPublicationGateBinding(manifest, gate);
    }
    const runId = manifest?.runId ?? path.basename(directory);
    const tokenProvider = createGoogleAdcTokenProvider({
      configDir: optionalIntakeArgument(args, 'config-dir') ?? '',
      clientIdFile: optionalIntakeArgument(args, 'client-id-file') ?? '',
      expectedEmail: optionalIntakeArgument(args, 'expected-email') ?? '',
      execFile: promisify(execFile),
      readFile: fs.readFile,
      lstat: fs.lstat,
    });
    // The read-only adapter uses the target identity, not the unused write-stage list.
    const adapter = createGoogleReadOnlyAdapter({
      manifest: { runId, spreadsheetId, stages: [] },
      tokenProvider,
    });
    if (action === 'preflight') {
      const response = await adapter.readMetadata();
      verifyQueueFilters(response);
      const receipt = {
        version: 1,
        passed: true,
        checkedAt: new Date().toISOString(),
        spreadsheetId,
        readOnly: true,
        identityVerified: true,
        credentialSource: 'explicit-headstart-gcloud-adc',
        response,
      };
      await writePrivateJson(path.join(directory, 'google_reader_preflight.json'), receipt);
      return success({
        passed: true,
        checkedAt: receipt.checkedAt,
        readOnly: true,
        identityVerified: true,
        queueFiltersVerified: 2,
      });
    }
    if (action === 'final')
      return success(await finalizePublication({ runDir: directory, adapter }));
    const rawStage = z
      .array(z.unknown())
      .parse(captureProperty(manifest, 'stages'))
      .find((item) => captureProperty(item, 'id') === args['stage-id']);
    if (rawStage === undefined) throw new GoogleReaderError('GOOGLE_READER_STAGE_REQUIRED');
    const stage = preserveCollectionRecord(
      z.object({
        id: z.string(),
        assertions: z.array(preserveCollectionRecord(z.object({ id: z.string() }))),
      })
    ).parse(rawStage);
    const assertions = stage.assertions;
    const actual = await adapter.readAssertions({ runId, spreadsheetId, assertions });
    await writePrivateJson(
      localArtifactPath(directory, `publication_actual_${stage.id}.json`),
      actual
    );
    verifyPublicationStageActual(stage, actual);
    return success({
      stageId: stage.id,
      readOnly: true,
      verifiedAssertions: actual.assertions.length,
    });
  } catch (error) {
    const status = captureProperty(error, 'status');
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${JSON.stringify({
        passed: false,
        code: error instanceof GoogleReaderError ? error.code : 'GOOGLE_READBACK_FAILED',
        status: typeof status === 'number' && Number.isInteger(status) ? status : null,
      })}\n`,
    };
  }
}
