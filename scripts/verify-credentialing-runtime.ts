import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { PDFDocument } from '@cantoo/pdf-lib';
import JSZip from 'jszip';

import { runtimeFingerprint } from './runtime-packaging.js';

/** Exercise the deployed dependency closure outside the checkout without any source connection. */
export async function verifyCredentialingRuntime(runtime: string): Promise<void> {
  if (!isAbsolute(runtime)) throw new Error('Absolute --runtime required');
  const root = resolve(runtime);
  const receipt: unknown = JSON.parse(await readFile(join(root, 'runtime-receipt.json'), 'utf8'));
  if (
    receipt === null ||
    typeof receipt !== 'object' ||
    !('artifactSha256' in receipt) ||
    receipt.artifactSha256 !== (await runtimeFingerprint(root))
  )
    throw new Error('Runtime bytes changed');
  const scratch = await mkdtemp(join(tmpdir(), 'credentialing-installed-smoke-'));
  try {
    const file = join(scratch, 'invented.txt');
    await writeFile(file, 'Invented provider evidence for offline installation verification.');
    const args = [
      join(root, 'node_modules/@headstart-health/document-reading/dist/cli.js'),
      '--file',
      file,
      '--mime',
      'text/plain',
      '--mode',
      'text',
      '--output',
      join(scratch, 'result'),
    ];
    execFileSync(process.execPath, args, { cwd: scratch, timeout: 30000, stdio: 'pipe' });
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]).drawText('Invented license');
    const pdfPath = join(scratch, 'invented.pdf');
    await writeFile(pdfPath, await pdf.save());
    const office = new JSZip();
    office.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    );
    office.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Invented complete work history</w:t></w:r></w:p></w:body></w:document>'
    );
    const officePath = join(scratch, 'invented.docx');
    await writeFile(
      officePath,
      await office.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    );
    for (const [name, path, mime, mode] of [
      ['pdf', pdfPath, 'application/pdf', 'page'],
      [
        'office',
        officePath,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text',
      ],
    ]) {
      if (!name || !path || !mime || !mode) throw new Error('Invalid smoke fixture');
      const output = join(scratch, name);
      execFileSync(
        process.execPath,
        [
          args[0] ?? '',
          '--file',
          path,
          '--mime',
          mime,
          '--mode',
          mode,
          ...(mode === 'page' ? ['--page', '1'] : []),
          '--output',
          output,
        ],
        { cwd: scratch, timeout: 30000, stdio: 'pipe' }
      );
      const result = await readFile(join(output, 'result.json'), 'utf8');
      if (name === 'office' && !result.includes('Invented complete work history'))
        throw new Error('Office worker output missing');
      if (name === 'pdf' && !result.includes('image/png'))
        throw new Error('Native PDF output missing');
    }
    for (const name of ['google-drive-data', 'headstart-mcp-data']) {
      const entry = pathToFileURL(
        join(root, `node_modules/@headstart-health/${name}/dist/cli.js`)
      ).href;
      execFileSync(
        process.execPath,
        ['--input-type=module', '--eval', 'await import(process.argv[1])', entry],
        { cwd: scratch, timeout: 30000, stdio: 'pipe' }
      );
    }
    process.stdout.write(
      'Installed PDF/Office readers, tool entrypoints and exact runtime bytes verified; no source reads or model run.\n'
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { runtime: { type: 'string' } }, strict: true });
  if (!values.runtime) throw new Error('--runtime required');
  await verifyCredentialingRuntime(values.runtime);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    process.stderr.write('Installed credentialing runtime verification failed.\n');
    process.exitCode = 1;
  });
