import fs from 'node:fs';
import path from 'node:path';

// Native realpath expands Windows short names; Git and Node can still disagree on casing.
export const canonicalPath = (
  value: string,
  platform: NodeJS.Platform = process.platform
): string => {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const normalized = paths.normalize(fs.realpathSync.native(value));
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
};
