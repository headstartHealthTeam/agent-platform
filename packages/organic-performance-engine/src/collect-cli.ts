#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { GoogleAnalyticsRestProvider } from '@headstart-health/google-analytics-data';
import {
  GoogleReadTransport,
  GcloudReadTokenProvider,
} from '@headstart-health/google-read-transport';
import {
  FetchSearchConsoleTransport,
  SearchConsoleClient,
} from '@headstart-health/google-search-console';
import { GoogleSheetsRestProvider } from '@headstart-health/google-sheets-data';
import { connectSemrushStdio } from '@headstart-health/semrush-data';
import { z } from 'zod';

import { canonicalJsonPretty } from './analysis.js';
import { resolveCohortConfig } from './cohort-config.js';
import { collectOrganicEvidence, collectionPlanSchema } from './collector.js';
import {
  evidenceCoverage,
  validateOptionalSources,
  validateReportPeriods,
} from './report-contract.js';
import { resolveSemrushCredential, semrushCredentialSchema } from './semrush-credential.js';
import { resolveReportingSources } from './source-config.js';
import type { EvidenceView } from './workbook-evidence.js';

const profileSchema = z
  .object({
    semrush: z
      .object({
        entrypoint: z.string(),
        sha256: z.string(),
        credential: semrushCredentialSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      plan: { type: 'string' },
      profile: { type: 'string' },
      output: { type: 'string' },
      sources: { type: 'string' },
      cohorts: { type: 'string' },
    },
    strict: true,
  });
  if (!parsed.values.plan || !parsed.values.profile || !parsed.values.output)
    throw new Error('--plan, --profile, and a new --output directory are required');
  const suppliedPlan = collectionPlanSchema.parse(
    JSON.parse(await readFile(resolve(parsed.values.plan), 'utf8'))
  );
  const sourceConfig: unknown = parsed.values.sources
    ? JSON.parse(await readFile(resolve(parsed.values.sources), 'utf8'))
    : undefined;
  const sourcedPlan =
    sourceConfig !== undefined ? resolveReportingSources(suppliedPlan, sourceConfig) : suppliedPlan;
  const cohortConfig: unknown = parsed.values.cohorts
    ? JSON.parse(await readFile(resolve(parsed.values.cohorts), 'utf8'))
    : undefined;
  const plan =
    cohortConfig !== undefined ? resolveCohortConfig(sourcedPlan, cohortConfig) : sourcedPlan;
  const profile = profileSchema.parse(
    JSON.parse(await readFile(resolve(parsed.values.profile), 'utf8'))
  );
  validateReportPeriods(plan.report);
  validateOptionalSources(plan.report, { semrush: plan.semrush, tam: plan.tam });
  if (plan.semrush && !profile.semrush)
    throw new Error('Selected Semrush source needs a private provider profile');
  const output = resolve(parsed.values.output);
  await mkdir(output, { recursive: false, mode: 0o700 });
  const extractedAt = new Date().toISOString();
  const views: EvidenceView[] = [];
  const sink = {
    save: async (name: string, value: unknown): Promise<void> => {
      if (!/^[a-z0-9_-]+$/.test(name)) throw new Error('Invalid evidence artifact name');
      await writeFile(resolve(output, `${name}.json`), `${canonicalJsonPretty(value)}\n`, {
        flag: 'wx',
        mode: 0o600,
      });
      if (/^(gsc-|ga4-|semrush-|tam-range$)/.test(name))
        views.push({ name, extractedAt: new Date().toISOString(), data: value });
      process.stdout.write(`Saved ${name}\n`);
    },
  };
  await sink.save('collection-plan', plan);
  if (sourceConfig !== undefined) await sink.save('source-configuration', sourceConfig);
  if (cohortConfig !== undefined) await sink.save('cohort-configuration', cohortConfig);
  const tokens = new GcloudReadTokenProvider();
  const http = new GoogleReadTransport(tokens);
  let semrushReadNumber = 0;
  const connection =
    plan.semrush && profile.semrush
      ? await connectSemrushStdio({
          entrypoint: profile.semrush.entrypoint,
          sha256: profile.semrush.sha256,
          env: {
            SEMRUSH_API_KEY: await resolveSemrushCredential(profile.semrush.credential),
            LOG_LEVEL: 'error',
          },
          onRead: async (evidence): Promise<void> => {
            semrushReadNumber += 1;
            await sink.save(`semrush-mcp-read-${String(semrushReadNumber)}`, evidence);
          },
        })
      : undefined;
  try {
    const result = await collectOrganicEvidence(
      plan,
      {
        gsc: new SearchConsoleClient(new FetchSearchConsoleTransport(tokens)),
        ga4: new GoogleAnalyticsRestProvider(http),
        ...(plan.tam ? { sheets: new GoogleSheetsRestProvider(http) } : {}),
        ...(connection ? { semrush: connection.provider } : {}),
      },
      sink,
      extractedAt
    );
    await sink.save('workbook-evidence', {
      schemaVersion: 'organic-workbook-evidence/v1',
      bundle: result.bundle,
      views,
    });
    await sink.save('completed', {
      schemaVersion: 'organic-performance-run/v1',
      startedAt: extractedAt,
      completedAt: new Date().toISOString(),
      status: evidenceCoverage(result.bundle)['status'],
      evidenceCoverage: evidenceCoverage(result.bundle),
    });
  } finally {
    await connection?.close();
  }
}
try {
  await main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Organic collection failed'}\n`);
  process.exitCode = 1;
}
