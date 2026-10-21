import path from 'node:path';

import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { optionalPrivateJson, readPrivateJson } from './private-run-storage.js';
import { verifyDenialContext } from './slack-denial-context.js';
import type { DenialContextCoverage } from './slack-denial-context.js';
import { denialContextRequirements } from './slack-denial-requirements.js';
import type { DenialRequirementInputs } from './slack-denial-requirements.js';

const string = z.string().nullish();
const values = z.array(z.unknown()).nullish();
const authSchema = z.looseObject({
  Id: z.string().optional(),
  Name: string,
  Authorization__c: string,
  Client_Opportunity_Record__c: string,
  Authorization_Type__c: string,
  Insurance_Determination__c: string,
  Auth_Status__c: string,
  Authorization_Number__c: string,
  Notes__c: string,
  Client_Insurance__c: string,
  Payor_Name__c: string,
  Denial_Reason__c: string,
  Denial_Reason_Explanation__c: string,
  CreatedDate: string,
  LastModifiedDate: string,
  Master_Submission_Date__c: string,
  Initial_Auth_Submission_Date__c: string,
  Treatment_Auth_Submission_Date__c: string,
  Master_Approval_Date__c: string,
  Initial_Auth_Approval_Date__c: string,
  Treatment_Auth_Approval_Date__c: string,
  Auth_start_date__c: string,
  Auth_expiration_date__c: string,
  No_Auth_Needed__c: z.boolean().nullish(),
  Payor_Name__r: z.looseObject({ Name: string }).nullish(),
});
const opportunitySchema = z.looseObject({
  Id: z.string().optional(),
  StageName: string,
  Current_SLA__r: z.looseObject({ Stage__c: string, CreatedDate: string }).nullish(),
  Has_IA_Approved__c: z.boolean().nullish(),
  Initial_Auth_Approval_Date__c: string,
  Treatment_Auth_Approval_Date__c: string,
  IA_Approval_Checked_Timestamp__c: string,
  TA_Approval_Checked_Timestamp__c: string,
  LastStageChangeDate: string,
  SLA_Entry_Date__c: string,
});
const profileSchema = z.looseObject({
  opportunityId: z.string(),
  opportunityName: z.unknown().optional(),
  searchWindow: z.looseObject({ fromDate: string, toDate: string }).nullish(),
  knownNameVariants: values,
  clientAliases: values,
  authorizationNumbers: values,
  searchPathways: z
    .looseObject({ directIdentifiers: z.looseObject({ authorizationNumbers: values }).nullish() })
    .nullish(),
  providerNames: values,
  providerIdentity: z.looseObject({ names: values, practiceAliases: values }).nullish(),
  providers: z.array(z.looseObject({ name: z.unknown().optional(), names: values })).nullish(),
  practiceAliases: values,
  practice: z.union([z.string(), z.looseObject({ name: z.unknown().optional() })]).nullish(),
  payer: z.unknown().optional(),
  payers: values,
});
const planningSchema = z.object({
  opportunities: z.array(opportunitySchema),
  profiles: z.array(profileSchema),
  auths: z.array(authSchema),
  authReviews: z.array(authSchema),
  asOf: z.string(),
});
function assertPlanning(value: unknown): asserts value is DenialRequirementInputs {
  check(
    planningSchema.safeParse(value).success,
    'Denial-context planning requires current-run structured inputs and cutoff'
  );
}
/** Recompute from original private source artifacts; never trust a saved success receipt or write. */
export async function readDenialContextCoverage(
  runDirectory: string
): Promise<DenialContextCoverage> {
  const read = (name: string): Promise<unknown> => readPrivateJson(path.join(runDirectory, name));
  const optional = (name: string): Promise<unknown> =>
    optionalPrivateJson(path.join(runDirectory, name));
  const [rawManifest, opportunities, profiles, auths, authReviews] = await Promise.all([
    read('run_manifest.json'),
    read('opportunity_rows.json'),
    read('identity_profile_rows.json'),
    read('auth_rows.json'),
    read('authorization_review_rows.json'),
  ]);
  const manifest = z.object({ runId: z.string(), startedAt: z.string() }).safeParse(rawManifest);
  check(manifest.success, 'Invalid denial-context run manifest');
  const planning = { opportunities, profiles, auths, authReviews, asOf: manifest.data.startedAt };
  assertPlanning(planning);
  const requirements = denialContextRequirements(planning);
  const [plan, capture, searchRows, threadRows, mergedRows] = await Promise.all([
    optional('slack_full_sweep_plan.json'),
    optional('slack_search_capture.json'),
    optional('slack_full_sweep_exact_name.json'),
    optional('slack_full_sweep_threads.json'),
    optional('slack_rows.json'),
  ]);
  const saved = {
    requirements,
    runId: manifest.data.runId,
    asOf: manifest.data.startedAt,
    plan,
    capture,
    searchRows,
    threadRows,
    mergedRows,
  };
  return verifyDenialContext(saved);
}
