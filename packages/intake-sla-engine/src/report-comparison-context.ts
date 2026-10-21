import type { IntakeActionModel } from './action-model-types.js';
import { deriveActionModel } from './action-model.js';
import { dateAnchoredSummary } from './freshness-values.js';
import {
  classifyReportComparison,
  comparisonFamilyDeclined,
} from './report-comparison-classification.js';
import { comparisonNarrative } from './report-comparison-narrative.js';
import { comparisonGateSummary, comparisonProcessPosition } from './report-comparison-position.js';
import type {
  ReportComparisonFreshness,
  ReportComparisonInput,
  ReportComparisonResult,
} from './report-comparison-types.js';
import type { ReportCommunication } from './report-display-types.js';
import {
  reportClean,
  reportFitCompleteThought,
  reportPlainText,
  reportPreferred,
  reportText,
  reportTimestamp,
} from './report-display-values.js';
import { reportRelevantProvider } from './report-row-labels.js';

export function comparisonCommunicationText(record: ReportCommunication): string {
  const sms = Boolean(record.aircall__Message_Content__c);
  const transcript = reportClean(record.Headstart_Full_Transcript__c);
  const call = sms
    ? record.aircall__Message_Content__c
    : reportText(transcript, record.aircall__Call_summary__c);
  return reportPlainText([record.Subject, record.Description, call].filter(Boolean).join('; '));
}
export function comparisonLatestFamilyDecision(
  tasks: readonly ReportCommunication[],
  calls: readonly ReportCommunication[]
): ReportCommunication | undefined {
  return [...tasks, ...calls]
    .filter((record) => comparisonFamilyDeclined(comparisonCommunicationText(record)))
    .sort(
      (a, b) =>
        reportTimestamp(
          reportPreferred(b.aircall__Call_Start_Date_Time__c, b.LastModifiedDate, b.CreatedDate, 0)
        ) -
        reportTimestamp(
          reportPreferred(a.aircall__Call_Start_Date_Time__c, a.LastModifiedDate, a.CreatedDate, 0)
        )
    )[0];
}
export interface PreparedReportComparison {
  readonly expanded: ReportComparisonResult;
  readonly effectiveFreshness: ReportComparisonFreshness;
  readonly actionModel: IntakeActionModel;
  readonly hasValidMilestone: boolean | '';
  readonly provider: string;
  readonly processPosition: string;
}
export function prepareReportComparison(
  input: ReportComparisonInput,
  tasks: readonly ReportCommunication[],
  calls: readonly ReportCommunication[]
): PreparedReportComparison {
  const expanded = classifyReportComparison(input);
  const family = /family declined services/i.test(expanded.blocker)
    ? comparisonLatestFamilyDecision(tasks, calls)
    : null;
  const effectiveFreshness: ReportComparisonFreshness = family
    ? {
        ...input.freshness,
        latestUpdateAt: reportPreferred(
          family.aircall__Call_Start_Date_Time__c,
          family.LastModifiedDate,
          family.CreatedDate
        ),
        latestUpdateSource: family.aircall__Message_Content__c
          ? 'Salesforce SMS'
          : 'Salesforce task',
        latestUpdateSummary: comparisonCommunicationText(family),
        latestUpdateFact:
          'The family declined to continue services; closure or discharge remains to be completed.',
        updateFreshness: 'Current',
      }
    : input.freshness;
  const actionModel = deriveActionModel({
    opp: input.opp,
    blocker: expanded.blocker,
    action: expanded.action,
    evidenceText: effectiveFreshness.latestUpdateSummary,
    asOf: input.runAt,
  });
  const hasValidMilestone =
    actionModel.actionType === 'Monitor' &&
    actionModel.followUpDate &&
    actionModel.followUpDate >= input.runAt.toISOString().slice(0, 10);
  const provider = reportRelevantProvider(input.opp);
  const processPosition = comparisonProcessPosition(input, expanded.blocker);
  expanded.summary = comparisonNarrative({
    ...input,
    position: processPosition,
    detail: expanded.summary,
    blocker: expanded.blocker,
    provider,
    freshness: effectiveFreshness,
  });
  if (input.authorizationGate.required && !input.authorizationGate.satisfied)
    expanded.summary = comparisonGateSummary({ ...input, freshness: effectiveFreshness });
  expanded.summary = reportFitCompleteThought(
    dateAnchoredSummary(expanded.summary, effectiveFreshness.latestUpdateAt),
    245
  );
  return {
    expanded,
    effectiveFreshness,
    actionModel,
    hasValidMilestone,
    provider,
    processPosition,
  };
}
