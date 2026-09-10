#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { canonicalJsonPretty, sha256Json } from './analysis.js';
import { workbookTemplateSchema } from './workbook-contract.js';
import { buildWorkbookFacts } from './workbook-facts.js';
import { buildWorkbookPlan } from './workbook-plan.js';

async function load(path: string | undefined): Promise<unknown> {
  if (!path) throw new Error('All workbook plan input paths are required');
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      template: { type: 'string' },
      sources: { type: 'string' },
      evidence: { type: 'string' },
      selection: { type: 'string' },
      'project-only': { type: 'boolean', default: false },
      narrative: { type: 'string' },
      output: { type: 'string' },
    },
    strict: true,
  });
  if (!values.output) throw new Error('A new --output file is required');
  const [template, sources, evidence] = await Promise.all(
    [values.template, values.sources, values.evidence].map(load)
  );
  const selection = values.selection ? await load(values.selection) : undefined;
  const { analysis, facts } = buildWorkbookFacts({ template, sources, evidence, selection });
  if (values['project-only']) {
    if (values.target || values.narrative)
      throw new Error('Projection-only mode does not take target or narrative inputs');
    await writeFile(
      resolve(values.output),
      canonicalJsonPretty({
        analysis,
        facts,
        narrativeBindings: workbookTemplateSchema
          .parse(template)
          .sheets.flatMap((sheet) =>
            sheet.bindings
              .filter((binding) => binding.owner === 'narrative')
              .map((binding) => ({ sheet: sheet.title, ...binding }))
          ),
      }) + '\n',
      { flag: 'wx', mode: 0o600 }
    );
    process.stdout.write(
      'Projected verified evidence; agent-authored narrative is still required. No Google files were changed.\n'
    );
    return;
  }
  const [target, narrative] = await Promise.all([values.target, values.narrative].map(load));
  const plan = buildWorkbookPlan({
    target,
    template,
    sources,
    analysis,
    narrative,
    facts: new Map(Object.entries(facts.blocks)),
  });
  await writeFile(
    resolve(values.output),
    canonicalJsonPretty({
      ...plan,
      factProjectionSha256: sha256Json(facts),
      factEvidence: facts.evidence,
    }) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
  process.stdout.write('Created a local population plan; no Google files were changed.\n');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    (error instanceof Error ? error.message : 'Workbook planning failed') + '\n'
  );
  process.exitCode = 1;
}
