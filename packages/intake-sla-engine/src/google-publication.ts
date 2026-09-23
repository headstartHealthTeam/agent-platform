import { requiredGridExpansion } from './google-grid.js';
import { googlePresentation } from './google-presentation.js';
import { appendOnlyPlan, finalizeRequests } from './google-publication-append.js';
import type { GoogleAppendPlan } from './google-publication-append.js';
import {
  clearTail,
  gridAssertion,
  updateRequests,
  valuesAssertion,
} from './google-publication-cells.js';
import {
  contextRows,
  contextMatrix,
  contextState,
  publicationContext,
  publicationHeaders,
  REPLACEMENT_SHEETS,
} from './google-publication-context.js';
import type { GooglePublicationContext } from './google-publication-context.js';
import { notesPlan, terminalMarkers, PUBLICATION_NOTES_TITLE } from './google-publication-notes.js';
import {
  assertReviewSheetHeaders,
  reviewerPreservationProof,
  reviewerSafeReadbackRows,
} from './google-publication-reviewer.js';
import { publicationStage } from './google-publication-stages.js';
import { reviewStyle } from './google-publication-style.js';
import type {
  GooglePreparedStage,
  GooglePublicationPlan,
  GooglePublicationPlanInputs,
  GooglePublicationRequest,
} from './google-publication-types.js';
import { publicationPlanHash } from './publication-plan.js';
import type { PublicationAssertion } from './publication-readback-types.js';
import type { ReviewerSnapshot } from './publication-state.js';

export const PUBLICATION_PLAN_VERSION = 1;
const LEDGER = 'Generation Ledger',
  HISTORY = 'Run History';
interface Appends {
  readonly ledger: GoogleAppendPlan;
  readonly history: GoogleAppendPlan;
  readonly ledgerStatusIndex: number;
}
function appendPlans(context: GooglePublicationContext, runId: string): Appends {
  for (const title of [PUBLICATION_NOTES_TITLE, LEDGER, HISTORY]) {
    const state = contextState(context, title);
    if (state.values.length !== state.usedRowCount)
      throw new Error(`${title} current values do not cover its exact used extent`);
  }
  const ledgerRows = contextRows(context, LEDGER);
  const ledgerStatusIndex = publicationHeaders(ledgerRows).indexOf('Publication Status');
  const ledger = appendOnlyPlan({
    title: LEDGER,
    runId,
    desiredRows: ledgerRows,
    liveValues: contextState(context, LEDGER).values,
    statusIndex: ledgerStatusIndex,
    pendingStatus: 'Publishing - Awaiting Terminal Marker',
  });
  const historyRows = contextRows(context, HISTORY);
  const history = appendOnlyPlan({
    title: HISTORY,
    runId,
    desiredRows: historyRows,
    liveValues: contextState(context, HISTORY).values,
    statusIndex: publicationHeaders(historyRows).indexOf('Publish Status'),
    pendingStatus: 'Published',
  });
  return { ledger, history, ledgerStatusIndex };
}
function capacityStage(context: GooglePublicationContext, appends: Appends): GooglePreparedStage {
  const requiredRows = new Map(
    [...REPLACEMENT_SHEETS, PUBLICATION_NOTES_TITLE].map((title) => [
      title,
      contextRows(context, title).length,
    ])
  );
  requiredRows.set(LEDGER, appends.ledger.appendStart + appends.ledger.pendingRows.length);
  requiredRows.set(HISTORY, appends.history.appendStart + appends.history.pendingRows.length);
  const requests: GooglePublicationRequest[] = [],
    assertions: PublicationAssertion[] = [];
  for (const [title, state] of context.states) {
    const expansion = requiredGridExpansion({
      liveRowCount: state.rowCount,
      liveColumnCount: state.columnCount,
      requiredRowCount: requiredRows.get(title),
      requiredColumnCount: publicationHeaders(contextRows(context, title)).length,
    });
    if (!expansion.rowCount && !expansion.columnCount) continue;
    const gridProperties: { rowCount?: number; columnCount?: number } = {};
    const fields: string[] = [];
    if (expansion.rowCount) {
      gridProperties.rowCount = expansion.rowCount;
      fields.push('gridProperties.rowCount');
    }
    if (expansion.columnCount) {
      gridProperties.columnCount = expansion.columnCount;
      fields.push('gridProperties.columnCount');
    }
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: state.sheetId, gridProperties },
        fields: fields.join(','),
      },
    });
    assertions.push(
      gridAssertion({
        title,
        sheetId: state.sheetId,
        rowCount: expansion.rowCount ?? state.rowCount,
        columnCount: expansion.columnCount ?? state.columnCount,
      })
    );
  }
  return publicationStage('01-capacity', requests, assertions);
}
function replacementStage(
  context: GooglePublicationContext,
  title: string,
  position: number,
  prior: string,
  reviewer: ReviewerSnapshot,
  maxBytes: number
): GooglePreparedStage {
  const state = contextState(context, title),
    rows = contextMatrix(context, title),
    headers = publicationHeaders(rows);
  const review = title === 'Review Queue' || title === 'On-Hold Review';
  if (review) assertReviewSheetHeaders(title, headers);
  const assertionRows = review ? reviewerSafeReadbackRows(title, rows, reviewer) : rows;
  const write = updateRequests({ title, sheetId: state.sheetId, rows, assertionRows, maxBytes });
  const clear = clearTail({
    title,
    sheetId: state.sheetId,
    startRowIndex: rows.length,
    endRowIndex: state.usedRowCount,
    columnCount: headers.length,
  });
  const presentation = googlePresentation({
    title,
    sheetId: state.sheetId,
    headers,
    endRowIndex: rows.length,
  });
  const style = review
    ? reviewStyle(title, state.sheetId, rows, headers, state.usedRowCount)
    : { requests: [], assertions: [] };
  const requests = [
    ...write.requests,
    ...clear.requests,
    ...presentation.requests,
    ...style.requests,
  ];
  const assertions = [
    ...write.assertions,
    ...presentation.assertions,
    ...style.assertions,
    ...clear.assertions,
  ];
  const id = `0${String(position + 2)}-${title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`;
  return publicationStage(id, requests, assertions, { dependsOn: prior });
}
function appendStage(
  context: GooglePublicationContext,
  title: string,
  append: GoogleAppendPlan,
  maxBytes: number,
  id: string,
  prior: string
): GooglePreparedStage {
  const state = contextState(context, title);
  const write = updateRequests({
    title,
    sheetId: state.sheetId,
    rows: append.pendingRows,
    headers: append.headers,
    startRowIndex: append.appendStart,
    maxBytes,
  });
  const presentation =
    title === HISTORY
      ? googlePresentation({
          title,
          sheetId: state.sheetId,
          headers: append.headers,
          startRowIndex: append.appendStart,
          endRowIndex: append.appendStart + append.pendingRows.length,
        })
      : { requests: [], assertions: [] };
  const options = title === HISTORY ? { dependsOn: prior, terminal: true } : { dependsOn: prior };
  return publicationStage(
    id,
    [...write.requests, ...presentation.requests],
    [...write.assertions, ...presentation.assertions],
    options
  );
}
function finalAppendAssertions(
  context: GooglePublicationContext,
  title: string,
  append: GoogleAppendPlan
): PublicationAssertion[] {
  return append.rowsToFinalize.map((item) =>
    valuesAssertion({
      title,
      sheetId: contextState(context, title).sheetId,
      startRowIndex: item.rowIndex,
      values: [item.desired],
      headers: append.headers,
    })
  );
}
export function buildGooglePublicationPlan(
  input: GooglePublicationPlanInputs
): GooglePublicationPlan {
  const { manifest, metadata, currentReviewerState, maxRequestBytes = 100_000 } = input;
  const context = publicationContext(input),
    appends = appendPlans(context, manifest.runId);
  const capacity = capacityStage(context, appends);
  const stages = [capacity],
    finalAssertions = [...capacity.assertions];
  let prior = capacity.id;
  for (const [position, title] of REPLACEMENT_SHEETS.entries()) {
    const replacement = replacementStage(
      context,
      title,
      position,
      prior,
      currentReviewerState,
      maxRequestBytes
    );
    stages.push(replacement);
    finalAssertions.push(...replacement.assertions);
    prior = replacement.id;
  }
  const notes = notesPlan(context, prior, maxRequestBytes);
  stages.push(notes.stage);
  finalAssertions.push(...notes.finalAssertions);
  const ledgerStage = appendStage(
    context,
    LEDGER,
    appends.ledger,
    maxRequestBytes,
    '07-generation-ledger-append',
    notes.stage.id
  );
  stages.push(ledgerStage);
  const finalize = finalizeRequests({
    title: LEDGER,
    sheetId: contextState(context, LEDGER).sheetId,
    statusIndex: appends.ledgerStatusIndex,
    rowsToFinalize: appends.ledger.rowsToFinalize,
  });
  const markers = terminalMarkers(notes, maxRequestBytes);
  const terminal = publicationStage(
    '08-terminal-marker',
    [...finalize.requests, ...markers.requests],
    [...finalize.assertions, ...markers.assertions],
    { dependsOn: ledgerStage.id, terminal: true }
  );
  stages.push(terminal);
  finalAssertions.push(...finalAppendAssertions(context, LEDGER, appends.ledger));
  const historyStage = appendStage(
    context,
    HISTORY,
    appends.history,
    maxRequestBytes,
    '09-run-history',
    terminal.id
  );
  stages.push(historyStage);
  finalAssertions.push(
    ...historyStage.assertions.filter((assertion) => assertion.kind !== 'values')
  );
  finalAssertions.push(...finalAppendAssertions(context, HISTORY, appends.history));
  return {
    schemaVersion: PUBLICATION_PLAN_VERSION,
    spreadsheetId: metadata.spreadsheetId,
    runId: manifest.runId,
    maxRequestBytes,
    stages,
    finalAssertions,
    planHash: publicationPlanHash(stages, finalAssertions),
    reviewerPreservation: reviewerPreservationProof(context.sheets, stages, currentReviewerState),
  };
}
