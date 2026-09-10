import { z } from 'zod';

import { sha256Json } from './analysis.js';
import { collectionPlanSchema, type CollectionPlan } from './collector.js';
import type { OrganicPerformanceBundle } from './schemas.js';

const fileReference = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/),
    title: z.string().trim().min(1),
    url: z.url(),
  })
  .strict()
  .refine((value) => {
    const url = new URL(value.url);
    return (
      url.origin === 'https://docs.google.com' &&
      /^\/(spreadsheets|document)\/d\//.test(url.pathname) &&
      url.pathname.split('/')[3] === value.id
    );
  }, 'Google file URL and ID must agree');
export const reportingSourcesSchema = z
  .object({
    schemaVersion: z.literal('organic-reporting-sources/v1'),
    version: z.string().min(1),
    owner: z.string().min(1),
    verifiedAt: z.iso.date(),
    approvedReport: fileReference,
    template: fileReference.safeExtend({ version: z.string().min(1) }),
    strategy: fileReference,
    tam: fileReference.safeExtend({
      ...collectionPlanSchema.shape.tam.unwrap().omit({ spreadsheetId: true }).shape,
    }),
    historicalReports: z.array(fileReference),
    approvalEvidence: z
      .array(
        z
          .object({
            url: z.url(),
            meaning: z.string().min(1),
          })
          .strict()
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const references = [
      value.approvedReport,
      value.template,
      value.strategy,
      value.tam,
      ...value.historicalReports,
    ];
    if (new Set(references.map((ref) => ref.id)).size !== references.length)
      context.addIssue({ code: 'custom', message: 'Source roles must have distinct file IDs' });
    if (!/^'([^']|'')+'![A-Z]+[1-9]\d*:[A-Z]+[1-9]\d*$/.test(value.tam.range))
      context.addIssue({ code: 'custom', message: 'TAM needs an exact bounded quoted range' });
    if (new Set(Object.values(value.tam.columns)).size !== 5)
      context.addIssue({ code: 'custom', message: 'TAM column mappings must be distinct' });
  });
export type ReportingSources = z.infer<typeof reportingSourcesSchema>;

/** Replays must use the source contract actually selected before collection. */
export function validateCollectedSources(
  bundle: OrganicPerformanceBundle,
  sources: ReportingSources
): void {
  const stamp = bundle.report.sourceConfiguration;
  if (!stamp)
    throw new Error(
      'Workbook evidence has no collected source configuration; recollect with --sources. Legacy bundles remain analysis-only.'
    );
  if (stamp.version !== sources.version || stamp.sha256 !== sha256Json(sources))
    throw new Error(
      'Collected source configuration differs from workbook sources; use the original contract or recollect. Silent migration is not supported.'
    );
  const tam = bundle.sources.tam?.metadata;
  if (
    tam &&
    (tam.sourceId !== sources.tam.id ||
      tam['range'] !== sources.tam.range ||
      tam.approvedAt !== sources.tam.approvedAt ||
      tam['approvalScope'] !== sources.tam.approvalScope)
  )
    throw new Error('Collected TAM identity, range or approval differs from source configuration');
}

/** Explicit opt-in resolution; a supplied plan scope is never silently replaced. */
export function resolveReportingSources(input: unknown, sourcesInput: unknown): CollectionPlan {
  const plan = collectionPlanSchema.parse(input);
  const sources = reportingSourcesSchema.parse(sourcesInput);
  const { id, range, approvedAt, approvalScope, columns, coreValue } = sources.tam;
  const tam = { spreadsheetId: id, range, approvedAt, approvalScope, columns, coreValue };
  if (plan.tam && sha256Json(plan.tam) !== sha256Json(tam))
    throw new Error(
      'Explicit TAM selection differs from source configuration; resolve deliberately'
    );
  const omitted = plan.report.omittedSources?.tam;
  if (omitted && plan.tam) throw new Error('TAM cannot be both selected and omitted');
  return collectionPlanSchema.parse({
    ...plan,
    ...(!omitted ? { tam } : {}),
    report: {
      ...plan.report,
      sourceConfiguration: { version: sources.version, sha256: sha256Json(sources) },
    },
  });
}
