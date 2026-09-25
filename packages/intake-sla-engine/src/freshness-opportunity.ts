import { addFreshnessCandidate, type FreshnessContext } from './freshness-candidates.js';
import { extractLatestSubstantiveNote } from './freshness-notes.js';
import { firstEvidenceText } from './source-evidence-context.js';

const OPERATIONAL_NOTE = 'operational-note';
const OPPORTUNITY_SOURCE = 'Salesforce Opportunity / SLA';

function approvedAuthorization(context: FreshnessContext): void {
  const gate = context.input.authorizationGate;
  if (context.family === 'insurance' || !gate?.required || !gate.satisfied || !gate.approvalDate)
    return;
  const phase = gate.phase === 'treatment' ? 'Treatment' : 'Initial';
  addFreshnessCandidate(context.candidates, {
    at: gate.approvalDate,
    source: 'Authorization',
    sourceRecordId: firstEvidenceText(gate.recordId) ?? '',
    summary: [
      `${phase} authorization approved on ${gate.approvalDate}`,
      gate.payer,
      gate.authorizationNumber,
    ]
      .filter(Boolean)
      .join('; '),
    kind: 'record',
  });
}
function opportunityNotes(context: FreshnessContext): void {
  const opp = context.input.opp;
  const sla = opp.Current_SLA__r;
  const slaNote = extractLatestSubstantiveNote(
    sla?.Reason_for_Delay_Notes__c,
    firstEvidenceText(sla?.Reason_for_Delay_Notes_Last_Updated__c, sla?.LastModifiedDate),
    context.asOf
  );
  if (slaNote)
    addFreshnessCandidate(context.candidates, {
      at: slaNote.at,
      source: 'SLA update',
      sourceRecordId: firstEvidenceText(opp.Current_SLA__c) ?? '',
      summary: [sla?.Reason_for_Delay__c, slaNote.summary].filter(Boolean).join('; '),
      kind: OPERATIONAL_NOTE,
    });
  const intake = extractLatestSubstantiveNote(
    opp.Intake_Notes__c,
    opp.LastModifiedDate,
    context.asOf
  );
  if (intake)
    addFreshnessCandidate(context.candidates, {
      at: intake.at,
      source: 'Intake notes',
      sourceRecordId: opp.Id,
      summary: intake.summary,
      kind: OPERATIONAL_NOTE,
    });
  const hold = extractLatestSubstantiveNote(
    opp.On_Hold_Notes__c,
    firstEvidenceText(opp.On_Hold_Notes_Last_Updated__c, opp.LastModifiedDate),
    context.asOf
  );
  if (hold)
    addFreshnessCandidate(context.candidates, {
      at: hold.at,
      source: 'On-hold notes',
      sourceRecordId: opp.Id,
      summary: hold.summary,
      kind: OPERATIONAL_NOTE,
    });
}
function assessmentMilestone(context: FreshnessContext): void {
  const opp = context.input.opp;
  if (opp.IA_Completed_Date__c) {
    addFreshnessCandidate(context.candidates, {
      at: opp.IA_Completed_Date__c,
      source: OPPORTUNITY_SOURCE,
      sourceRecordId: opp.Id,
      summary: `Salesforce records 97151 Started Date ${opp.IA_Completed_Date__c}; whole-assessment completion is not established by that date alone`,
      kind: 'record',
    });
  } else if (opp.IA_Scheduled_For__c) {
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceText(
        opp.IA_Scheduled_Timestamp__c,
        opp.IA_Scheduled_On__c,
        opp.SLA_Entry_Date__c,
        opp.LastStageChangeDate
      ),
      source: OPPORTUNITY_SOURCE,
      sourceRecordId: opp.Id,
      summary: `97151 initial assessment scheduled for ${opp.IA_Scheduled_For__c}`,
      kind: 'record',
    });
  }
}
function treatmentMilestone(context: FreshnessContext): void {
  const opp = context.input.opp;
  if (opp.First_day_of_Treatment__c) {
    addFreshnessCandidate(context.candidates, {
      at: opp.First_day_of_Treatment__c,
      source: OPPORTUNITY_SOURCE,
      sourceRecordId: opp.Id,
      summary: `First 97153 service completed on ${opp.First_day_of_Treatment__c}`,
      kind: 'record',
    });
  } else if (opp.X97153_Scheduled_For__c) {
    addFreshnessCandidate(context.candidates, {
      at: firstEvidenceText(
        opp.X53_Provider_Confirmed_First_Day_TS__c,
        opp.SLA_Entry_Date__c,
        opp.LastStageChangeDate
      ),
      source: OPPORTUNITY_SOURCE,
      sourceRecordId: opp.Id,
      summary: `First 97153 service scheduled for ${opp.X97153_Scheduled_For__c}`,
      kind: 'record',
    });
  }
}
export function collectOpportunityFreshness(context: FreshnessContext): void {
  approvedAuthorization(context);
  opportunityNotes(context);
  if (context.family === 'intakeScheduling') assessmentMilestone(context);
  if (context.family === 'rbt') treatmentMilestone(context);
}
