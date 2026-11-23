/** Control-level readback only. Never a claim of portal persistence, acceptance or submission. */
export interface BrowserEntryReadback {
  kind: 'fill' | 'select' | 'upload';
  matched: boolean;
  files?: { name: string; digest: string; bytes: number }[];
}

/** Immutable application authority, separate from package review and private login handoff. */
export interface BrowserPackageRelease {
  packageId: string;
  fingerprint: string;
  caseVersion: number;
  actorId: string;
  origin: string;
  releasedAt: string;
}
/** In-memory bridge to native computer use. The application owns authority and the action journal.
 * No model-supplied browser endpoint, credentials, scripts, paths or file bytes are accepted. */
export interface BrowserComputerTask {
  task: string;
  reviewed: { requirementId: string; value?: string; fileNames?: string[] }[];
  /** Record the result of reopening the saved section or the uploaded-document list. */
  confirmReadback?: (
    requirementId: string,
    kind: 'field' | 'upload',
    observation: string
  ) => Promise<void>;
  authorize: () => Promise<void>;
  observe: () => Promise<{ text: string; image: string; pauseBatch?: boolean }>;
  execute: (
    actionId: string,
    action: unknown
  ) => Promise<{ text: string; image: string; pauseBatch?: boolean }>;
  upload: (
    actionId: string,
    requirementId: string,
    point: { x: number; y: number }
  ) => Promise<{ text: string; image: string; pauseBatch?: boolean }>;
}
