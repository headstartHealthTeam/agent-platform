import {
  createConversationSearchResult,
  type ConversationSearchResult,
} from './conversation-search-result.js';
import { reportText } from './report-display-values.js';
import type { ReportOpportunityContext } from './report-opportunity-context.js';

type Task = ReportOpportunityContext['tasks'][number];
type TaskUpdate = ReportOpportunityContext['taskUpdates'][number];
type Call = ReportOpportunityContext['aircalls'][number];
export interface ReportCommunicationMatch {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly quality: string;
  readonly score: number;
  readonly reason: string;
  readonly sourceRecordId: string;
}
export interface ReportCommunicationEvidence {
  readonly noteRecords: readonly { readonly source: string }[];
  readonly emails: readonly Task[];
  readonly sms: readonly Task[];
  readonly tasks: readonly (Task | TaskUpdate)[];
  readonly calls: readonly (Call | Task)[];
  readonly searchResult: ConversationSearchResult<ReportCommunicationMatch>;
}
function taskKind(task: Task): string {
  return [reportText(task.Type), reportText(task.TaskSubtype), reportText(task.Subject)].join(' ');
}
export function prepareReportCommunicationEvidence(
  context: ReportOpportunityContext,
  totalAircallRecords: number,
  totalTaskRecords: number,
  runAt: Date
): ReportCommunicationEvidence {
  const { opp, identity } = context;
  const emails = context.tasks.filter((task) => /email/i.test(taskKind(task)));
  const sms = context.tasks.filter((task) => /sms|text/i.test(taskKind(task)));
  const calls = [...context.aircalls, ...sms];
  const noteRecords = [
    ...(context.evidenceSla.Reason_for_Delay_Notes__c ? [{ source: 'SLA update' }] : []),
    ...(opp.Intake_Notes__c ? [{ source: 'Intake notes' }] : []),
    ...(opp.On_Hold_Notes__c ? [{ source: 'On-hold notes' }] : []),
  ];
  return {
    noteRecords,
    emails,
    sms,
    calls,
    tasks: [
      ...context.tasks.filter((task) => !emails.includes(task) && !sms.includes(task)),
      ...context.taskUpdates,
    ],
    searchResult: createConversationSearchResult({
      source: 'Calls / Texts',
      opportunityId: opp.Id,
      // The report identity producer has no providerNames/providerEmails/rbtNames/candidateNames.
      identitiesUsed: [
        opp.Name,
        identity.familyPhones,
        undefined,
        undefined,
        identity.authorizationNumbers,
        identity.payers,
        undefined,
        undefined,
      ],
      queriesUsed: identity.searchPathways.queryPlan.flatMap((path) => path.terms),
      recordsScanned: totalAircallRecords + totalTaskRecords,
      segmentsScanned: calls.length,
      matches: calls.map((record) => ({
        opportunityId: opp.Id,
        opportunityName: opp.Name,
        quality: reportText(record._matchQuality, 'Direct'),
        score: record._matchScore,
        reason: record._matchReasons.join('; '),
        sourceRecordId: record.Id,
      })),
      searchedAt: runAt.toISOString(),
    }),
  };
}
