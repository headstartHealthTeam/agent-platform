import { normalizeCollectedOpportunities } from './collection-normalization.js';
import type { CollectedOpportunity } from './collection-opportunity-schema.js';
import { analyzeOpportunityFreshness } from './freshness-analysis.js';
import type { ReportComparisonInput } from './report-comparison-types.js';

const sourceDate = '2026-09-20';
const stages = [
  'Insurance Verification',
  'IA Requested',
  'IA Approved',
  'IC Completed',
  'IA Scheduled',
  '97151 Started',
  'Treatment Plan In-review',
  'TA Requested',
  'TA Approved',
  '97153 Scheduled',
  'First Day',
  'Unknown',
];
const notes = [
  '',
  'requested services of 30 hours per week; approved for 20 hours per week',
  'overlapping services with another provider',
  'continue with New Provider',
  'missing Behavioral Skills Assessment',
  'out of network',
  'scheduled for 9/30',
  'original Duke evaluation missing',
  'family custody and consistent care',
  'will not start one client and not the other',
  'assessment packet slow to respond',
  'COB not received',
  'school report',
  'family available starting 9/25',
  'Family decided not to pursue treatment',
  'still with insurance',
];
export function reportComparisonFixture(index: number): ReportComparisonInput {
  const runAt = new Date('2026-09-24T16:00:00Z');
  const note = notes[index % notes.length] ?? '';
  const opp = normalizeCollectedOpportunities<CollectedOpportunity>([
    {
      Id: 'synthetic-opportunity',
      Name: 'Synthetic Client',
      StageName: stages[index % stages.length],
      CSM__c: index % 2 ? 'Synthetic Staff' : '',
      Rendering_Provider__r: { Name: 'Provider' },
      Current_SLA__r: {},
    },
  ])[0];
  if (!opp) throw new Error('Synthetic comparison fixture missing');
  const auth = {
    Id: 'authorization',
    Authorization_Type__c: index % 2 ? 'Treatment Auth Request' : 'Initial Auth Request',
    LastModifiedDate: '2026-09-22',
    Notes__c: note,
    Auth_Status__c: ['Approved', 'Denied', 'Withdrawn', 'Partially Approved', 'Pending'][index % 5],
    Client_Insurance__c: index % 3 ? 'Primary' : 'Synthetic Payer',
  };
  const freshness = analyzeOpportunityFreshness({ opp, asOf: runAt });
  return {
    opp,
    sla: {},
    auths: index % 7 ? [auth] : [],
    authReviews: [],
    vobs: [
      {
        Verification_Date__c: sourceDate,
        CreatedDate: '2026-09-01',
        Verification_Status__c: index % 2 ? 'Completed' : 'Pending',
        Eligibility_Status__c: 'Active',
        Payor__r: { Name: 'Payer' },
      },
    ],
    clinicalQuality:
      index % 3
        ? []
        : [
            {
              CreatedDate: sourceDate,
              Treatment_Plan_Status__c: ['In Review', 'Ready to Submit', 'Approved'][index % 3],
            },
          ],
    rbts: index % 3 ? [] : [{ Name: 'Request' }],
    staffing: [],
    ticketMatches:
      index % 4
        ? [
            {
              Ticket_Match_Status__c: ['Hired', 'Proposed', 'Interview', 'Rejected'][index % 4],
              Candidate__r: {
                Name: index % 5 ? 'Synthetic Candidate' : '',
                Applicant_Status__c: 'Applicant',
                Earliest_Start_Date__c: '2026-09-30',
              },
            },
          ]
        : [],
    interviews: [],
    commsText: note,
    freshness: {
      ...freshness,
      latestUpdateAt: index % 13 ? '2026-09-23' : '',
      latestUpdateSource:
        ['Fireflies', 'Portal chat', 'Salesforce task', 'Authorization', 'Salesforce SMS'][
          index % 5
        ] ?? '',
      latestUpdateSummary: note,
      latestUpdateFact: note,
      updateFreshness: index % 3 ? 'Current' : 'Stale',
    },
    authorizationGate: {
      required: index % 5 === 0,
      satisfied: false,
      phase: index % 2 ? 'treatment' : 'initial',
      payer: 'Payer',
      determination:
        [
          'Additional Details Required',
          'Denied',
          'Pending Appeal',
          'Peer Review',
          'Partially Approved',
          'Withdrawn',
          'Pending',
        ][index % 7] ?? '',
      authStatus: 'Pending',
      eventDate: sourceDate,
      blocker: 'Insurance authorization pending',
      conflict: index % 10 === 0,
    },
    runAt,
  };
}
