const text = { type: 'string' };
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties)
): Record<string, unknown> => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const exact = {
  id: text,
  revision: text,
  digest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
};
const drive = {
  kind: { const: 'google-drive' },
  fileId: text,
  version: text,
  sourceMediaType: text,
};

/** Canonical runtime tool declaration; source access and parsing remain runtime capabilities. */
export const hostedDeliveryDefinition = {
  type: 'function',
  name: 'queue_credentialing_review_package',
  description:
    "Preflight complete package JSON and case binding, then queue exact files from this turn's /workspace/outputs. Repair validation errors before ending the turn. After acknowledgement finish the turn: backend then retains files and independently revalidates publication. Queued is not published or approved. Do not send bytes or URLs. Originals must precede same-subject conversions; omit optional generated analysis memos, not original evidence. Inspect saved delivery results through review context on a later turn.",
  parameters: object({
    expectedVersion: { type: 'integer', minimum: 0 },
    inputJson: text,
    proposalJson: text,
    files: {
      type: 'array',
      maxItems: 100,
      items: object({
        path: { type: 'string', pattern: '^/workspace/outputs/' },
        subject: { type: 'string', enum: ['provider', 'practice'] },
        manifest: object({
          ...exact,
          mediaType: text,
          origin: {
            anyOf: [
              object({
                kind: { const: 'salesforce' },
                linkedRecordId: text,
                contentDocumentId: text,
                contentVersionId: text,
              }),
              object({ ...drive, representation: { const: 'original' } }),
              object({
                ...drive,
                representation: { const: 'google-export' },
                exportMediaType: text,
              }),
              object({
                ...drive,
                representation: { const: 'google-docs-structure' },
                sourceMediaType: { const: 'application/vnd.google-apps.document' },
              }),
              object({
                kind: { const: 'runtime-derived' },
                sources: { type: 'array', minItems: 1, items: object(exact) },
                transformation: object({ id: text, revision: text }),
              }),
            ],
          },
        }),
      }),
    },
  }),
};
