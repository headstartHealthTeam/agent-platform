import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { reportPreferred } from './report-display-values.js';
import { savedOptionalText as text, savedSourceCheckSchema } from './saved-report-fields.js';
import type { SavedSourceRow } from './saved-source-rows.js';

const meetingSchema = z.looseObject({
  id: z.union([z.string(), z.number()]).nullish(),
  title: text,
  date: text,
  participants: z.array(text).nullish(),
  organizerEmail: text,
  fullTranscript: text,
  transcript: text,
  transcriptText: text,
  transcriptSnippet: text,
  meetingRelationship: text,
  quality: text,
  matchedSentences: z.union([z.string(), z.array(z.unknown())]).nullish(),
});
const rowSchema = savedSourceCheckSchema.extend({
  searched: z.boolean().nullish(),
  searchedAt: text,
  queriesUsed: z.array(z.unknown()).nullish(),
  searchCoverage: z
    .looseObject({
      status: text,
      queriesUsed: z.array(z.unknown()).nullish(),
      paginationComplete: z.boolean().nullish(),
      transcriptsComplete: z.boolean().nullish(),
    })
    .nullish(),
});
export type SavedFirefliesMeeting = z.infer<typeof meetingSchema>;
export type SavedFirefliesEvidence = z.infer<typeof rowSchema> & {
  readonly meetings: readonly SavedFirefliesMeeting[];
};
export function decodeSavedFirefliesEvidence(
  row: SavedSourceRow | undefined
): SavedFirefliesEvidence | undefined {
  if (row === undefined) return undefined;
  const properties = preserveCollectionRecord(rowSchema).parse(row);
  const meetings = z
    .array(preserveCollectionRecord(meetingSchema))
    .parse(reportPreferred(row['meetings'], []));
  return { ...properties, meetings };
}
