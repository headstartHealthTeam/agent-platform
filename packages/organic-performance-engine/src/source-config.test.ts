import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { collectionPlanSchema, type CollectionPlan } from './collector.js';
import {
  reportingSourcesSchema,
  resolveReportingSources,
  type ReportingSources,
} from './source-config.js';

async function setup(): Promise<{ plan: CollectionPlan; sources: ReportingSources }> {
  const plan = collectionPlanSchema.parse(
    JSON.parse(
      await readFile(new URL('../examples/collection-plan.example.json', import.meta.url), 'utf8')
    )
  );
  const ref = (id: string): ReportingSources['approvedReport'] => ({
    id,
    title: id,
    url: 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
  });
  const tam = plan.tam;
  if (!tam) throw new Error('Synthetic TAM missing');
  const { spreadsheetId, ...fields } = tam;
  const sources = {
    schemaVersion: 'organic-reporting-sources/v1',
    version: 'synthetic/v1',
    owner: 'Synthetic team',
    verifiedAt: '2026-09-10',
    approvedReport: ref('approved'),
    template: { ...ref('template'), version: 'template/v1' },
    strategy: {
      id: 'strategy',
      title: 'Strategy',
      url: 'https://docs.google.com/document/d/strategy/edit',
    },
    tam: { ...ref(spreadsheetId), ...fields },
    historicalReports: [ref('history')],
    approvalEvidence: [{ url: 'https://example.com/approval', meaning: 'Synthetic approval' }],
  };
  return { plan, sources: reportingSourcesSchema.parse(sources) };
}

describe('canonical reporting sources', () => {
  it('resolves an omitted selection and records source version and fingerprint', async () => {
    const { plan, sources } = await setup();
    const { tam, ...withoutTam } = plan;
    const result = resolveReportingSources(withoutTam, sources);
    expect(result.tam).toEqual(tam);
    expect(result.report['sourceConfiguration']).toMatchObject({ version: 'synthetic/v1' });
    expect(result).toEqual(resolveReportingSources(withoutTam, sources));
    expect(resolveReportingSources(plan, sources)).toEqual(result);
  });
  it('respects a deliberate optional-source omission', async () => {
    const { plan, sources } = await setup();
    const input = {
      ...plan,
      tam: undefined,
      report: {
        ...plan.report,
        omittedSources: { tam: 'No approved source for this diagnostic' },
      },
    };
    expect(resolveReportingSources(input, sources).tam).toBeUndefined();
    expect(() => resolveReportingSources({ ...input, tam: plan.tam }, sources)).toThrow(
      'both selected'
    );
  });
  it('rejects a conflicting selection rather than overriding it', async () => {
    const { plan, sources } = await setup();
    expect(() =>
      resolveReportingSources(
        {
          ...plan,
          tam: {
            ...plan.tam,
            spreadsheetId: 'another-source',
          },
        },
        sources
      )
    ).toThrow('differs');
  });
  it('rejects ambiguous roles, unbounded ranges, wrong URLs and duplicate mappings', async () => {
    const { sources } = await setup();
    expect(() =>
      reportingSourcesSchema.parse({ ...sources, strategy: sources.approvedReport })
    ).toThrow('distinct');
    expect(() =>
      reportingSourcesSchema.parse({
        ...sources,
        strategy: {
          ...sources.strategy,
          url: 'https://example.com/strategy',
        },
      })
    ).toThrow('URL and ID');
    expect(() =>
      reportingSourcesSchema.parse({
        ...sources,
        tam: {
          ...sources.tam,
          range: "'TAM'!A:E",
        },
      })
    ).toThrow('bounded');
    expect(() =>
      reportingSourcesSchema.parse({
        ...sources,
        tam: {
          ...sources.tam,
          columns: { ...sources.tam.columns, keyword: sources.tam.columns.pillar },
        },
      })
    ).toThrow('distinct');
  });
  it('validates the checked-in non-secret source reference contract', async () => {
    expect(
      reportingSourcesSchema.parse(
        JSON.parse(
          await readFile(
            new URL(
              '../../../skills/organic-performance-reporting/references/headstart-sources.json',
              import.meta.url
            ),
            'utf8'
          )
        )
      ).strategy.title
    ).toBe('SEO Content Pillar Guidance');
  });
});
