import { describe, expect, expectTypeOf, it } from 'vitest';

import { buildIdentityProfile } from './identity-profile.js';
import { normalizePortalAuthCapture, PORTAL_AUTH_CSV_HEADERS } from './portal-auth-capture.js';
import {
  matchPortalAuthRequestsToOpportunities,
  portalAuthRequestClientName,
  portalAuthRequestProviderName,
  portalAuthRequestType,
} from './portal-auth-request.js';
import { adaptPortalTreatmentAuthorizationRequests } from './portal-authorization-evidence.js';
import { portalExportDate } from './portal-export-date.js';

const NOW = '2026-01-10T17:00:00Z';
const CLIENT = 'Synthetic Client';
const PROVIDER = 'Synthetic, Provider';
interface View {
  view: string;
  expectedCount: number;
  complete: boolean;
  unfiltered: boolean;
  csv: string;
}
interface CsvCapture {
  version: number;
  runId: string;
  asOf: string;
  collectedAt: string;
  mode: string;
  exporterTimezone: string;
  readOnly: boolean;
  accessVerified: boolean;
  complete: boolean;
  views: View[];
}
function csvLine(row: readonly string[]): string {
  return row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
}
function capture(): CsvCapture {
  const row = [
    PROVIDER,
    CLIENT,
    'TREATMENT',
    'REQ-1',
    'Jan 10,2026 9:30 AM',
    'Jan 10,2026 10:30 AM',
    '-',
    '-',
    'REVIEWING',
    '-',
    '-',
    '-',
  ];
  return {
    version: 1,
    runId: 'synthetic',
    asOf: '2026-01-10T16:00:00Z',
    collectedAt: '2026-01-10T16:01:00Z',
    mode: 'native-csv',
    exporterTimezone: 'America/New_York',
    readOnly: true,
    accessVerified: true,
    complete: true,
    views: [
      {
        view: 'active',
        expectedCount: 1,
        complete: true,
        unfiltered: true,
        csv: '\uFEFF' + [PORTAL_AUTH_CSV_HEADERS, row].map(csvLine).join('\r\n'),
      },
      {
        view: 'inactive',
        expectedCount: 0,
        complete: true,
        unfiltered: true,
        csv: csvLine(PORTAL_AUTH_CSV_HEADERS),
      },
    ],
  };
}
function firstView(value: CsvCapture): View {
  const view = value.views.at(0);
  if (!view) throw new Error('Fixture view missing');
  return view;
}
function apiCapture(): ReturnType<typeof capture> & {
  endpoint: string;
  method: string;
  paginationComplete: boolean;
  expectedCount: number;
  records: ReturnType<typeof normalizePortalAuthCapture>['rows'];
} {
  const csv = normalizePortalAuthCapture(capture(), NOW);
  return {
    ...capture(),
    mode: 'api',
    endpoint: '/authrequest/admin/all-requests',
    method: 'GET',
    paginationComplete: true,
    expectedCount: csv.rows.length,
    records: csv.rows,
  };
}
describe('Portal authorization capture', () => {
  it('retains BOM, quoted commas, embedded newlines and explicitly empty inactive view', () => {
    const input = capture();
    firstView(input).csv = firstView(input).csv.replace(CLIENT, 'Synthetic\nClient');
    const before = structuredClone(input);
    const output = normalizePortalAuthCapture(input, NOW);
    expect(output).toMatchObject({
      version: 1,
      runId: input.runId,
      asOf: input.asOf,
      collectedAt: input.collectedAt,
      complete: true,
      source: 'native-csv',
      counts: { total: 1, active: 1, inactive: 0 },
    });
    expect(output.rows.at(0)).toEqual({
      providerName: PROVIDER,
      clientName: 'Synthetic\nClient',
      authType: 'TREATMENT',
      requestNumber: 'REQ-1',
      submittedAt: '2026-01-10T14:30:00.000Z',
      updatedAt: '2026-01-10T15:30:00.000Z',
      pointPerson: '-',
      placeOfService: '-',
      status: 'REVIEWING',
      isActive: true,
    });
    expect(input).toEqual(before);
    expect(output.captureHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('preserves API source metadata and its nested references while normalizing fallbacks', () => {
    const input = apiCapture();
    const provider = { firstName: 'Provider', lastName: 'North' };
    const client = { firstName: 'Sample', lastName: 'Client' };
    const raw = {
      provider,
      client,
      friendlyId: 'REQ-2',
      type: 'ASSESSMENT',
      createdAt: '2026-01-10T14:30:00Z',
      updatedAt: '2026-01-10T15:30:00Z',
      status: 'APPROVED',
      isActive: false,
      comments: 'Synthetic comment',
      extra: { retained: true },
    };
    const output = normalizePortalAuthCapture({ ...input, records: [raw] }, NOW);
    expect(output.rows.at(0)).toEqual({
      ...raw,
      requestNumber: 'REQ-2',
      providerName: 'Provider North',
      clientName: 'Sample Client',
      authType: 'ASSESSMENT',
      submittedAt: raw.createdAt,
    });
    expect(output.rows.at(0)?.['provider']).toBe(provider);
    expect(output.rows.at(0)?.['client']).toBe(client);
    expect(output.rows.at(0)?.['extra']).toBe(raw.extra);
    expect(output.counts).toEqual({ total: 1, active: 0, inactive: 1 });
  });
  it('rejects incomplete, filtered, duplicated, invalid or schema-drifted CSV views', () => {
    const mutations: ((value: CsvCapture) => void)[] = [
      (value): void => {
        value.views.pop();
      },
      (value): void => {
        firstView(value).expectedCount++;
      },
      (value): void => {
        firstView(value).unfiltered = false;
      },
      (value): void => {
        firstView(value).csv += ',"extra"';
      },
      (value): void => {
        firstView(value).csv = firstView(value).csv.replace('REVIEWING', 'UNKNOWN');
      },
      (value): void => {
        value.views = [firstView(value), { ...firstView(value), view: 'inactive' }];
      },
      (value): void => {
        firstView(value).csv = firstView(value).csv.replace('Provider Name', 'Owner');
      },
      (value): void => {
        firstView(value).csv = '"unclosed';
      },
      (value): void => {
        firstView(value).view = 'filtered';
      },
      (value): void => {
        firstView(value).expectedCount = -1;
      },
      (value): void => {
        firstView(value).complete = false;
      },
    ];
    for (const mutate of mutations) {
      const input = capture();
      mutate(input);
      expect(() => normalizePortalAuthCapture(input, NOW)).toThrow();
    }
  });
  it('rejects missing provenance and future or reversed capture times', () => {
    for (const patch of [
      { version: 0 },
      { runId: '-' },
      { readOnly: false },
      { accessVerified: false },
      { complete: false },
      { asOf: '2026-01-10T16:00:00' },
      { collectedAt: '2026-01-10T18:00:00Z' },
      { collectedAt: '2026-01-10T15:00:00Z' },
      { mode: 'other' },
    ]) {
      expect(() => normalizePortalAuthCapture({ ...capture(), ...patch }, NOW)).toThrow();
    }
  });
  it('requires complete API endpoint, method, pagination and exact counts', () => {
    for (const patch of [
      { endpoint: '/other' },
      { method: 'POST' },
      { paginationComplete: false },
      { expectedCount: 2 },
      { records: null },
    ])
      expect(() => normalizePortalAuthCapture({ ...apiCapture(), ...patch }, NOW)).toThrow(
        'API capture'
      );
  });
  it('rejects unknown lifecycle, inactive ambiguity, placeholder identity and invalid record times', () => {
    const input = apiCapture();
    const row = input.records.at(0);
    if (!row) throw new Error('Fixture record missing');
    for (const patch of [
      { status: 'UNKNOWN' },
      { authType: 'UNKNOWN' },
      { isActive: 'true' },
      { providerName: '-' },
      { clientName: 'undefined undefined' },
      { requestNumber: '' },
      { submittedAt: 'invalid' },
      { updatedAt: '2026-01-09T00:00:00Z' },
      { updatedAt: '2026-01-10T16:02:00Z' },
    ]) {
      expect(() =>
        normalizePortalAuthCapture({ ...input, records: [{ ...row, ...patch }] }, NOW)
      ).toThrow();
    }
  });
  it('matches real identity output and supplies the existing authorization evidence adapter', () => {
    const profile = buildIdentityProfile({
      opportunityId: 'opp',
      opportunityName: CLIENT,
      stage: '97151 Started',
    });
    const inventory = normalizePortalAuthCapture(capture(), NOW);
    const matches = matchPortalAuthRequestsToOpportunities(inventory.rows, [profile]);
    const records = matches.byOpportunity.get('opp') ?? [];
    const matched = records.at(0);
    expectTypeOf(matched?.status).toEqualTypeOf<string | undefined>();
    expectTypeOf(matched?.isActive).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(matched?.updatedAt).toEqualTypeOf<string | undefined>();
    const events = adaptPortalTreatmentAuthorizationRequests({
      profile,
      records,
      gate: { gateCategory: 'treatmentPlan' },
      asOf: NOW,
    });
    expect(events).toHaveLength(1);
    expect(events.at(0)?.factType).toBe('tp-portal-submitted-awaiting-clinical-quality');
  });
});
describe('Portal export dates', () => {
  it('uses Eastern standard/daylight offset and handles noon/midnight', () => {
    expect(portalExportDate('Jul 10,2026 9:30 AM', 'America/New_York')).toBe(
      '2026-07-10T13:30:00.000Z'
    );
    expect(portalExportDate('Jan 10,2026 12:30 AM', 'America/New_York')).toBe(
      '2026-01-10T05:30:00.000Z'
    );
    expect(portalExportDate('Jan 10,2026 12:30 PM', 'America/New_York')).toBe(
      '2026-01-10T17:30:00.000Z'
    );
  });
  it('rejects invalid syntax, impossible or ambiguous local times and the wrong exporter timezone', () => {
    for (const value of [
      'Nov 01,2026 1:30 AM',
      'Mar 08,2026 2:30 AM',
      'Feb 30,2026 1:30 PM',
      'bad',
      'Jan 10,2026 0:30 AM',
      'Jan 10,2026 13:30 PM',
      'Jan 10,2026 9:60 AM',
    ])
      expect(() => portalExportDate(value, 'America/New_York')).toThrow();
    expect(() => portalExportDate('Jan 10,2026 9:30 AM', 'UTC')).toThrow('exporter timezone');
  });
});
describe('Portal request matching', () => {
  const profiles = [
    {
      opportunityId: 'a',
      opportunityName: CLIENT,
      clientAliases: ['Alias'],
      knownNameVariants: ['Variant'],
    },
    { opportunityId: 'b', opportunityName: 'Shared', providerIdentity: { names: ['East'] } },
    { opportunityId: 'c', opportunityName: 'Shared', providerIdentity: { names: ['West'] } },
  ];
  it('normalizes supported names/types and ignores object-valued display fields', () => {
    expect(
      portalAuthRequestClientName({ client: { firstName: 'Sample', lastName: 'Client' } })
    ).toBe('Sample Client');
    expect(
      portalAuthRequestProviderName({ provider: { firstName: 'Provider', lastName: 'North' } })
    ).toBe('Provider North');
    expect(portalAuthRequestType({ authorizationType: ' Initial ' })).toBe('Initial');
    expect(portalAuthRequestClientName({ clientName: {} })).toBe('');
    expect(portalAuthRequestClientName()).toBe('');
    expect(portalAuthRequestProviderName()).toBe('');
    expect(portalAuthRequestType()).toBe('');
  });
  it('prefers explicit ID, then exact alias/name with provider-only disambiguation', () => {
    const records = [
      { opportunityId: 'a', clientName: 'stale', requestNumber: '1' },
      { clientName: 'Shared', providerName: 'West', friendlyId: '2' },
      { clientName: 'Alias', Id: '3' },
      { clientName: 'Variant', requestNumber: '4' },
    ];
    const before = structuredClone(records);
    const result = matchPortalAuthRequestsToOpportunities(records, profiles);
    expect(result.unmatched).toEqual([]);
    expect(result.byOpportunity.get('a')?.map((row) => row.requestNumber)).toEqual(['1', '3', '4']);
    expect(result.byOpportunity.get('c')?.at(0)?.matchReason).toContain('corroborating');
    expect(result.byOpportunity.get('a')?.at(0)?.matchReason).toContain('supplied');
    expect(records).toEqual(before);
  });
  it('retains declared metadata types while replacing normalized input literals', () => {
    const retained = { source: 'synthetic', nested: { revision: 3 } };
    const input: {
      readonly clientName: ' Alias ';
      readonly requestNumber: null;
      readonly friendlyId: 'request';
      readonly retained: typeof retained;
      readonly [key: string]: unknown;
    } = { clientName: ' Alias ', requestNumber: null, friendlyId: 'request', retained };
    const matched = matchPortalAuthRequestsToOpportunities([input], profiles)
      .byOpportunity.get('a')
      ?.at(0);
    expectTypeOf(matched?.clientName).toEqualTypeOf<string | undefined>();
    expectTypeOf(matched?.requestNumber).toEqualTypeOf<string | number | null | undefined>();
    expectTypeOf(matched?.retained).toEqualTypeOf<typeof retained | undefined>();
    expect(matched?.clientName).toBe('Alias');
    expect(matched?.requestNumber).toBe('request');
    expect(matched?.retained).toBe(retained);
  });
  it('keeps ambiguous and unknown identities unmatched without fuzzy or provider-only admission', () => {
    const result = matchPortalAuthRequestsToOpportunities(
      [
        { clientName: 'Shared' },
        { clientName: 'Unknown', providerName: 'East' },
        { opportunityId: 'missing', clientName: CLIENT },
      ],
      profiles
    );
    expect(result.byOpportunity.size).toBe(0);
    expect(result.unmatched.map((row) => row.reason)).toEqual([
      'Ambiguous Opportunity match',
      'No Opportunity match',
      'No Opportunity match',
    ]);
    expect(matchPortalAuthRequestsToOpportunities().byOpportunity.size).toBe(0);
  });
});
