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
/** Observed in memory; never put screenshots or their text in the application journal. */
export interface BrowserComputerObservation {
  text: string;
  image: string;
  pauseBatch?: boolean;
  /** The page changed before the requested input was sent. Replan from this observation. */
  dispatched?: false;
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
  observe: () => Promise<BrowserComputerObservation>;
  execute: (
    actionId: string,
    action: unknown,
    expectedObservation?: BrowserComputerObservation
  ) => Promise<BrowserComputerObservation>;
  upload: (
    actionId: string,
    requirementId: string,
    point: { x: number; y: number },
    expectedObservation?: BrowserComputerObservation
  ) => Promise<BrowserComputerObservation>;
}
