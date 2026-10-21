import { selectCurrentCandidateMatch } from './candidate-match.js';
import {
  comparisonAuthorization,
  comparisonFutureDate,
  comparisonPartialHours,
  comparisonPayerLabel,
  comparisonVob,
} from './report-comparison-authorization.js';
import type { ReportComparisonInput } from './report-comparison-types.js';
import { reportClean, reportShortDate, reportText } from './report-display-values.js';
import { reportRelevantProvider } from './report-row-labels.js';

interface ActionContext {
  readonly input: ReportComparisonInput;
  readonly blocker: string;
  readonly stage: string;
  readonly evidence: string;
  readonly csm: string;
  readonly provider: string;
  readonly futureDate: string;
}
function insuranceAction({ input, blocker, stage, provider }: ActionContext): string {
  const latest = comparisonAuthorization(input.auths, stage);
  const vob = comparisonVob(input.vobs);
  const payer = reportText(vob.Payor__r?.Name, comparisonPayerLabel(latest.Client_Insurance__c));
  const text = `${latest.Auth_Status__c ?? ''} ${latest.Insurance_Determination__c ?? ''} ${latest.Denial_Reason__c ?? ''} ${latest.Denial_Reason_Explanation__c ?? ''} ${latest.Notes__c ?? ''}`;
  if (/withdrawn/i.test(blocker)) {
    return /other agenc|another agenc|another provider|continue with/i.test(text)
      ? "Intake to confirm the family's provider choice and close or discharge the Opportunity if they are not moving forward."
      : 'Insurance Ops to determine why the authorization was withdrawn and whether a corrected request should be submitted.';
  }
  if (/partially approved/i.test(blocker)) {
    const { requested, approved } = comparisonPartialHours(latest);
    const hours =
      approved && requested
        ? `the reduced ${approved}-hour approval versus ${requested} requested hours`
        : 'the reduced authorization';
    return `Insurance Ops to confirm with ${provider} whether ${hours} will be accepted or appealed, then record the decision and next payer action.`;
  }
  if (/denial/i.test(blocker) && /overlap|same service|another provider/i.test(text))
    return 'Insurance Ops to resolve the overlapping authorization or submit corrected dates, then record the appeal or resubmission plan.';
  if (/denial/i.test(blocker))
    return 'Insurance Ops to review the denial reason, assign the correction or appeal owner, and record the resubmission date.';
  if (/verification complete/i.test(blocker))
    return 'Intake to verify IA prerequisites are complete, advance the Opportunity to IA Requested, and record any remaining prerequisite if it cannot advance.';
  if (stage === 'Insurance Verification')
    return `Insurance Ops to complete verification with ${payer} and record the next expected milestone date.`;
  return `Insurance Ops to check ${payer} for the ${stage.startsWith('TA') ? 'TA' : 'IA'} determination and record the next follow-up date.`;
}
function planAction({ blocker, csm, provider, stage, evidence }: ActionContext): string {
  if (/approved.*stage not advanced/i.test(blocker))
    return `${csm} to confirm the approved treatment plan can move to TA submission and document any remaining blocker.`;
  if (/ready for submission/i.test(blocker))
    return `${csm} to confirm ${provider} submits the treatment plan and record the submission date.`;
  if (/IA Scheduled/i.test(evidence) && /97151|Treatment Plan/i.test(stage))
    return `${csm} to verify IA completion and correct the stage; if 97151 occurred, confirm the TP due date with ${provider}.`;
  if (/clinical review/i.test(blocker))
    return 'Clinical Quality to complete review or return specific edits and record the review disposition and date.';
  if (/parent signature/i.test(blocker))
    return `${csm} to obtain the parent signature and record the signed date.`;
  if (/provider signature/i.test(blocker))
    return `${csm} to obtain ${provider}'s signature and record the signed date.`;
  if (/signature/i.test(blocker))
    return `${csm} to identify the missing signer, obtain the signature, and record the signed date.`;
  return `${csm} to follow up with ${provider} for the treatment plan status and committed submission date.`;
}
function staffingAction({ input, csm, provider, futureDate }: ActionContext): string {
  const match = selectCurrentCandidateMatch(input.ticketMatches);
  const candidate = match?.Candidate__r;
  if (
    candidate?.Name &&
    /hired/i.test(`${match?.Ticket_Match_Status__c ?? ''} ${candidate.Applicant_Status__c ?? ''}`)
  ) {
    const candidateDate =
      candidate.Earliest_Start_Date__c &&
      candidate.Earliest_Start_Date__c.slice(0, 10) >= input.runAt.toISOString().slice(0, 10)
        ? reportShortDate(candidate.Earliest_Start_Date__c)
        : '';
    const expected = reportText(futureDate, candidateDate);
    return `${csm} to confirm with ${provider} whether ${candidate.Name}'s first 97153 appointment${expected ? ` is scheduled for ${expected}` : ' is scheduled'} and record the appointment date or blocker; verify the linked Salesforce date after scheduling.`;
  }
  if (futureDate)
    return `${csm} to confirm with ${provider} whether the first 97153 appointment is scheduled for ${futureDate} and record the appointment date or staffing blocker.`;
  if (candidate?.Name)
    return `RBT team to advance ${candidate.Name} from ${reportText(match?.Ticket_Match_Status__c, 'candidate review')} and record the next interview or match decision.`;
  const request = input.rbts.find((row) => !row.Date_Closed__c);
  if (request)
    return `RBT team to advance request ${String(request.Name)} and record the candidate and expected start date.`;
  return `${csm} to confirm the RBT and start date with ${provider}; reopen the staffing path if coverage is not secured.`;
}
function schedulingAction({ evidence, csm, provider, futureDate }: ActionContext): string {
  if (/provider assignment change|reassign/i.test(evidence))
    return 'Intake to confirm the provider assignment and launch date before scheduling the IA.';
  if (
    /ables|assessment packet/i.test(evidence) &&
    /slow|not responding|without responding|haven['’]?t heard back/i.test(evidence)
  )
    return `${csm} to contact the family, obtain the completed ABLES assessment packet, and confirm readiness so ${provider} can schedule the IA.`;
  if (futureDate)
    return `${csm} to confirm on ${futureDate} that the IA occurred and record the completion date; if it did not occur, document the new blocker and date.`;
  return `${csm} to obtain a confirmed IA date from ${provider} and record the date or the specific scheduling blocker.`;
}
function documentAction({ evidence, csm, provider }: ActionContext): string {
  if (/cob|coordination of benefits/i.test(evidence))
    return 'Intake to follow up with the family on COB completion and record when insurance can proceed.';
  if (/duke|original .*evaluation|other evaluation|testing tools/i.test(evidence))
    return 'Intake to obtain the original Duke diagnostic evaluation from the family, send it to Insurance Ops, and confirm payer acceptance.';
  if (/lmn|referral|diagnostic|\bde\b/i.test(evidence))
    return 'Intake to obtain the required clinical document and record the next outreach date and owner.';
  if (/discharge report/i.test(evidence))
    return "Intake to obtain the prior provider's discharge report and record when the client can proceed.";
  if (/school/i.test(evidence))
    return `${csm} to confirm with ${provider} what school information remains and the expected completion date.`;
  if (/onboarding packet|parent assessments?|vineland|basc/i.test(evidence))
    return 'Intake to contact the family, complete the onboarding packet and parent assessments, and record the remaining document or signed date.';
  return 'Intake to identify the missing requirement, assign the owner, and record the expected completion date.';
}
function familyAction(context: ActionContext): string {
  const { evidence, csm, provider, blocker, futureDate, stage } = context;
  if (/care-plan feasibility/i.test(blocker)) {
    return /custody|divorced parents|consistent care/i.test(evidence)
      ? `${csm} to confirm with ${provider} whether both guardians can support a consistent care schedule and record whether services can proceed.`
      : `${csm} to confirm the family's availability and care conditions with ${provider} and record the agreed next milestone.`;
  }
  if (/family availability|responsiveness/i.test(blocker)) {
    if (futureDate)
      return `No action needed before ${futureDate}; ${csm} to confirm the start remains on track and record the first treatment date.`;
    if (/Pending Scheduling|Pending Start/i.test(stage))
      return `${csm} to confirm with ${provider} whether the family is ready and record the agreed assessment or treatment start date.`;
    return 'Intake to contact the family, confirm whether they are moving forward, and record the next decision date.';
  }
  if (/re-engagement/i.test(blocker))
    return `${csm} to obtain the next scheduled service date from ${provider} and correct the stage if the current process position is inaccurate.`;
  return 'Intake to identify the next owner, required follow-up, and expected milestone date.';
}
function secondaryAction(context: ActionContext): string {
  const { blocker, evidence, csm, provider } = context;
  if (/interpreter|translation support/i.test(blocker))
    return `${csm} to confirm the required interpreter or translation service with ${provider}, secure the support, and record the IA date.`;
  const paired =
    /will not start one client and not the other|won't start one client and not the other|provider wants?.*client.*(?:on )?hold/i.test(
      evidence
    );
  if (/paired-client dependency|hold request/i.test(blocker) || paired)
    return `${csm} to confirm the paired client, why the starts are linked, and the expected start date with ${provider}; then record the hold reason and follow-up date or schedule the IA.`;
  if (/document|coverage correction/i.test(blocker)) return documentAction(context);
  return familyAction(context);
}
export function comparisonAction(input: ReportComparisonInput, blocker: string): string {
  const evidence = reportClean(input.freshness.latestUpdateSummary);
  const context: ActionContext = {
    input,
    blocker,
    evidence,
    stage: reportText(input.opp.StageName, input.sla.Stage__c),
    csm: reportText(input.opp.CSM__c, 'CSM'),
    provider: reportText(reportRelevantProvider(input.opp), 'the provider'),
    futureDate: comparisonFutureDate(evidence, input.runAt),
  };
  if (/family declined services/i.test(blocker))
    return 'Intake to confirm the family decision and close or discharge the Opportunity, recording the effective date and reason.';
  if (/auth|insurance|payer/i.test(blocker)) return insuranceAction(context);
  if (/treatment plan|signatures/i.test(blocker)) return planAction(context);
  if (/RBT|treatment start/i.test(blocker)) return staffingAction(context);
  if (/provider scheduling|initial assessment/i.test(blocker)) return schedulingAction(context);
  return secondaryAction(context);
}
