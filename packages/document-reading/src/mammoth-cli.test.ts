import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const mammothRequire = createRequire(require.resolve('mammoth'));
const cli = mammothRequire.resolve('../bin/mammoth');

describe('Mammoth parser security compatibility', () => {
  it('removes the vulnerable formatter without replacing the Word reader', () => {
    expect(mammothRequire('argparse/package.json')).toMatchObject({ version: '2.0.1' });
    expect(mammothRequire('argparse/package.json')).not.toHaveProperty('dependencies.sprintf-js');
    expect(
      execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8', timeout: 10_000 })
    ).toContain('--output-format');
  }, 15_000);

  it('keeps real legacy CLI arguments, conversion, style maps and output paths working', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mammoth-cli-'));
    try {
      const zip = new JSZip();
      zip.file(
        '[Content_Types].xml',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
      );
      zip.file(
        'word/document.xml',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Complete synthetic Word evidence</w:t></w:r></w:p></w:body></w:document>'
      );
      const input = join(directory, 'evidence.docx');
      const output = join(directory, 'evidence.html');
      const style = join(directory, 'style.map');
      await writeFile(input, await zip.generateAsync({ type: 'nodebuffer' }));
      await writeFile(style, 'p => h2:fresh');
      expect(
        execFileSync(process.execPath, [cli, input, '--output-format', 'html'], {
          encoding: 'utf8',
          timeout: 10_000,
        })
      ).toBe('<p>Complete synthetic Word evidence</p>');
      execFileSync(process.execPath, [cli, input, output, '--style-map', style], {
        timeout: 10_000,
      });
      expect(await readFile(output, 'utf8')).toBe('<h2>Complete synthetic Word evidence</h2>');
      expect(() =>
        execFileSync(process.execPath, [cli, input, '--output-format', 'invalid'], {
          stdio: 'pipe',
          timeout: 10_000,
        })
      ).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
