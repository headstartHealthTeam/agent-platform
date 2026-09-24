import { createEvidenceEvent, type EvidenceEvent } from './evidence.js';
import { buildFactPacket } from './fact-packet.js';
import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import { renderRecommendation } from './recommendation.js';
import type { ReportRowInput } from './report-row-types.js';
import { reportOutstandingTaskFields } from './report-task-display.js';
import { resolveSourceAuthorizationGate } from './source-authorization-gate.js';

export function reportRowFixture(): ReportRowInput<EvidenceEvent> {
  const runAt = new Date('2026-09-24T16:00:00Z');
  const opp = {
    Id: 'synthetic-opp',
    Name: 'Synthetic Avery',
    Current_SLA__c: 'synthetic-sla',
    StageName: 'IA Scheduled',
    CSM__c: 'Synthetic Owner',
  };
  const event = createEvidenceEvent({
    opportunityId: opp.Id,
    source: 'Portal',
    sourceRecordId: 'synthetic-message',
    eventDate: '2026-09-24',
    collectionDate: runAt.toISOString(),
    category: 'Initial Assessment',
    text: 'Provider confirmed the remaining assessment session is scheduled for September 28.',
    matchQuality: 'Direct',
    substantive: true,
    relationship: 'Supports',
    processRelevance: 11,
  });
  const packet = buildFactPacket({
    opportunity: { id: opp.Id, name: opp.Name, stage: opp.StageName, csm: opp.CSM__c },
    gate: {
      processPosition: 'Initial assessment',
      unresolvedGate: 'Initial assessment completion',
    },
    evidenceEvents: [event],
    sourceResults: [],
    asOf: runAt,
  });
  const recommendation = renderRecommendation(packet);
  const freshness = analyzeOpportunityFreshness({ opp, asOf: runAt });
  return {
    runAt,
    runId: 'synthetic-run',
    engineVersion: 'synthetic-version',
    sfBaseUrl: 'https://example.test',
    opp,
    sla: {
      Reason_for_Delay__c: 'Scheduling',
      Reason_for_Delay_Notes__c: 'Historical comparison.',
      Action_Item__c: 'Existing comparison only',
    },
    expanded: {
      blocker: packet.unresolvedGate,
      summary: recommendation.suggestedSlaSummary,
      action: recommendation.text,
      bestSource: 'Portal',
      confidence: packet.confidence,
      sourceQuality: 'Direct',
      evidenceConflict: '',
    },
    freshness,
    story: packet.story,
    actionModel: {
      actionType: recommendation.type,
      actionOwner: recommendation.owner,
      followUpDate: recommendation.date,
      followUpDateBasis: recommendation.basis,
    },
    inDepthSummary: recommendation.operationalSummary,
    outstandingTasks: reportOutstandingTaskFields([], opp.Id, runAt),
    provider: 'Synthetic Provider',
    milestone: 'Complete assessment',
    gap: '',
    identityMatchReview: '',
    aiInterpretationGap: '',
    aiInterpretationStatus: 'No candidate transcript',
    conversationMatchAudit: 'Synthetic audit',
    qualityReview: { valid: true, issues: [] },
    finalEvidenceStatus: 'Complete',
    finalReadyToCopy: 'Yes',
    reviewerState: {},
    slaNoteClassification: { provenance: 'Human', admittedText: 'Historical comparison.' },
    authorizationGate: resolveSourceAuthorizationGate({ opp, asOf: runAt }),
    firefliesCoverage: { identityComplete: true },
    blockingSources: [],
    unavailableEnrichmentSources: [],
    sourceOutcomes: [{ source: 'Portal', status: 'Found' }],
    summaries: {
      auth: 'Authorization',
      authReview: 'Review',
      vob: 'VOB',
      cq: 'Clinical',
      rbt: 'Staffing',
      candidates: 'Candidates',
      comms: 'Communications',
    },
    portal: { gap: '', result: 'Found' },
    firefliesWasSearched: true,
    firefliesResult: 'Searched - Not Found',
    alohaClaimsResult: 'Found',
    combinedEvidence: [event],
  };
}
