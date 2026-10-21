const patterns = {
  path: /^\/workspace\/outputs\/public-research\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/u,
  mediaType: /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/u,
  digest: /^sha256:[a-f0-9]{64}$/u,
  timestamp: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|\+00:00)$/u,
  fractionalTimestamp: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{1,9}(?:Z|\+00:00)$/u,
};
/** Source-neutral limits shared by producer instructions and application admission. */
export const publicResearchManifestLimits = {
  bytes: 256 * 1024,
  originalBytes: 50 * 1024 * 1024,
  totalOriginalBytes: 256 * 1024 * 1024,
  summary: 12000,
  limitations: 100,
  limitation: 2000,
  files: 50,
  title: 500,
  url: 4000,
  statedDate: 200,
  pathPattern: patterns.path.source,
  mediaTypePattern: patterns.mediaType.source,
  digestPattern: patterns.digest.source,
  timestampPattern: `${patterns.timestamp.source}|${patterns.fractionalTimestamp.source}`,
} as const;

export interface AgentPublicResearchFile {
  path: string;
  title: string;
  url: string;
  retrievedAt: string;
  statedDate: string | null;
  mediaType: string;
  digest: string;
}
export interface AgentPublicResearchManifest {
  summary: string;
  limitations: string[];
  files: AgentPublicResearchFile[];
}
export type PublicResearchManifestCode =
  | 'manifest-size'
  | 'manifest-json'
  | 'manifest-shape'
  | 'file-shape'
  | 'file-timestamp'
  | 'file-url'
  | 'duplicate-path';

/** Fixed diagnostics only; never source contents. */
export class AgentPublicResearchManifestError extends Error {
  constructor(
    readonly code: PublicResearchManifestCode,
    readonly fileIndex?: number
  ) {
    super('Public research manifest is invalid');
  }
}

/** Mechanical provenance validation, not source trust or payer applicability. */
export function parsePublicResearchManifest(bytes: Uint8Array): AgentPublicResearchManifest {
  const limits = publicResearchManifestLimits;
  if (bytes.length > limits.bytes) throw new AgentPublicResearchManifestError('manifest-size');
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new AgentPublicResearchManifestError('manifest-json');
  }
  if (
    !record(value) ||
    !text(value['summary'], limits.summary) ||
    !Array.isArray(value['limitations']) ||
    value['limitations'].length > limits.limitations ||
    !value['limitations'].every((item: unknown) => text(item, limits.limitation)) ||
    !Array.isArray(value['files']) ||
    value['files'].length > limits.files
  )
    throw new AgentPublicResearchManifestError('manifest-shape');
  const files = value['files'].map((file: unknown, index: number): AgentPublicResearchFile => {
    if (
      !record(file) ||
      !matches(file['path'], patterns.path) ||
      file['path'].endsWith('/manifest.json') ||
      !text(file['title'], limits.title) ||
      !text(file['url'], limits.url) ||
      typeof file['retrievedAt'] !== 'string' ||
      !(file['statedDate'] === null || text(file['statedDate'], limits.statedDate)) ||
      !matches(file['mediaType'], patterns.mediaType) ||
      !matches(file['digest'], patterns.digest)
    )
      throw new AgentPublicResearchManifestError('file-shape', index);
    if (!validPublicResearchTimestamp(file['retrievedAt']))
      throw new AgentPublicResearchManifestError('file-timestamp', index);
    let url: URL;
    try {
      url = new URL(file['url']);
    } catch {
      throw new AgentPublicResearchManifestError('file-url', index);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new AgentPublicResearchManifestError('file-url', index);
    return {
      path: file['path'],
      title: file['title'],
      url: file['url'],
      retrievedAt: file['retrievedAt'],
      statedDate: typeof file['statedDate'] === 'string' ? file['statedDate'] : null,
      mediaType: file['mediaType'],
      digest: file['digest'],
    };
  });
  if (new Set(files.map((file) => file.path)).size !== files.length)
    throw new AgentPublicResearchManifestError('duplicate-path');
  return { summary: value['summary'], limitations: value['limitations'], files };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}
function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}
function validPublicResearchTimestamp(value: string): boolean {
  if (!matches(value, patterns.timestamp) && !matches(value, patterns.fractionalTimestamp))
    return false;
  const wholeSeconds = `${value.slice(0, 19)}.000Z`;
  const date = new Date(wholeSeconds);
  return Number.isFinite(date.getTime()) && date.toISOString() === wholeSeconds;
}
