import type { ExecutorConnection } from './self-hosted.js';

/** Optional self-hosted compute lifecycle; the API adapter does not depend on a Docker implementation. */
export interface SessionExecutor {
  ensure(connection: ExecutorConnection, expiresAt: number): Promise<void>;
  stop(sessionId: string): Promise<void>;
}
