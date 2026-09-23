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
      kind: 'runtime-derived';
      sources: ExactEvidenceReference[];
      transformation: { id: string; revision: string };
    };
export interface RetainedEvidenceManifest extends ExactEvidenceReference {
  mediaType: string;
  origin: EvidenceOrigin;
}
