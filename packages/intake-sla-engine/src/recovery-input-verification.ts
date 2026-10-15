import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { captureProperty } from './google-capture-property.js';
import { sha256Json } from './json-fingerprint.js';
import { normalizePortalAuthCapture } from './portal-auth-capture.js';
import { optionalPrivateJson, readPrivateJson } from './private-run-storage.js';
import { materializeSlackSearchCapture } from './slack-search-capture.js';

function object(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function rows(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
const ledgerSchema = z.array(z.looseObject({ runId: z.unknown().optional() }));
async function verifyCorrection(runDirectory: string, runId: string, asOf: string): Promise<void> {
  const correction = await optionalPrivateJson(
    path.join(runDirectory, 'correction_provenance.json')
  );
  const initialized = await optionalPrivateJson(
    path.join(runDirectory, 'correction_initialization.json')
  );
  if (correction === undefined && initialized === undefined) return;
  check(
    object(correction) &&
      correction['runId'] === runId &&
      correction['asOf'] === asOf &&
      captureProperty(initialized, 'complete') === true &&
      sha256Json(initialized) === sha256Json({ ...correction, complete: true }),
    'Correction initialization is incomplete or uses another cutoff'
  );
  const ledger = ledgerSchema.safeParse(
    await readPrivateJson(path.join(runDirectory, 'generation_ledger_state.json'))
  );
  check(
    ledger.success &&
      sha256Json(ledger.data.filter((row) => row.runId !== runId)) === correction['ledgerHash'],
    "Correction's published base ledger changed"
  );
}
export async function verifyRecoveryInputs(
  runDirectory: string,
  runId: string,
  asOf: string
): Promise<void> {
  await verifyCorrection(runDirectory, runId, asOf);
  const portal = await optionalPrivateJson(
    path.join(runDirectory, 'portal_auth_request_inventory.json')
  );
  const rawPortal = await optionalPrivateJson(
    path.join(runDirectory, 'portal_auth_request_capture.json')
  );
  if (rawPortal !== undefined || Boolean(captureProperty(portal, 'captureHash'))) {
    check(
      captureProperty(rawPortal, 'runId') === runId &&
        captureProperty(rawPortal, 'asOf') === asOf &&
        sha256Json(normalizePortalAuthCapture(rawPortal)) === sha256Json(portal),
      'Portal capture or derived inventory changed'
    );
  }
  const rawSlack = await optionalPrivateJson(path.join(runDirectory, 'slack_search_capture.json'));
  const slack = await optionalPrivateJson(
    path.join(runDirectory, 'slack_full_sweep_exact_name.json')
  );
  if (
    rawSlack !== undefined ||
    (rows(slack) && slack.some((row) => Boolean(captureProperty(row, 'captureHash'))))
  ) {
    check(
      captureProperty(rawSlack, 'runId') === runId &&
        captureProperty(rawSlack, 'asOf') === asOf &&
        sha256Json(
          materializeSlackSearchCapture({
            plan: await readPrivateJson(path.join(runDirectory, 'slack_full_sweep_plan.json')),
            capture: rawSlack,
          })
        ) === sha256Json(slack),
      'Slack capture or derived search rows changed'
    );
  }
}
