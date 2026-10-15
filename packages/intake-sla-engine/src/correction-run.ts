import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import type { StoredGenerationLedgerRow } from './generation-ledger-storage.js';
import {
  GENERATION_LEDGER_HEADERS,
  generationHash,
  generationLedgerRows,
} from './generation-ledger.js';
import { googleCellValue } from './google-publication-values.js';
import { sha256Json } from './json-fingerprint.js';
import { assertPublicationGateBinding } from './publication-payload.js';
import type {
  PublicationGateBinding,
  PublicationManifestInput,
  PublicationObservations,
} from './publication-readback-types.js';
import { evaluatePublicationReadback } from './publication-readback.js';

export interface CorrectionBaseManifest {
  readonly runId: string;
  readonly startedAt: string;
  readonly expectedRows: number;
  readonly processedRows: number;
}
export interface CorrectionRunInput {
  readonly baseManifest: CorrectionBaseManifest;
  readonly stageManifest: PublicationManifestInput;
  readonly gate: PublicationGateBinding;
  readonly observations: PublicationObservations;
  readonly finalReceipt: unknown;
  readonly ledger: unknown;
  readonly runId: string;
  readonly asOf: string;
}
export interface CorrectionProvenance {
  readonly version: 1;
  readonly runId: string;
  readonly asOf: string;
  readonly baseRunId: string;
  readonly baseCutoff: string;
  readonly baseManifestHash: string;
  readonly baseReadbackHash: string;
  readonly baseLedgerHash: string;
  readonly ledgerHash: string;
  readonly sourceReuse: false;
  readonly interpretationReuse: 'exact-api-binding-only';
  readonly firefliesMode: 'bounded-fresh';
  readonly cacheReuse: false;
  readonly salesforceReadOnly: true;
  readonly status: 'Initialized';
}
const receiptSchema = z.object({
  complete: z.literal(true),
  publicationStatus: z.literal('Published'),
  runId: z.string(),
  planHash: z.string(),
  spreadsheetId: z.string(),
  finalReadback: z.unknown().optional(),
});
const finalSchema = z.object({
  captureVersion: z.literal(1),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
  assertions: z.array(z.object({ id: z.string(), actualHash: z.unknown() })),
});
const ledgerSchema = z.array(
  z.object({ runId: z.string().min(1), opportunityId: z.string().min(1), slaId: z.string().min(1) })
);
interface CorrectionLedgerRow extends StoredGenerationLedgerRow {
  readonly operationalSummary?: unknown;
  readonly operationalSummaryHash?: unknown;
}
export type PublishedCorrectionLedgerRow = CorrectionLedgerRow & {
  readonly publicationStatus: 'Published';
};
function isLedger(value: unknown): value is CorrectionLedgerRow[] {
  return ledgerSchema.safeParse(value).success;
}
function verifyFinalReceipt(input: CorrectionRunInput): void {
  const receipt = receiptSchema.safeParse(input.finalReceipt);
  const { stageManifest, baseManifest } = input;
  check(
    evaluatePublicationReadback(stageManifest, input.observations).complete &&
      receipt.success &&
      receipt.data.runId === baseManifest.runId &&
      receipt.data.planHash === stageManifest.planHash &&
      receipt.data.spreadsheetId === stageManifest.spreadsheetId,
    'Base publication did not finish'
  );
  const final = finalSchema.safeParse(receipt.data.finalReadback);
  const assertions = stageManifest.finalAssertions;
  check(
    assertions !== undefined,
    'Base final readback does not match its exact assertion contract'
  );
  check(
    final.success &&
      final.data.assertions.length === assertions.length &&
      new Set(final.data.assertions.map((item) => item.id)).size === final.data.assertions.length &&
      assertions.every((item) =>
        final.data.assertions.some(
          (row) => row.id === item.id && row.actualHash === item.expectedHash
        )
      ),
    'Base final readback does not match its exact assertion contract'
  );
}
function publishedLedger(input: CorrectionRunInput): PublishedCorrectionLedgerRow[] {
  const { ledger, baseManifest, stageManifest } = input;
  check(
    isLedger(ledger) &&
      ledger.every(
        (row) =>
          row.summaryHash === generationHash(row.generatedSummary) &&
          row.operationalSummaryHash === generationHash(row.operationalSummary ?? '')
      ),
    'Unsupported or corrupt object-form generation ledger'
  );
  check(
    new Set(ledger.map((row) => `${row.runId}\0${row.opportunityId}\0${row.slaId}`)).size ===
      ledger.length &&
      ledger.filter((row) => row.runId === baseManifest.runId).length === baseManifest.expectedRows,
    'Base ledger count or identity mismatch'
  );
  const ledgerState = ledger.map((row): PublishedCorrectionLedgerRow => {
    check(
      row.runId === baseManifest.runId || row.publicationStatus === 'Published',
      'Unpublished historical ledger row'
    );
    return { ...row, publicationStatus: 'Published' };
  });
  for (const row of ledgerState.filter((item) => item.runId === baseManifest.runId)) {
    const cells = generationLedgerRows([row]).at(1);
    check(cells !== undefined, 'Base generation ledger projection is missing');
    const values = cells.map(
      (value, index) =>
        googleCellValue(value, GENERATION_LEDGER_HEADERS.at(index)).userEnteredValue ?? null
    );
    check(
      stageManifest.finalAssertions?.some(
        (assertion) =>
          assertion.title === 'Generation Ledger' &&
          assertion.kind === 'values' &&
          assertion.rowCount === 1 &&
          assertion.columnCount === GENERATION_LEDGER_HEADERS.length &&
          assertion.expectedHash === sha256Json([values])
      ) === true,
      'Base ledger row is not covered by its exact Published final assertion'
    );
  }
  return ledgerState;
}
export function prepareCorrection(
  input: CorrectionRunInput,
  now: () => number = Date.now
): {
  readonly provenance: CorrectionProvenance;
  readonly ledgerState: PublishedCorrectionLedgerRow[];
} {
  const { runId, asOf, baseManifest, stageManifest, gate } = input;
  check(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]+$/.test(runId) &&
      runId !== baseManifest.runId &&
      Date.parse(asOf) > Date.parse(baseManifest.startedAt) &&
      Date.parse(asOf) <= now(),
    'Correction needs a new run and later fixed cutoff'
  );
  check(
    baseManifest.expectedRows === baseManifest.processedRows &&
      baseManifest.runId === stageManifest.runId,
    'Base cohort is incomplete or mismatched'
  );
  assertPublicationGateBinding(stageManifest, gate);
  verifyFinalReceipt(input);
  const ledgerState = publishedLedger(input);
  return {
    provenance: {
      version: 1,
      runId,
      asOf,
      baseRunId: baseManifest.runId,
      baseCutoff: baseManifest.startedAt,
      baseManifestHash: sha256Json(baseManifest),
      baseReadbackHash: sha256Json(input.finalReceipt),
      baseLedgerHash: sha256Json(input.ledger),
      ledgerHash: sha256Json(ledgerState),
      sourceReuse: false,
      interpretationReuse: 'exact-api-binding-only',
      firefliesMode: 'bounded-fresh',
      cacheReuse: false,
      salesforceReadOnly: true,
      status: 'Initialized',
    },
    ledgerState,
  };
}
