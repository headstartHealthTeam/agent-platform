import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { sha256Json } from './analysis.js';
import { compareCanonicalText } from './canonical-order.js';
import { workbookFixture } from './workbook-fixture.test-helper.js';

const run = promisify(execFile);
const projectionSchema = z.object({
  analysis: z.unknown(),
  facts: z.looseObject({ analysisSha256: z.string() }),
});

describe('portable canonical replay', () => {
  it('uses code-unit order for equal, accented, and supplementary strings', () => {
    expect(compareCanonicalText('same', 'same')).toBe(0);
    expect(['ärzte', 'zoo', 'a', 'Z', '😀', '𐀀'].sort(compareCanonicalText)).toEqual([
      'Z',
      'a',
      'zoo',
      'ärzte',
      '𐀀',
      '😀',
    ]);
  });

  it('produces identical analysis and workbook fact hashes across fresh process locales', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'organic-locale-replay-'));
    const evidence = await workbookFixture();
    const { semrush, tam } = evidence.bundle.sources;
    if (!semrush || !tam) throw new Error('Synthetic optional source fixture missing');
    for (const keyword of ['ärzte', 'zoo']) {
      semrush.rankings.push({
        keyword,
        position: 5,
        searchVolume: 100,
        url: `https://headstart.health/resources/${keyword}`,
      });
      tam.keywords.push({
        keyword,
        pillar: keyword,
        searchVolume: 100,
        serviceability: 'confirmed',
      });
    }
    const bundlePath = join(directory, 'bundle.json');
    const evidencePath = join(directory, 'evidence.json');
    await writeFile(bundlePath, JSON.stringify(evidence.bundle));
    await writeFile(evidencePath, JSON.stringify(evidence));
    const nodeArgs = ['--conditions=development', '--import', 'tsx'];
    const analyzeArgs = [
      ...nodeArgs,
      fileURLToPath(new URL('./cli.ts', import.meta.url)),
      '--input',
      bundlePath,
    ];
    const workbookArgs = [
      ...nodeArgs,
      fileURLToPath(new URL('./workbook-cli.ts', import.meta.url)),
      '--project-only',
      '--evidence',
      evidencePath,
      '--template',
      fileURLToPath(new URL('../templates/headstart-report.v1.json', import.meta.url)),
      '--sources',
      fileURLToPath(
        new URL(
          '../../../skills/organic-performance-reporting/references/headstart-sources.json',
          import.meta.url
        )
      ),
    ];
    const outputs = await Promise.all(
      ['en_US.UTF-8', 'sv_SE.UTF-8'].map(async (locale) => {
        const env = { ...process.env, LC_ALL: locale, LANG: locale };
        const analysisPath = join(directory, `${locale}-analysis.json`);
        const factsPath = join(directory, `${locale}-facts.json`);
        await run(process.execPath, [...analyzeArgs, '--output', analysisPath], { env });
        await run(process.execPath, [...workbookArgs, '--output', factsPath], { env });
        return {
          analysis: await readFile(analysisPath, 'utf8'),
          projection: await readFile(factsPath, 'utf8'),
        };
      })
    );
    const [english, swedish] = outputs;
    if (!english || !swedish) throw new Error('Cross-locale output absent');
    expect(swedish).toEqual(english);
    const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
    expect(hash(swedish.analysis)).toBe(hash(english.analysis));
    expect(hash(swedish.projection)).toBe(hash(english.projection));
    const en = projectionSchema.parse(JSON.parse(english.projection));
    const sv = projectionSchema.parse(JSON.parse(swedish.projection));
    expect(sv.facts.analysisSha256).toBe(en.facts.analysisSha256);
    expect(en.facts.analysisSha256).toBe(sha256Json(JSON.parse(english.analysis)));
    expect(sha256Json(sv.facts)).toBe(sha256Json(en.facts));
  }, 30000);
});
