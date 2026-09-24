import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { fingerprint } from './fingerprint.js';

describe('portable fingerprints', () => {
  it('uses code-unit key order recursively regardless of locale or insertion order', () => {
    const value = { z: [{ ä: 1, A: 2, a: 3 }], ä: 4, 'e\u0301': 5, é: 6 };
    const reordered = Object.fromEntries(Object.entries(value).reverse());
    const expected = createHash('sha256')
      .update('{"e\u0301":5,"z":[{"A":2,"a":3,"ä":1}],"ä":4,"é":6}')
      .digest('hex');
    const compare = vi.spyOn(String.prototype, 'localeCompare');
    try {
      for (const locale of ['en-US', 'sv-SE']) {
        const collator = new Intl.Collator(locale);
        compare.mockImplementation(function (this: string, other: string) {
          return collator.compare(this, other);
        });
        expect(fingerprint(value)).toBe(expected);
        expect(fingerprint(reordered)).toBe(expected);
      }
    } finally {
      compare.mockRestore();
    }
  });
});
