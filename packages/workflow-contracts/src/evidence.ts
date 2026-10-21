/** Source-neutral evidence handoff. Bytes travel through trusted runtime/application transport,
 * never a model-supplied backend filesystem path, URL, or summary in place of a document.
 */
export interface ExactEvidenceReference {
  id: string;
  revision: string;
  digest: string;
}
export type EvidenceOrigin =
  | {
      /** Receipt attests operator supply, not document authenticity or factual correctness. */
      kind: 'operator-upload';
      attachmentId: string;
    }
  | {
      kind: 'headstart-knowledge';
      itemId: string;
      revision: string;
    }
  | {
      kind: 'salesforce';
      linkedRecordId: string;
      contentDocumentId: string;
      contentVersionId: string;
    }
  | {
      kind: 'google-drive';
      fileId: string;
      version: string;
      representation: 'original';
      sourceMediaType: string;
    }
  | {
      kind: 'google-drive';
      fileId: string;
      version: string;
      representation: 'google-export';
      sourceMediaType: string;
      exportMediaType: string;
    }
  | {
      kind: 'google-drive';
      fileId: string;
      version: string;
      representation: 'google-docs-structure';
      sourceMediaType: 'application/vnd.google-apps.document';
    }
  | {
      /** Full public original, with runtime-observed provenance, not source-system verification. */
      kind: 'public-web';
      url: string;
      retrievedAt: string;
      statedDate: string | null;
    }
  | {
      kind: 'runtime-derived';
      sources: [ExactEvidenceReference, ...ExactEvidenceReference[]];
      transformation: { id: string; revision: string };
    };
export interface RetainedEvidenceManifest extends ExactEvidenceReference {
  mediaType: string;
  origin: EvidenceOrigin;
}

/** Generated review aids are not source evidence, conversions, or payer-submittable attachments. */
export interface GeneratedReviewDocument extends ExactEvidenceReference {
  title: string;
  filename: string;
  mediaType: string;
  purpose: 'review-checklist' | 'preparation-package' | 'supporting-report';
  sources: ExactEvidenceReference[];
}
export interface GeneratedDocumentOrigin {
  kind: 'runtime-generated';
  /** Exact snapshot that was used to generate this review aid. */
  inputFingerprint: string;
  title: string;
  filename: string;
  purpose: GeneratedReviewDocument['purpose'];
  sources: ExactEvidenceReference[];
}
export type RetainedDocumentOrigin = EvidenceOrigin | GeneratedDocumentOrigin;
export interface RetainedDocumentManifest extends ExactEvidenceReference {
  mediaType: string;
  origin: RetainedDocumentOrigin;
}
