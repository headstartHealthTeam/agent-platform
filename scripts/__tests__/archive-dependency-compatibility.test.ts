import { execFileSync } from 'node:child_process';

import { expect, it } from 'vitest';

// Exercise the installed transitive dependencies, rather than substituting test doubles for
// ExcelJS's older streaming ZIP contracts. A blind glob/minimatch or archiver major override
// can pass a security audit while breaking these consumers.
it('preserves workbook streams and filtered archive traversal with patched ZIP dependencies', () => {
  const script = `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const { tmpdir } = require('node:os');
    const { createRequire } = require('node:module');
    const { once } = require('node:events');
    const documents = createRequire(path.resolve('packages/document-reading/package.json'));
    const Excel = documents('exceljs');
    const excel = createRequire(documents.resolve('exceljs'));
    const archiveDependencies = createRequire(excel.resolve('archiver'));
    const readdir = archiveDependencies('readdir-glob');
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'archive-compatibility-'));
    async function matches(options) {
      const walker = readdir(directory, options);
      const items = [];
      walker.on('match', item => items.push(item.relative.replaceAll('\\\\', '/')));
      await once(walker, 'end');
      return items.sort();
    }
    async function check() {
      try {
        for (const name of ['top.txt', '.hidden.txt', 'nested/a.txt', 'nested/b.json', 'skip/x.txt']) {
          const file = path.join(directory, name);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, 'synthetic');
        }
        assert.deepEqual(await matches({ pattern: '**/*.txt', ignore: 'skip/**' }),
          ['nested/a.txt', 'top.txt']);
        assert.deepEqual(await matches({ pattern: '**/*.txt', dot: true, skip: 'skip' }),
          ['.hidden.txt', 'nested/a.txt', 'top.txt']);
        const workbookPath = path.join(directory, 'synthetic.xlsx');
        const writer = new Excel.stream.xlsx.WorkbookWriter({
          filename: workbookPath, useStyles: true, useSharedStrings: true
        });
        const sheet = writer.addWorksheet('Synthetic');
        sheet.addRow(['Field', 'Value']).commit();
        sheet.addRow(['State', 'GA']).commit();
        sheet.addRow(['Count', 3]).commit();
        sheet.addRow(['Date', new Date('2026-11-03T00:00:00Z')]).commit();
        await writer.commit();
        const workbook = new Excel.Workbook();
        await workbook.xlsx.readFile(workbookPath);
        const loaded = workbook.getWorksheet('Synthetic');
        assert.equal(loaded.getCell('B2').value, 'GA');
        assert.equal(loaded.getCell('B3').value, 3);
        assert.equal(loaded.getCell('B4').value.toISOString(), '2026-11-03T00:00:00.000Z');
        // ExcelJS 4.4 has an existing shared-string streaming-reader race on the original
        // dependencies too. The application uses the normal reader checked above. Exercise
        // the streaming reader with inline strings so this compatibility check is deterministic.
        const inlinePath = path.join(directory, 'inline.xlsx');
        const inlineWriter = new Excel.stream.xlsx.WorkbookWriter({
          filename: inlinePath, useSharedStrings: false
        });
        const inlineSheet = inlineWriter.addWorksheet('Synthetic');
        for (const row of [['Field', 'Value'], ['State', 'GA'], ['Count', 3], ['Other', 'Value']]) {
          inlineSheet.addRow(row).commit();
        }
        await inlineWriter.commit();
        const rows = [];
        const reader = new Excel.stream.xlsx.WorkbookReader(inlinePath, {
          worksheets: 'emit', sharedStrings: 'cache'
        });
        for await (const worksheet of reader) {
          for await (const row of worksheet) rows.push(row.values);
        }
        assert.equal(rows.length, 4);
        assert.equal(rows[1][2], 'GA');
        const archivePath = path.join(directory, 'synthetic.zip');
        const output = fs.createWriteStream(archivePath);
        const closed = once(output, 'close');
        const archive = excel('archiver')('zip');
        archive.on('error', error => output.destroy(error));
        archive.pipe(output);
        archive.glob('**/*.txt', { cwd: directory, ignore: 'skip/**' });
        await archive.finalize();
        await closed;
        const zip = await excel('unzipper').Open.file(archivePath);
        assert.deepEqual(zip.files.map(file => file.path).sort(), ['nested/a.txt', 'top.txt']);
        process.stdout.write('workbook and archive compatibility verified');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
    check().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  expect(
    execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 10_000 })
  ).toBe('workbook and archive compatibility verified');
});
