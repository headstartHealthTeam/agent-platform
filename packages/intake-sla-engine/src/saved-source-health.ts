import { z } from 'zod';

import {
  preserveCollectionRecord,
  type StructuredCollectionArtifacts,
} from './collection-decoding.js';
import { evaluateConversationSourceHealth } from './conversation-search-result.js';
import type { ConversationSourceHealth } from './conversation-search-result.js';
import type { BoundedRunProof } from './fireflies-bounded-proof.js';
import type {
  CacheReplayVerification,
  FirefliesCacheRunProof,
} from './fireflies-cache-replay-proof.js';
import { reportPreferred } from './report-display-values.js';
import { assessTranscriptInventoryArtifact } from './run-artifact-health.js';
import type { TranscriptInventoryHealth } from './run-artifact-health.js';
import type { SavedSourceIdentity, SavedSourceRow } from './saved-source-rows.js';

export interface SavedSourceArtifacts extends StructuredCollectionArtifacts {
  readText(name: string): Promise<string | undefined>;
  boundedProof(
    records: readonly unknown[],
    runAt: Date,
    options: CacheReplayVerification
  ): Promise<BoundedRunProof | null>;
  cacheProof(
    records: readonly unknown[],
    runAt: Date,
    options: CacheReplayVerification
  ): Promise<FirefliesCacheRunProof | null>;
}
const executionSchema = z.looseObject({
  completed: z.unknown().optional(),
  requests: z.unknown().optional(),
  blocked: z.unknown().optional(),
  sentinelFound: z.unknown().optional(),
  searchBlocked: z.unknown().optional(),
  transcripts: z
    .looseObject({
      requested: z.unknown().optional(),
      complete: z.unknown().optional(),
      blocked: z.unknown().optional(),
    })
    .nullish(),
});
export type SavedSourceExecution = z.infer<typeof executionSchema>;
export function decodeSourceExecution(raw: unknown): SavedSourceExecution | null {
  return raw === undefined || raw === null
    ? null
    : preserveCollectionRecord(executionSchema).parse(raw);
}
export type SavedTranscriptHealth = TranscriptInventoryHealth & {
  readonly boundedCoverage: BoundedRunProof['coverage'] | undefined;
};
export async function loadSavedTranscriptHealth(
  artifacts: SavedSourceArtifacts,
  rows: readonly SavedSourceRow[],
  profiles: readonly SavedSourceIdentity[],
  runAt: Date
): Promise<SavedTranscriptHealth> {
  const execution = decodeSourceExecution(
    await artifacts.read('fireflies_inventory_execution.json')
  );
  const expectedCount = Number(execution?.transcripts?.requested ?? 0);
  const contents = await artifacts.readText('fireflies_transcript_inventory.jsonl');
  const records: unknown[] = (contents ?? '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line): unknown => JSON.parse(line));
  const options = { requireReplay: true, rows, profiles };
  const bounded = await artifacts.boundedProof(records, runAt, options);
  const cacheProof = await artifacts.cacheProof(records, runAt, options);
  return {
    ...assessTranscriptInventoryArtifact({ expectedCount, records, runAt, cacheProof }),
    boundedCoverage: bounded?.coverage,
  };
}
function portalRecordCount(row: SavedSourceRow | undefined): number {
  const response = z.object({ chats: z.unknown().optional() }).safeParse(row?.['responses']).data;
  const selected = reportPreferred(response?.chats, row?.['chats'], []);
  return z.array(z.unknown()).parse(selected).length;
}
const firefliesCountSchema = z.object({ meetings: z.array(z.unknown()).nullish() });
export function savedConversationSourceHealth(input: {
  readonly opportunities: readonly { readonly Id: string; readonly Name: string }[];
  readonly portalRows: ReadonlyMap<string, SavedSourceRow>;
  readonly firefliesRows: ReadonlyMap<string, SavedSourceRow>;
  readonly portalExecution: SavedSourceExecution | null;
  readonly firefliesExecution: SavedSourceExecution | null;
  readonly transcriptHealth: SavedTranscriptHealth;
}): { readonly portal: ConversationSourceHealth; readonly fireflies: ConversationSourceHealth } {
  const { opportunities, portalExecution, firefliesExecution, transcriptHealth } = input;
  const portal = evaluateConversationSourceHealth({
    source: 'Portal',
    inventoryComplete:
      Boolean(portalExecution) &&
      Number(portalExecution?.completed ?? -1) === Number(portalExecution?.requests ?? -2) &&
      Number(portalExecution?.blocked ?? 0) === 0,
    sentinelExpected: true,
    sentinelFound: portalExecution?.sentinelFound === true,
    results: opportunities.map((opp) => {
      return {
        recordsScanned: portalRecordCount(
          input.portalRows.get(opp.Id) ?? input.portalRows.get(opp.Name)
        ),
        matchCounts: { Direct: 0, Likely: 0 },
      };
    }),
  });
  const fireflies = evaluateConversationSourceHealth({
    source: 'Fireflies',
    inventoryComplete:
      transcriptHealth.complete &&
      Boolean(firefliesExecution) &&
      Number(firefliesExecution?.searchBlocked ?? 0) === 0 &&
      Number(firefliesExecution?.transcripts?.blocked ?? 0) === 0 &&
      Number(firefliesExecution?.transcripts?.complete ?? -1) ===
        Number(firefliesExecution?.transcripts?.requested ?? -2),
    results: opportunities.map((opp) => ({
      recordsScanned: (
        firefliesCountSchema.parse(
          input.firefliesRows.get(opp.Id) ?? input.firefliesRows.get(opp.Name) ?? {}
        ).meetings ?? []
      ).length,
      matchCounts: { Direct: 0, Likely: 0 },
    })),
  });
  if (fireflies.status === 'Blocked' && transcriptHealth.reason)
    fireflies.reason = `Fireflies transcript inventory is incomplete. ${transcriptHealth.reason}`;
  return { portal, fireflies };
}
