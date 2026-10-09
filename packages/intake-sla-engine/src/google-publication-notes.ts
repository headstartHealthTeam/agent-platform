import { googlePresentation } from './google-presentation.js';
import { clearTail, updateRequests } from './google-publication-cells.js';
import {
  contextMatrix,
  contextState,
  publicationHeaders,
  TERMINAL_MARKER_FIELDS,
} from './google-publication-context.js';
import type { GooglePublicationContext } from './google-publication-context.js';
import { publicationStage } from './google-publication-stages.js';
import type {
  GooglePreparedStage,
  GooglePublicationFragment,
  GooglePublicationLiveSheet,
  GooglePublicationRows,
} from './google-publication-types.js';
import {
  normalizePublicationRows,
  publicationRowsEqual,
  publicationText,
} from './google-publication-values.js';
import type { PublicationAssertion } from './publication-readback-types.js';

export const PUBLICATION_NOTES_TITLE = 'Source & Run Notes';
export interface GoogleNotesPlan {
  readonly stage: GooglePreparedStage;
  readonly finalAssertions: PublicationAssertion[];
  readonly desiredNotes: unknown[][];
  readonly state: GooglePublicationLiveSheet;
}
function retainedNotes(
  desired: GooglePublicationRows,
  state: GooglePublicationLiveSheet
): GooglePublicationRows {
  const first = desired[0],
    liveFirst = state.values[0];
  if (
    state.values.length === 0 ||
    first === undefined ||
    liveFirst === undefined ||
    !publicationRowsEqual(first, liveFirst)
  )
    throw new Error('Source & Run Notes header changed since workbook generation');
  const liveMarkers = new Map<unknown, readonly unknown[]>();
  for (const row of state.values.slice(1)) {
    if (!TERMINAL_MARKER_FIELDS.has(row[0])) continue;
    if (liveMarkers.has(row[0]))
      throw new Error(`Source & Run Notes contains duplicate ${publicationText(row[0])} markers`);
    liveMarkers.set(row[0], row);
  }
  return desired.map((row, index) => {
    if (index === 0 || !TERMINAL_MARKER_FIELDS.has(row[0])) return row;
    const marker = liveMarkers.get(row[0]);
    if (marker === undefined)
      throw new Error(`Source & Run Notes is missing the live ${publicationText(row[0])} marker`);
    return marker;
  });
}
export function notesPlan(
  context: GooglePublicationContext,
  prior: string,
  maxBytes: number
): GoogleNotesPlan {
  const title = PUBLICATION_NOTES_TITLE,
    state = contextState(context, title);
  const desiredNotes = normalizePublicationRows(contextMatrix(context, title));
  const nonterminal = retainedNotes(desiredNotes, state);
  const write = updateRequests({ title, sheetId: state.sheetId, rows: nonterminal, maxBytes });
  const headers = publicationHeaders(desiredNotes);
  const clear = clearTail({
    title,
    sheetId: state.sheetId,
    startRowIndex: desiredNotes.length,
    endRowIndex: state.usedRowCount,
    columnCount: headers.length,
  });
  const presentation = googlePresentation({
    title,
    sheetId: state.sheetId,
    headers,
    endRowIndex: desiredNotes.length,
  });
  const stage = publicationStage(
    '06-source-run-notes',
    [...write.requests, ...clear.requests, ...presentation.requests],
    [...write.assertions, ...clear.assertions, ...presentation.assertions],
    { dependsOn: prior }
  );
  const final = updateRequests({ title, sheetId: state.sheetId, rows: desiredNotes, maxBytes });
  return {
    stage,
    desiredNotes,
    state,
    finalAssertions: [...final.assertions, ...clear.assertions, ...presentation.assertions],
  };
}
export function terminalMarkers(
  notes: GoogleNotesPlan,
  maxBytes: number
): GooglePublicationFragment {
  const result: GooglePublicationFragment = { requests: [], assertions: [] };
  for (const [rowIndex, row] of notes.desiredNotes.entries()) {
    if (!TERMINAL_MARKER_FIELDS.has(row[0])) continue;
    const marker = updateRequests({
      title: PUBLICATION_NOTES_TITLE,
      sheetId: notes.state.sheetId,
      rows: [row],
      startRowIndex: rowIndex,
      maxBytes,
    });
    result.requests.push(...marker.requests);
    result.assertions.push(...marker.assertions);
  }
  return result;
}
