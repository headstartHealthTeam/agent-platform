import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { reportPreferred } from './report-display-values.js';
import {
  savedFields,
  savedOptionalText as text,
  savedSourceCheckSchema,
} from './saved-report-fields.js';
import type { SavedSourceRow } from './saved-source-rows.js';
import type { SlackEvidenceRow } from './slack-evidence-types.js';

const recordSchema = z.looseObject({
  text,
  time: text,
  threadText: text,
  messageTs: text,
  channelId: text,
  channel: z.union([z.string(), z.looseObject({ name: z.unknown().optional() })]).nullish(),
  bot_profile: z.looseObject({ name: z.unknown().optional() }).nullish(),
  user_profile: z
    .looseObject({ real_name: z.unknown().optional(), display_name: z.unknown().optional() })
    .nullish(),
});
function consumedRecord(value: unknown): z.infer<typeof recordSchema> | null {
  const fields = savedFields(value);
  // adaptSlack ignores these entries before opening channel/author metadata.
  const hasText = Boolean(fields['text']);
  const hasTime = Boolean(fields['time']);
  if (!hasText || !hasTime) return null;
  return preserveCollectionRecord(recordSchema).parse(value);
}
const rowSchema = savedSourceCheckSchema.extend({
  paginationComplete: z.boolean().nullish(),
  threadExpansionComplete: z.boolean().nullish(),
});
const count = z.union([z.number(), z.string(), z.null()]).optional();
const executionSchema = z.looseObject({
  cohortComplete: z.boolean().nullish(),
  expectedOpportunities: count,
  opportunities: count,
  blocked: count,
  unassignedExactRows: count,
  unassignedPageTwoRecords: count,
  threadExpansionComplete: z.boolean().nullish(),
});
export function decodeSavedSlackExecution(value: unknown): z.infer<typeof executionSchema> | null {
  return value === null || value === undefined
    ? null
    : preserveCollectionRecord(executionSchema).parse(value);
}
export interface SavedSlackEvidence {
  readonly row: z.infer<typeof rowSchema>;
  readonly evidence: SlackEvidenceRow;
  readonly records: readonly unknown[];
  readonly events: readonly unknown[];
}
export function decodeSavedSlackEvidence(
  row: SavedSourceRow | undefined
): SavedSlackEvidence | undefined {
  if (row === undefined) return undefined;
  const properties = preserveCollectionRecord(rowSchema).parse(row);
  const records = z.array(z.unknown()).parse(reportPreferred(row['records'], []));
  const messages = z.array(z.unknown()).parse(reportPreferred(row['messages'], []));
  const events = z.array(z.unknown()).parse(reportPreferred(row['events'], []));
  // A blocked capture still contributes its retrieved count, but is not opened by adaptSlack.
  const blocked = Boolean(row['blocked']);
  const evidence = blocked
    ? { blocked: true }
    : {
        records: records.map(consumedRecord),
        messages: z
          .array(preserveCollectionRecord(z.looseObject({ text: z.unknown().optional() })))
          .parse(messages),
        searches: z
          .array(
            z.looseObject({ pages: z.array(z.looseObject({ resultPreview: text })).nullish() })
          )
          .nullish()
          .parse(row['searches']),
      };
  return { row: properties, evidence, records, events: [...events, ...messages] };
}
