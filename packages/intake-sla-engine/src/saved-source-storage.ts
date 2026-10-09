import fs from 'node:fs/promises';

import { readBoundedRunProof } from './fireflies-bounded-proof.js';
import { readCacheRunProof } from './fireflies-cache-replay-proof.js';
import {
  atomicPrivateWrite,
  filesystemCode,
  localArtifactPath,
  optionalPrivateJson,
} from './private-run-storage.js';
import type { SavedSourceArtifacts } from './saved-source-health.js';

/** The caller checks mutable-run state; individual checkpoint owners retain their existing locks. */
export function savedSourceArtifacts(runDirectory: string): SavedSourceArtifacts {
  return {
    read: (name) => optionalPrivateJson(localArtifactPath(runDirectory, name)),
    write: (name, value) =>
      atomicPrivateWrite(localArtifactPath(runDirectory, name), JSON.stringify(value, null, 2)),
    readText: async (name): Promise<string | undefined> => {
      const file = localArtifactPath(runDirectory, name);
      try {
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink())
          throw new Error('Expected a private regular file');
        return await fs.readFile(file, 'utf8');
      } catch (error) {
        if (filesystemCode(error, 'ENOENT')) return undefined;
        throw error;
      }
    },
    boundedProof: (records, runAt, options) =>
      readBoundedRunProof(runDirectory, records, runAt, options),
    cacheProof: (records, runAt, options) =>
      readCacheRunProof(runDirectory, records, runAt, options),
  };
}
