import { describe, expect, it } from 'vitest';

import {
  AgentPublicResearchManifestError,
  parsePublicResearchManifest,
  type AgentPublicResearchFile,
} from './public-research-manifest.js';

const file: AgentPublicResearchFile = {
  path: '/workspace/outputs/public-research/manual.pdf',
  title: 'Fictional public manual',
  url: 'https://example.org/manual.pdf',
  retrievedAt: '2026-10-13T19:06:38.781123Z',
  statedDate: null,
  mediaType: 'application/pdf',
  digest: `sha256:${'a'.repeat(64)}`,
};
const bytes = (files = [file]): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify({ summary: 'Synthetic research', limitations: [], files })
  );

describe('canonical public research manifest', () => {
  it.each(['2026-10-13T19:06:38.781123Z', '2026-10-13T19:06:38.781123+00:00'])(
    'preserves exact high-precision UTC provenance %s',
    (retrievedAt) => {
      expect(
        parsePublicResearchManifest(bytes([{ ...file, retrievedAt }])).files[0]?.retrievedAt
      ).toBe(retrievedAt);
    }
  );
  it('rejects the observed 265-character metadata mismatch at entry 37 without exposing values', () => {
    const files = Array.from({ length: 45 }, (_, index) => ({
      ...file,
      path: `/workspace/outputs/public-research/source-${String(index)}.pdf`,
      statedDate: index === 36 ? 's'.repeat(265) : null,
    }));
    expect(() => parsePublicResearchManifest(bytes(files))).toThrow(
      expect.objectContaining({ code: 'file-shape', fileIndex: 36 })
    );
    const rejected = files[36];
    if (!rejected) throw new Error('Missing synthetic manifest entry');
    files[36] = { ...rejected, statedDate: null };
    expect(parsePublicResearchManifest(bytes(files)).files).toHaveLength(45);
  });
  it.each([
    { statedDate: 'x'.repeat(201) },
    { title: 'x'.repeat(501) },
    { path: '/workspace/outputs/public-research/../private' },
    { path: '/workspace/outputs/public-research/manifest.json' },
    { digest: 'sha256:no' },
    { retrievedAt: '2026-02-30T00:00:00Z' },
    { retrievedAt: '2026-10-13T01:00:00-04:00' },
    { url: `https://${['invented-user', 'invented-password'].join(':')}@example.org/` },
    { mediaType: 'not-a-media-type' },
  ])('rejects invalid provenance %j', (override) => {
    expect(() => parsePublicResearchManifest(bytes([{ ...file, ...override }]))).toThrow(
      AgentPublicResearchManifestError
    );
  });
  it('rejects duplicate paths, excessive bytes and malformed JSON', () => {
    expect(() => parsePublicResearchManifest(bytes([file, file]))).toThrow(
      expect.objectContaining({ code: 'duplicate-path' })
    );
    expect(() => parsePublicResearchManifest(new Uint8Array(256 * 1024 + 1))).toThrow(
      expect.objectContaining({ code: 'manifest-size' })
    );
    expect(() => parsePublicResearchManifest(new Uint8Array([255]))).toThrow(
      expect.objectContaining({ code: 'manifest-json' })
    );
  });
});
