import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const OFFICE_SMOKE = `
import ExcelJS from 'exceljs';
const {readDocument}=await import(process.argv[1]);
const book=new ExcelJS.Workbook();
book.addWorksheet('Employment').getCell('A1').value='history '.repeat(4000);
book.addWorksheet('Final', {state:'hidden'}).getCell('D42').value='FINAL CORRECTION';
const bytes=Buffer.from(await book.xlsx.writeBuffer());
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let offset=0, text='';
while (offset !== null) {
  const result=await readDocument(bytes,mime,{mode:'text',offset});
  if (result.document.text.length>24000) throw new Error('Unbounded page');
  text+=result.document.text; offset=result.document.nextOffset;
}
if (!text.includes('Final (hidden)') || !text.includes('FINAL CORRECTION')) throw new Error('Lost evidence');
process.stdout.write('complete Office worker evidence');
`;

describe('native Node ESM interoperability', () => {
  it('loads the real format libraries outside Vitest transformation', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        'const {readDocument}=await import(process.argv[1]);const r=await readDocument(Buffer.from("synthetic complete evidence"),"text/plain",{mode:"text"});process.stdout.write(r.document.text);',
        new URL('./read-document.ts', import.meta.url).href,
      ],
      { cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 30_000, encoding: 'utf8' }
    );
    expect(output).toBe('synthetic complete evidence');
  }, 35_000);

  it('runs the real source-checkout Office worker through the explicit TypeScript loader', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        OFFICE_SMOKE,
        new URL('./index.ts', import.meta.url).href,
      ],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        timeout: 30_000,
        encoding: 'utf8',
      }
    );
    expect(output).toBe('complete Office worker evidence');
  }, 35_000);

  it('ships a native JavaScript worker alongside the built ESM entrypoint', async () => {
    const target = await mkdtemp(join(tmpdir(), 'document-reading-build-'));
    try {
      const cwd = fileURLToPath(new URL('..', import.meta.url));
      const cli = fileURLToPath(new URL('./cli-default.js', import.meta.resolve('tsup')));
      execFileSync(
        process.execPath,
        [
          cli,
          'src/index.ts',
          'src/office-worker.ts',
          '--format',
          'esm',
          '--target',
          'node22',
          '--out-dir',
          target,
        ],
        { cwd, timeout: 30_000, stdio: 'pipe' }
      );
      await writeFile(join(target, 'package.json'), '{"type":"module"}');
      await symlink(
        join(cwd, 'node_modules'),
        join(target, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir'
      );
      const output = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          OFFICE_SMOKE,
          pathToFileURL(join(target, 'index.js')).href,
        ],
        { cwd, timeout: 30_000, encoding: 'utf8' }
      );
      expect(output).toBe('complete Office worker evidence');
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  }, 65_000);
});
