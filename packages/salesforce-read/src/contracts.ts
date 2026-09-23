import {
  capabilityRequirementSchema,
  type CapabilityRequirement,
} from '@headstart-health/capability-contracts';
import { z } from 'zod';

export const SALESFORCE_ORGANIZATION_READ = 'salesforce.organization.read' as const;
const orgIdSchema = z
  .string()
  .trim()
  .regex(/^00D[A-Za-z0-9]+$/)
  .refine((value) => value.length === 15 || value.length === 18);
export const salesforceTargetSchema = z
  .object({
    targetOrg: z.string().trim().min(1),
    expectedOrgId: orgIdSchema,
    expectedSandbox: z.boolean(),
  })
  .strict();
export type SalesforceTarget = z.infer<typeof salesforceTargetSchema>;
export interface SalesforceOrganization {
  readonly orgId: string;
  readonly isSandbox: boolean;
}
export class SalesforceReadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SalesforceReadError';
  }
}

export function parseSalesforceTarget(input: unknown): SalesforceTarget {
  const result = salesforceTargetSchema.safeParse(input);
  if (!result.success)
    throw new SalesforceReadError(
      'Salesforce requires an explicit target, valid org ID and environment'
    );
  return result.data;
}

export function assertSalesforceOrganization(
  input: unknown,
  targetInput: SalesforceTarget
): SalesforceOrganization {
  const target = parseSalesforceTarget(targetInput);
  const record = z.object({ Id: orgIdSchema, IsSandbox: z.boolean() }).safeParse(input);
  if (!record.success)
    throw new SalesforceReadError('Salesforce returned an incomplete Organization identity');
  if (
    record.data.Id.slice(0, 15) !== target.expectedOrgId.slice(0, 15) ||
    record.data.IsSandbox !== target.expectedSandbox
  ) {
    throw new SalesforceReadError(
      'Salesforce returned a different org or environment than configured'
    );
  }
  return { orgId: record.data.Id, isSandbox: record.data.IsSandbox };
}

export function salesforceOrganizationRequirement(
  targetInput: SalesforceTarget
): CapabilityRequirement {
  const target = parseSalesforceTarget(targetInput);
  return capabilityRequirementSchema.parse({
    id: SALESFORCE_ORGANIZATION_READ,
    sideEffect: 'read',
    requiredPermissions: ['Organization:read'],
    targetAssertions: [
      { key: 'orgId', expected: target.expectedOrgId.slice(0, 15) },
      { key: 'isSandbox', expected: target.expectedSandbox },
    ],
  });
}

export function completeQueryRecords<T>(input: unknown, recordSchema: z.ZodType<T>): readonly T[] {
  const result = z
    .object({
      status: z.literal(0),
      result: z.object({
        done: z.literal(true),
        totalSize: z.number().int().nonnegative(),
        records: z.array(recordSchema),
      }),
    })
    .safeParse(input);
  if (!result.success || result.data.result.totalSize !== result.data.result.records.length) {
    throw new SalesforceReadError(
      'Salesforce query failed or did not return an explicit complete valid result set'
    );
  }
  return result.data.result.records;
}
