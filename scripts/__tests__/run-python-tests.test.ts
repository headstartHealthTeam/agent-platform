import { describe, expect, it } from 'vitest';
import { pythonCandidates } from '../run-python-tests.js';

describe('pythonCandidates', () => {
  it('prefers the Python launcher on Windows', () => {
    expect(pythonCandidates('win32')).toEqual([
      { command: 'py', prefixArgs: ['-3'] },
      { command: 'python', prefixArgs: [] },
      { command: 'python3', prefixArgs: [] },
    ]);
  });

  it('prefers python3 on Unix-like platforms', () => {
    expect(pythonCandidates('darwin')).toEqual([
      { command: 'python3', prefixArgs: [] },
      { command: 'python', prefixArgs: [] },
    ]);
  });
});
