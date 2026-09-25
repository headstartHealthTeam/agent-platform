import { comparisonCommunicationText } from './report-comparison-context.js';
import type { ReportCommunication } from './report-display-types.js';
import { reportClean, reportPlainText, reportText } from './report-display-values.js';
import { evaluateConversationMatch } from './search-pathway-match.js';
import type { PathwayConversationMatch, SearchPathwayIdentity } from './search-pathway-types.js';
import { hasCompetingNamedClient } from './search-pathway-values.js';

interface MatchOpportunity {
  readonly Id: string;
  readonly Name: string;
  readonly StageName?: string | null | undefined;
}
type MatchRecord = ReportCommunication & {
  readonly Summary?: string | null | undefined;
  readonly aircall__Number_Name__c?: string | null | undefined;
};
export interface ReportCommunicationMatch {
  readonly _matchQuality: PathwayConversationMatch['quality'];
  readonly _matchScore: number;
  readonly _matchReasons: readonly string[];
}
function communicationMatch(
  opportunity: MatchOpportunity,
  record: MatchRecord,
  identity: SearchPathwayIdentity
): PathwayConversationMatch {
  const sms = Boolean(record.aircall__Message_Content__c);
  const transcript = reportClean(record.Headstart_Full_Transcript__c);
  const call = sms
    ? record.aircall__Message_Content__c
    : reportText(transcript, record.aircall__Call_summary__c);
  return evaluateConversationMatch({
    text: reportPlainText(
      [record.Subject, record.Description, call, record.Summary].filter(Boolean).join(' ')
    ),
    metadata: [
      record.Name,
      record.aircall__Number_name__c,
      record.aircall__Number_Name__c,
      record.Owner?.Name,
    ]
      .filter(Boolean)
      .join(' '),
    opportunityId: opportunity.Id,
    linkedOpportunityId: reportText(record.WhatId, record.aircall__Opportunity__c),
    identity: {
      ...identity,
      opportunityName: reportText(identity.opportunityName, opportunity.Name),
      stage: reportText(identity.stage, opportunity.StageName),
    },
  });
}
/** A direct lookup does not override an explicit competing-client mention. */
export function matchReportCommunication<T extends MatchRecord>(
  opportunity: MatchOpportunity,
  record: T,
  identity: SearchPathwayIdentity,
  cohortNames: readonly string[]
): (T & ReportCommunicationMatch) | null {
  if (
    hasCompetingNamedClient({
      text: comparisonCommunicationText(record),
      targetName: opportunity.Name,
      cohortNames,
    })
  )
    return null;
  const match = communicationMatch(opportunity, record, identity);
  return match.matched
    ? {
        ...record,
        _matchQuality: match.quality,
        _matchScore: match.score,
        _matchReasons: match.reasons,
      }
    : null;
}
