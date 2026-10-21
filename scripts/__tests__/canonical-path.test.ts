import fs from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalPath } from '../canonical-path.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('filesystem identities reported by Git and Node', () => {
  it('equates Windows short names, separator styles and casing after native resolution', () => {
    const native = vi.spyOn(fs.realpathSync, 'native');
    native.mockReturnValueOnce(
      'C:\\Users\\RunnerAdmin\\AppData\\Local\\Temp\\workspace\\backend\\.bare'
    );
    const expected = canonicalPath(
      'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\workspace\\backend\\.bare',
      'win32'
    );
    native.mockReturnValueOnce('c:/Users/runneradmin/AppData/Local/Temp/workspace/backend/.bare');
    expect(
      canonicalPath('c:/Users/runneradmin/AppData/Local/Temp/workspace/backend/.bare', 'win32')
    ).toBe(expected);
    native.mockReturnValueOnce('C:\\different-clone\\.git');
    expect(canonicalPath('C:\\different-clone\\.git', 'win32')).not.toBe(expected);
  });

  it('preserves case distinctions on POSIX and rejects missing filesystem paths', () => {
    const native = vi.spyOn(fs.realpathSync, 'native');
    native.mockReturnValueOnce('/workspace/Backend/.bare');
    const upper = canonicalPath('/workspace/Backend/.bare', 'linux');
    native.mockReturnValueOnce('/workspace/backend/.bare');
    expect(canonicalPath('/workspace/backend/.bare', 'linux')).not.toBe(upper);
    native.mockImplementation(() => {
      throw new Error('missing path');
    });
    expect(() => canonicalPath('/missing', 'linux')).toThrow('missing path');
  });
});
