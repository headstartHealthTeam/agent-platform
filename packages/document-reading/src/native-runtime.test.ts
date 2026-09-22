import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
});
