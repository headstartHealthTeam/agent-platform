import { z } from 'zod';

import { preserveCollectionRecord } from './collection-decoding.js';
import { reportPreferred } from './report-display-values.js';
import { savedOptionalText as text, savedSourceCheckSchema } from './saved-report-fields.js';
import type { SavedSourceRow } from './saved-source-rows.js';

const eventSchema = z.looseObject({
  text,
  summary: text,
  name: text,
  title: text,
  category: text,
  opportunityId: text,
  sourceId: text,
  id: text,
  fileId: text,
  quality: text,
  date: text,
  eventDate: text,
  createdAt: text,
  modifiedTime: text,
  substantive: z.boolean().nullish(),
  matchedEntities: z.array(z.unknown()).nullish(),
});
/** Only the selected event list is consumed; a truthy empty list still wins. */
export interface SavedSupplementalEvidence {
  readonly row: z.infer<typeof savedSourceCheckSchema> | undefined;
  readonly events: readonly z.infer<typeof eventSchema>[];
}
export function decodeSavedSupplementalEvidence(
  row: SavedSourceRow | undefined,
  fallback: 'messages' | 'files'
): SavedSupplementalEvidence {
  return {
    row:
      row === undefined ? undefined : preserveCollectionRecord(savedSourceCheckSchema).parse(row),
    events: z
      .array(preserveCollectionRecord(eventSchema))
      .parse(
        reportPreferred(
          row?.['events'],
          fallback === 'messages' ? row?.['messages'] : row?.['files'],
          []
        )
      ),
  };
}
