import type { StructuredResponsesClient } from '@headstart-health/openai-platform/responses';

import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import type { EvidenceEvent } from './evidence.js';
import { adaptFirefliesWithAI } from './fireflies-evidence-api.js';
import {
  adaptFirefliesWithPrecomputedAI,
  type AcceptedFirefliesInterpretation,
} from './fireflies-evidence-precomputed.js';
import type {
  FirefliesApiInterpretation,
  FirefliesEvidenceResult,
  FirefliesEvidenceRow,
  FirefliesPrecomputed,
  FirefliesSuppliedInterpretation,
} from './fireflies-evidence-types.js';
import { analyzeOpportunityFreshness, type FreshnessAnalysis } from './freshness-analysis.js';
import type { FreshnessSupplemental } from './freshness-source-types.js';
import type { InterpreterConfig } from './interpretation-binding.js';
import { interpretationGateContext } from './interpretation-packet.js';
import type { NoteAdjudicator } from './note-adjudication-types.js';
import { adjudicatedNoteFreshnessInput } from './note-freshness.js';
import { adaptOpportunityNotes } from './opportunity-note-evidence.js';
import type { PortalReportResponses } from './portal-report-types.js';
import type { ReportBillingRow } from './report-billing.js';
import { reportPreferred, reportText } from './report-display-values.js';
import type { ReportInterpretationRecord } from './report-finalization.js';
import type { ReportIdentityProfile } from './report-identity-types.js';
import type { ReportOpportunityContext } from './report-opportunity-context.js';
import type { SlackEvidenceRow, SlackEvidenceEvent } from './slack-evidence-types.js';
import { adaptSlack } from './slack-evidence.js';

export type ReportInterpreterExecution =
  | {
      readonly apiEnabled: true;
      readonly client: StructuredResponsesClient | null;
      readonly config: Pick<InterpreterConfig, 'provider' | 'model'>;
    }
  | { readonly apiEnabled: false };
export type ReportInterpretation<T extends FirefliesSuppliedInterpretation> =
  FirefliesApiInterpretation | AcceptedFirefliesInterpretation<T>;
export interface ReportInterpretationInput<T extends FirefliesSuppliedInterpretation> {
  readonly context: ReportOpportunityContext;
  readonly runAt: Date;
  readonly identities: ReadonlyMap<string, ReportIdentityProfile>;
  readonly cohortNames: readonly string[];
  readonly noteAdjudicator: NoteAdjudicator;
  readonly requested: boolean;
  readonly execution: ReportInterpreterExecution;
  readonly precomputed: FirefliesPrecomputed<T> | undefined;
  readonly firefliesRow: FirefliesEvidenceRow | undefined;
  readonly slackRow: SlackEvidenceRow | undefined;
  readonly portalInput: PortalReportResponses;
  readonly billingEvents: ReportBillingRow['events'];
  readonly gmailEvents: readonly FreshnessSupplemental[];
  readonly fileEvents: readonly FreshnessSupplemental[];
}
export interface EvaluatedReportInterpretation<T extends FirefliesSuppliedInterpretation> {
  readonly mode: 'disabled' | 'api' | 'precomputed' | 'unavailable';
  readonly ai: FirefliesEvidenceResult<ReportInterpretation<T>>;
  readonly unrecoveredFailures: readonly string[];
  readonly interpretedNoteEvents: readonly EvidenceEvent[];
  readonly reviewedNoteIds: ReadonlySet<string>;
  readonly reviewedSlaId: string;
  readonly interpretedSlackEvents: readonly SlackEvidenceEvent[];
  readonly freshness: FreshnessAnalysis;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly record: ReportInterpretationRecord<ReportInterpretation<T>>;
}
function modeFor<T extends FirefliesSuppliedInterpretation>(
  input: ReportInterpretationInput<T>
): EvaluatedReportInterpretation<T>['mode'] {
  if (!input.requested) return 'disabled';
  if (input.execution.apiEnabled) return 'api';
  return input.precomputed ? 'precomputed' : 'unavailable';
}
async function interpretFireflies<T extends FirefliesSuppliedInterpretation>(
  input: ReportInterpretationInput<T>,
  gate: ReturnType<typeof interpretationGateContext>
): Promise<FirefliesEvidenceResult<ReportInterpretation<T>>> {
  if (!input.requested || !input.firefliesRow?.meetings?.length)
    return {
      events: [],
      interpretations: [],
      failures: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  const profile = input.context.identity;
  const common = {
    row: input.firefliesRow,
    profile,
    competingProfiles: profile.providerRoster.flatMap((row) => {
      const peer = input.identities.get(row.opportunityId);
      return peer ? [peer] : [];
    }),
    gate,
    asOf: input.runAt,
    fallbackToDeterministic: false,
  };
  if (input.execution.apiEnabled)
    return adaptFirefliesWithAI({
      ...common,
      client: input.execution.client,
      model: input.execution.config.model,
      provider: input.execution.config.provider,
      engineVersion: EVIDENCE_ENGINE_VERSION,
    });
  return adaptFirefliesWithPrecomputedAI<T>({
    ...common,
    precomputed: input.precomputed ?? { interpretations: [] },
  });
}
/** Compose current-run interpretation without adding raw transcripts or Slack a second time. */
export async function evaluateReportInterpretation<T extends FirefliesSuppliedInterpretation>(
  input: ReportInterpretationInput<T>
): Promise<EvaluatedReportInterpretation<T>> {
  const { context, runAt, noteAdjudicator } = input;
  const { opp, evidenceOpp, identity, authorizationGate } = context;
  const gate = interpretationGateContext({ stage: opp.StageName, authorizationGate });
  const interpretedNoteEvents = adaptOpportunityNotes({
    opportunity: evidenceOpp,
    profile: identity,
    gate,
    asOf: runAt,
    adjudicateNote: noteAdjudicator.interpret,
  });
  const reviewedNoteIds = noteAdjudicator.reviewedNoteIds(opp.Id);
  const reviewedSlaId = reportText(opp.Current_SLA__c, `${opp.Id}:sla-note`);
  const reviewedNotes = adjudicatedNoteFreshnessInput(
    evidenceOpp,
    interpretedNoteEvents,
    reviewedNoteIds
  );
  const interpretedSlackEvents = input.slackRow
    ? adaptSlack({
        row: input.slackRow,
        profile: { ...identity, cohortClientNames: input.cohortNames },
        gate,
        asOf: runAt,
      })
    : [];
  const mode = modeFor(input);
  const ai = await interpretFireflies(input, gate);
  const freshness = analyzeOpportunityFreshness({
    opp: reviewedNotes.opportunity,
    identity,
    authorizationGate,
    auths: context.auths,
    authReviews: context.authReviews,
    vobs: context.vobs,
    clinicalQuality: context.clinicalQuality,
    rbts: context.rbts,
    staffing: context.staffing,
    ticketMatches: context.ticketMatches,
    firstInterviews: context.firstInterviews,
    tasks: context.tasks,
    taskUpdates: context.taskUpdates,
    aircalls: context.aircalls,
    portalResponses: input.portalInput ?? [],
    interpretedConversationEvents: [
      ...reviewedNotes.events,
      ...ai.events,
      ...interpretedSlackEvents,
    ],
    linkedBillingClaims: input.billingEvents,
    gmail: input.gmailEvents,
    linkedFiles: input.fileEvents,
    asOf: runAt,
  });
  return {
    mode,
    ai,
    unrecoveredFailures: ai.unrecoveredFailures ?? ai.failures,
    interpretedNoteEvents,
    reviewedNoteIds,
    reviewedSlaId,
    interpretedSlackEvents,
    freshness,
    usage: {
      inputTokens: Number(reportPreferred(ai.usage.inputTokens, 0)),
      outputTokens: Number(reportPreferred(ai.usage.outputTokens, 0)),
    },
    record: {
      opportunityId: opp.Id,
      opportunityName: opp.Name,
      mode,
      enabled: ['api', 'precomputed'].includes(mode),
      events: ai.events,
      interpretations: ai.interpretations,
      failures: ai.failures,
    },
  };
}
