import type { SalesforceQueryReader } from '@headstart-health/salesforce-read';
import { z } from 'zod';

import {
  compareProductionFingerprint,
  sha256,
  type FingerprintComparison,
  type FlowFingerprint,
  type ProductionFingerprint,
} from './drift.js';

export type IntakeSlaMetadata = readonly [stage: string, days: number | null, duration: string];
export interface IntakeProductionBaseline extends ProductionFingerprint {
  readonly capturedAt?: string | undefined;
  readonly slaMetadata: readonly IntakeSlaMetadata[];
}
export interface IntakeProductionObservation extends ProductionFingerprint {
  readonly checkedAt: string;
  readonly flows: Readonly<
    Record<string, FlowFingerprint & { readonly lastModifiedDate: string | null }>
  >;
  readonly slaMetadata: readonly IntakeSlaMetadata[];
}
export interface IntakeProductionCheck {
  readonly expectedCapturedAt: string | undefined;
  readonly actual: IntakeProductionObservation;
  readonly result: FingerprintComparison;
}

const apexSchema = z.object({ Name: z.string(), Body: z.string() });
const definitionSchema = z.object({
  DeveloperName: z.string(),
  ActiveVersionId: z.string().nullable(),
});
const flowSchema = z.object({
  Id: z.string(),
  Definition: z.object({ DeveloperName: z.string() }),
  VersionNumber: z.number(),
  LastModifiedDate: z.string().nullable(),
});
const metadataSchema = z.object({
  Stage__c: z.string().nullable(),
  Days__c: z.number().nullable(),
  Duration_Unit__c: z.string().nullish(),
});
function soqlList(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',');
}

/** Workflow-selected metadata and comparison, composed with the reusable read-only provider. */
export async function checkIntakeProductionFingerprint(
  reader: SalesforceQueryReader,
  expected: IntakeProductionBaseline,
  now: () => Date = () => new Date()
): Promise<IntakeProductionCheck> {
  if (reader.organization.isSandbox)
    throw new Error('The selected Salesforce target is a sandbox, not Production');
  const apexRecords = await reader.query(
    `SELECT Name, Body FROM ApexClass WHERE Name IN (${soqlList(Object.keys(expected.apex))})`,
    apexSchema,
    { api: 'tooling' }
  );
  const apex = Object.fromEntries(apexRecords.map((record) => [record.Name, sha256(record.Body)]));
  const definitions = await reader.query(
    `SELECT DeveloperName, ActiveVersionId FROM FlowDefinition WHERE DeveloperName IN (${soqlList(Object.keys(expected.flows))})`,
    definitionSchema,
    { api: 'tooling' }
  );
  const activeIds = definitions.map((record) => record.ActiveVersionId ?? 'null');
  const versions = await reader.query(
    `SELECT Id, Definition.DeveloperName, VersionNumber, LastModifiedDate FROM Flow WHERE Id IN (${soqlList(activeIds)})`,
    flowSchema,
    { api: 'tooling' }
  );
  const flows = Object.fromEntries(
    versions.map((record) => [
      record.Definition.DeveloperName,
      {
        activeVersionId: record.Id,
        versionNumber: record.VersionNumber,
        lastModifiedDate: record.LastModifiedDate,
      },
    ])
  );
  const contractStages = new Set(expected.slaMetadata.map(([stage]) => stage));
  const metadata = await reader.query(
    'SELECT Stage__c, Days__c, Duration_Unit__c, Object__c FROM Intake_SLA__mdt WHERE Stage__c != null',
    metadataSchema
  );
  const slaMetadata: IntakeSlaMetadata[] = metadata
    .filter(
      (record): record is typeof record & { Stage__c: string } =>
        record.Stage__c !== null && contractStages.has(record.Stage__c)
    )
    .map((record): IntakeSlaMetadata => [
      record.Stage__c,
      record.Days__c,
      record.Duration_Unit__c ?? 'Days',
    ])
    .sort(
      (a, b) =>
        expected.slaMetadata.findIndex(([stage]) => stage === a[0]) -
        expected.slaMetadata.findIndex(([stage]) => stage === b[0])
    );
  const actual = { checkedAt: now().toISOString(), apex, flows, slaMetadata };
  return {
    expectedCapturedAt: expected.capturedAt,
    actual,
    result: compareProductionFingerprint(expected, actual),
  };
}
