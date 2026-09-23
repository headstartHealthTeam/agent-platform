import { StringDecoder } from 'node:string_decoder';

import {
  capabilityPreflightResultSchema,
  type CapabilityPreflightResult,
} from '@headstart-health/capability-contracts';
import spawn from 'cross-spawn';
import { z } from 'zod';

import {
  assertSalesforceOrganization,
  completeQueryRecords,
  parseSalesforceTarget,
  SALESFORCE_ORGANIZATION_READ,
  SalesforceReadError,
  type SalesforceOrganization,
  type SalesforceTarget,
} from './contracts.js';

export type SalesforceReadCommand = (argv: readonly string[]) => Promise<string>;
const MAX_OUTPUT_BYTES = 40 * 1024 * 1024;

const runSalesforceReadCommand: SalesforceReadCommand = (argv) =>
  new Promise((resolve, reject) => {
    const child = spawn('sf', [...argv], {
      env: { ...process.env, SF_DISABLE_LOG_FILE: 'true' },
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const decoder = new StringDecoder('utf8');
    let bytes = 0;
    const accept = (chunk: Buffer): boolean => {
      bytes += chunk.byteLength;
      if (bytes <= MAX_OUTPUT_BYTES) return true;
      child.kill();
      reject(new SalesforceReadError('Salesforce query exceeded its output limit'));
      return false;
    };
    child.stdout?.on('data', (chunk: Buffer) => {
      if (accept(chunk)) output += decoder.write(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      accept(chunk);
    });
    child.on('error', () => {
      reject(new SalesforceReadError('Salesforce CLI could not start'));
    });
    child.on('close', (code) => {
      if (code === 0) resolve(output + decoder.end());
      else reject(new SalesforceReadError('Salesforce query failed; verify configured access'));
    });
  });

export interface SalesforceQueryReader {
  readonly organization: SalesforceOrganization;
  query<T>(soql: string, recordSchema: z.ZodType<T>): Promise<readonly T[]>;
  organizationPreflight(providerId: string, adapterVersion: string): CapabilityPreflightResult;
}

async function readQuery<T>(
  target: SalesforceTarget,
  command: SalesforceReadCommand,
  soql: string,
  schema: z.ZodType<T>
): Promise<readonly T[]> {
  try {
    const output = await command([
      'data',
      'query',
      '--target-org',
      target.targetOrg,
      '--json',
      '-q',
      soql,
    ]);
    const parsed: unknown = JSON.parse(output);
    return completeQueryRecords(parsed, schema);
  } catch {
    // CLI, schema and injected-host errors may contain records or credentials. Never forward them.
    throw new SalesforceReadError(
      'Salesforce query failed or returned incomplete evidence; inspect the private provider diagnostics'
    );
  }
}

export async function connectSalesforceCli(
  targetInput: SalesforceTarget,
  command: SalesforceReadCommand = runSalesforceReadCommand
): Promise<SalesforceQueryReader> {
  const target = parseSalesforceTarget(targetInput);
  const records = await readQuery(
    target,
    command,
    'SELECT Id, IsSandbox FROM Organization LIMIT 1',
    z.unknown()
  );
  if (records.length !== 1)
    throw new SalesforceReadError('Salesforce must return exactly one Organization identity');
  const organization = assertSalesforceOrganization(records[0], target);
  return {
    organization,
    query: async <T>(soql: string, schema: z.ZodType<T>): Promise<readonly T[]> =>
      readQuery(target, command, soql, schema),
    organizationPreflight: (providerId, adapterVersion) =>
      capabilityPreflightResultSchema.parse({
        capabilityId: SALESFORCE_ORGANIZATION_READ,
        providerId,
        adapterVersion,
        status: 'ready',
        permissions: ['Organization:read'],
        targetIdentity: {
          orgId: organization.orgId.slice(0, 15),
          isSandbox: organization.isSandbox,
        },
        message:
          'Verified configured Salesforce Organization; business object access is query-specific',
      }),
  };
}
