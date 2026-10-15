import {
  connectSalesforceCli,
  type SalesforceQueryReader,
  type SalesforceReadCommand,
} from '@headstart-health/salesforce-read';

export interface IntakeSalesforceTarget {
  readonly targetOrg: string;
  readonly expectedOrgId: string;
}
/** The provider is environment-neutral; this workflow retains its approved Production-only target. */
export function intakeSalesforceTargetFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): IntakeSalesforceTarget {
  const targetOrg = (env['SF_TARGET_ORG'] ?? '').trim();
  const expectedOrgId = (env['SF_EXPECTED_ORG_ID'] ?? '').trim();
  if (!targetOrg) throw new Error('SF_TARGET_ORG is required for live Salesforce access');
  if (!expectedOrgId) throw new Error('SF_EXPECTED_ORG_ID is required for live Salesforce access');
  if (!/^00D[A-Za-z0-9]+$/.test(expectedOrgId) || ![15, 18].includes(expectedOrgId.length))
    throw new Error('SF_EXPECTED_ORG_ID must be a 15- or 18-character Salesforce org ID');
  return { targetOrg, expectedOrgId };
}
export async function connectIntakeSalesforce(
  target: IntakeSalesforceTarget,
  command?: SalesforceReadCommand
): Promise<SalesforceQueryReader> {
  return connectSalesforceCli({ ...target, expectedSandbox: false }, command);
}
