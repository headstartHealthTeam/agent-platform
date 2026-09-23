import { sha256Json } from './json-fingerprint.js';
import { evaluatePublicationCohort } from './publication-cohort.js';
import {
  assertPublicationInputFreshness,
  DEFAULT_PUBLICATION_MAX_AGE_MS,
} from './publication-freshness.js';
import type {
  PublicationGateCheck,
  PublicationGateInputs,
  PublicationGatePlan,
  PublicationGateResult,
} from './publication-gate-types.js';
import { publicationPlanHash } from './publication-plan.js';
import { publicationMarker, reviewerSnapshotHash } from './publication-state.js';

export const PUBLICATION_GATE_VERSION = 1;

function checkGoogleRevalidation(input: PublicationGateInputs, check: PublicationGateCheck): void {
  const { metadata, publicationState, currentMarker, currentReviewerState } = input;
  const states = [metadata, publicationState, currentMarker, currentReviewerState];
  if (states.some((state) => state.revalidatedAt !== undefined))
    check(
      'google-revalidation-binding',
      /^[a-f0-9]{64}$/.test(metadata.captureHash ?? '') &&
        /^[a-f0-9]{64}$/.test(metadata.revalidationHash ?? '') &&
        states.every(
          (state) =>
            state.revalidatedAt === metadata.revalidatedAt &&
            state.revalidationHash === metadata.revalidationHash
        ),
      'Google revalidation is not bound to one verified capture'
    );
}
function checkFreshness(input: PublicationGateInputs, checks: string[], now: string): void {
  const { maxAgeMs = DEFAULT_PUBLICATION_MAX_AGE_MS } = input;
  const {
    qualityAudit,
    workbookVerification,
    productionDrift,
    metadata,
    publicationState,
    currentMarker,
    currentReviewerState,
    cohortRefresh,
    competingRunState,
  } = input;
  const dates: [string, string | null | undefined][] = [
    ['Quality audit', qualityAudit.auditedAt],
    ['Workbook verification', workbookVerification.verifiedAt],
    ['Production fingerprint', productionDrift.result?.checkedAt],
    ['Google metadata', metadata.revalidatedAt ?? metadata.capturedAt],
    ['Google publication state', publicationState.revalidatedAt ?? publicationState.capturedAt],
    ['Current Sheet marker', currentMarker.revalidatedAt ?? currentMarker.capturedAt],
    [
      'Current reviewer state',
      currentReviewerState.revalidatedAt ?? currentReviewerState.capturedAt,
    ],
    ['Salesforce cohort refresh', cohortRefresh.queriedAt],
    ['Competing-run check', competingRunState.checkedAt],
  ];
  for (const [label, value] of dates) {
    assertPublicationInputFreshness(value, label, now, maxAgeMs);
    checks.push(`${label.toLowerCase()}-fresh`);
  }
}
function checkSheetIdentity(input: PublicationGateInputs, check: PublicationGateCheck): void {
  const identities = [
    ['configured spreadsheet', input.expectedSpreadsheetId],
    ['metadata spreadsheet', input.metadata.spreadsheetId],
    ['publication-state spreadsheet', input.publicationState.spreadsheetId],
    ['baseline reviewer spreadsheet', input.baselineReviewerState.spreadsheetId],
    ['current reviewer spreadsheet', input.currentReviewerState.spreadsheetId],
    ['publication plan spreadsheet', input.publicationPlan.spreadsheetId],
  ];
  for (const [label, value] of identities)
    check(
      `spreadsheet:${String(label)}`,
      value === input.expectedSpreadsheetId,
      `${String(label)} identity does not match the approved Sheet`
    );
}
function checkPreservedState(input: PublicationGateInputs, check: PublicationGateCheck): void {
  const initial = publicationMarker(input.baselineMarker);
  const current = publicationMarker(input.currentMarker);
  check(
    'live-marker-present',
    [initial.runId, initial.lastRefresh, current.runId, current.lastRefresh].every(Boolean),
    'Live Sheet marker is incomplete'
  );
  check(
    'live-marker-unchanged',
    sha256Json(initial) === sha256Json(current),
    'The live Sheet marker changed after collection began'
  );
  check(
    'reviewer-state-unchanged',
    reviewerSnapshotHash(input.baselineReviewerState) ===
      reviewerSnapshotHash(input.currentReviewerState),
    'Reviewer-owned state changed after collection began'
  );
}
function checkPlan(plan: PublicationGatePlan, runId: string, check: PublicationGateCheck): void {
  const assertions = plan.finalAssertions ?? [];
  check('plan-run', plan.runId === runId, 'Publication plan targets a different run');
  check(
    'final-state-contract',
    Array.isArray(plan.finalAssertions) && plan.finalAssertions.length > 0,
    'Publication plan has no final-state assertion contract'
  );
  check(
    'final-state-identities',
    new Set(assertions.map((assertion) => assertion.id)).size === assertions.length,
    'Publication plan contains duplicate final-state assertions'
  );
  const computed = publicationPlanHash(plan.stages, assertions);
  check(
    'plan-hash',
    /^[a-f0-9]{64}$/.test(plan.planHash) && plan.planHash === computed,
    'Publication plan hash is missing or invalid'
  );
  check(
    'run-history-last',
    plan.runHistoryLast === true && plan.stages.at(-1)?.id === '09-run-history',
    'Run History must be the final publication stage'
  );
  check(
    'terminal-marker-order',
    plan.stages.findIndex((stage) => stage.id === '08-terminal-marker') === plan.stages.length - 2,
    'Terminal marker must immediately precede Run History'
  );
}
export function evaluatePublicationGate(input: PublicationGateInputs): PublicationGateResult {
  const { now = new Date().toISOString() } = input;
  const checks: string[] = [];
  const check: PublicationGateCheck = (name, condition, failure) => {
    if (!condition) throw new Error(failure);
    checks.push(name);
  };
  const {
    runManifest,
    qualityAudit,
    workbookVerification,
    productionDrift,
    cohortRefresh,
    competingRunState,
    publicationPlan,
  } = input;
  check(
    'row-parity',
    runManifest.expectedRows === runManifest.processedRows,
    'Expected and processed row counts differ'
  );
  check('quality-audit', qualityAudit.passed === true, 'Quality audit blocks publication');
  check(
    'workbook-verification',
    workbookVerification.passed === true,
    'Workbook verification blocks publication'
  );
  check(
    'production-fingerprint',
    productionDrift.result?.publishable === true,
    'Production automation drift blocks publication'
  );
  checkGoogleRevalidation(input, check);
  checkFreshness(input, checks, now);
  checkSheetIdentity(input, check);
  checkPreservedState(input, check);
  check(
    'cohort-production',
    cohortRefresh.isSandbox === false && Boolean(cohortRefresh.organizationId),
    'Salesforce cohort refresh did not verify Production'
  );
  const cohortDisposition = evaluatePublicationCohort(check, runManifest, cohortRefresh);
  check(
    'no-competing-run',
    competingRunState.conflict === false,
    'A competing Intake SLA publication is active or newer'
  );
  check(
    'competing-run-target',
    !competingRunState.currentRunId || competingRunState.currentRunId === runManifest.runId,
    'Competing-run check targets a different run'
  );
  checkPlan(publicationPlan, runManifest.runId, check);
  return {
    schemaVersion: PUBLICATION_GATE_VERSION,
    evaluatedAt: now,
    runId: runManifest.runId,
    spreadsheetId: input.expectedSpreadsheetId,
    passed: true,
    planHash: publicationPlan.planHash,
    cohortDisposition,
    checks,
  };
}
