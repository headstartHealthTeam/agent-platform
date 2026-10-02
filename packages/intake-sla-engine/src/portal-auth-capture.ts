import { parse } from 'csv-parse/sync';
import { z } from 'zod';

import { requireContract as check } from './connector-checkpoint.js';
import { sha256Json } from './json-fingerprint.js';
import { portalExportDate } from './portal-export-date.js';

// Schema owned by Admin Portal AuthRequestList and RequestAuth.types, not Intake lifecycle policy.
export const PORTAL_AUTH_CSV_HEADERS = [
  'Provider Name',
  'Client Name',
  'Auth Type',
  'Request #',
  'Submitted Date',
  'Last Updated',
  'Headstart Point Person',
  'Place of Service',
  'Status',
  'Est. Hrs /Wk',
  'Preferred Session Time(s)',
  'RBT already sourced?',
];
const statuses = new Set([
  'REVIEWING',
  'IN_PROGRESS',
  'IN_CLINICAL_REVIEW',
  'AWAITING_INSURANCE',
  'APPEALING',
  'ACTION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'CANCELED',
]);
const types = new Set(['ASSESSMENT', 'TREATMENT']);
function meaningful(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !/^(?:-|undefined(?: undefined)?|null)$/i.test(value.trim())
  );
}
function iso(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
const personSchema = z
  .looseObject({ firstName: z.unknown().optional(), lastName: z.unknown().optional() })
  .nullish();
const recordSchema = z.looseObject({ provider: personSchema, client: personSchema });
function assertRecord(value: unknown): asserts value is z.infer<typeof recordSchema> {
  check(recordSchema.safeParse(value).success, 'Invalid Portal Authorization Request record');
}
export interface PortalAuthRecord {
  readonly requestNumber: string;
  readonly providerName: string;
  readonly clientName: string;
  readonly authType: string;
  readonly submittedAt: string;
  readonly updatedAt: string;
  readonly status: string;
  readonly isActive: boolean;
  readonly [key: string]: unknown;
}
function normalizeRecord(value: unknown): PortalAuthRecord {
  assertRecord(value);
  const record = value;
  const providerName: unknown =
    record['providerName'] ??
    [record.provider?.firstName, record.provider?.lastName].filter(Boolean).join(' ');
  const clientName: unknown =
    record['clientName'] ??
    [record.client?.firstName, record.client?.lastName].filter(Boolean).join(' ');
  const requestNumber: unknown = record['requestNumber'] ?? record['friendlyId'];
  const authType: unknown = record['authType'] ?? record['type'];
  const submittedAt: unknown = record['submittedAt'] ?? record['createdAt'];
  const updatedAt: unknown = record['updatedAt'];
  const status: unknown = record['status'];
  const isActive: unknown = record['isActive'];
  check(
    meaningful(providerName) &&
      meaningful(clientName) &&
      meaningful(requestNumber) &&
      typeof authType === 'string' &&
      types.has(authType) &&
      typeof status === 'string' &&
      statuses.has(status) &&
      typeof isActive === 'boolean' &&
      iso(submittedAt) &&
      iso(updatedAt) &&
      Date.parse(updatedAt) >= Date.parse(submittedAt),
    'Invalid Portal Authorization Request record'
  );
  return {
    ...record,
    requestNumber,
    providerName,
    clientName,
    authType,
    submittedAt,
    updatedAt,
    status,
    isActive,
  };
}
const captureSchema = z.looseObject({
  version: z.literal(1),
  runId: z.string().refine(meaningful),
  asOf: z.string().refine(iso),
  collectedAt: z.string().refine(iso),
  readOnly: z.literal(true),
  accessVerified: z.literal(true),
  complete: z.literal(true),
});
type Capture = z.infer<typeof captureSchema>;
const apiSchema = z.object({
  endpoint: z.literal('/authrequest/admin/all-requests'),
  method: z.literal('GET'),
  paginationComplete: z.literal(true),
  records: z.array(z.unknown()),
  expectedCount: z.number(),
});
const viewSchema = z.object({
  view: z.enum(['active', 'inactive']),
  complete: z.literal(true),
  unfiltered: z.literal(true),
  expectedCount: z.number().int().nonnegative(),
  csv: z.string(),
});
const viewsSchema = z.array(z.looseObject({ view: z.unknown().optional() })).length(2);
function csvRows(csv: string): string[][] {
  let value: unknown;
  try {
    value = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 1024 * 1024,
    });
  } catch {
    throw new Error('Invalid Portal CSV syntax');
  }
  const result = z.array(z.array(z.string())).safeParse(value);
  check(result.success, 'Invalid Portal CSV syntax');
  return result.data;
}
function normalizeView(value: unknown, capture: Capture): PortalAuthRecord[] {
  const view = viewSchema.safeParse(value);
  check(view.success, 'Incomplete Portal CSV view');
  const rows = csvRows(view.data.csv);
  check(
    sha256Json(rows.at(0)) === sha256Json(PORTAL_AUTH_CSV_HEADERS) &&
      rows.length - 1 === view.data.expectedCount,
    'Portal CSV header or expected count mismatch'
  );
  return rows.slice(1).map((row) =>
    normalizeRecord({
      providerName: row.at(0),
      clientName: row.at(1),
      authType: row.at(2),
      requestNumber: row.at(3),
      submittedAt: portalExportDate(row.at(4) ?? '', capture['exporterTimezone']),
      updatedAt: portalExportDate(row.at(5) ?? '', capture['exporterTimezone']),
      pointPerson: row.at(6),
      placeOfService: row.at(7),
      status: row.at(8),
      isActive: view.data.view === 'active',
    })
  );
}
function captureRecords(capture: Capture): PortalAuthRecord[] {
  if (capture['mode'] === 'api') {
    const api = apiSchema.safeParse(capture);
    check(
      api.success && api.data.expectedCount === api.data.records.length,
      'Incomplete Portal API capture'
    );
    return api.data.records.map(normalizeRecord);
  }
  const views = viewsSchema.safeParse(capture['views']);
  check(
    capture['mode'] === 'native-csv' &&
      views.success &&
      new Set(views.data.map((view) => view.view)).size === 2,
    'Both Portal CSV views are required'
  );
  return views.data.flatMap((view) => normalizeView(view, capture));
}
export interface PortalAuthInventory {
  readonly version: 1;
  readonly runId: string;
  readonly asOf: string;
  readonly collectedAt: string;
  readonly complete: true;
  readonly source: 'api' | 'native-csv';
  readonly captureHash: string;
  readonly rows: PortalAuthRecord[];
  readonly counts: { readonly total: number; readonly active: number; readonly inactive: number };
}
export function normalizePortalAuthCapture(
  value: unknown,
  now = new Date().toISOString()
): PortalAuthInventory {
  const parsed = captureSchema.safeParse(value);
  check(
    parsed.success &&
      Date.parse(parsed.data.collectedAt) >= Date.parse(parsed.data.asOf) &&
      Date.parse(parsed.data.collectedAt) <= Date.parse(now),
    'Portal capture provenance is incomplete'
  );
  const capture = parsed.data;
  const records = captureRecords(capture);
  check(
    new Set(records.map((row) => row.requestNumber)).size === records.length,
    'Duplicate or overlapping Portal request IDs'
  );
  check(
    records.every(
      (row) =>
        Date.parse(row.submittedAt) <= Date.parse(capture.collectedAt) &&
        Date.parse(row.updatedAt) <= Date.parse(capture.collectedAt)
    ),
    'Portal record timestamp is later than its capture'
  );
  return {
    version: 1,
    runId: capture.runId,
    asOf: capture.asOf,
    collectedAt: capture.collectedAt,
    complete: true,
    source: capture['mode'] === 'api' ? 'api' : 'native-csv',
    captureHash: sha256Json(value),
    rows: records,
    counts: {
      total: records.length,
      active: records.filter((row) => row.isActive).length,
      inactive: records.filter((row) => !row.isActive).length,
    },
  };
}
