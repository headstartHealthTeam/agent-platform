import { sha256Json } from './json-fingerprint.js';

export interface PublicationPlanHashStage {
  readonly id: string;
  readonly dependsOn?: unknown;
  readonly terminal?: unknown;
  readonly alreadySatisfied?: unknown;
  readonly file?: unknown;
  readonly payloadHash?: unknown;
  readonly calls?: readonly { readonly file?: unknown; readonly payloadHash?: unknown }[] | null;
  readonly assertions?: readonly unknown[] | null;
}
/** Fingerprint the approved stage fields; extra operator metadata does not change the write plan. */
export function publicationPlanHash(
  stages: readonly PublicationPlanHashStage[] = [],
  finalAssertions: readonly unknown[] = []
): string {
  return sha256Json({
    stages: stages.map((stage) => ({
      id: stage.id,
      dependsOn: stage.dependsOn ?? null,
      terminal: Boolean(stage.terminal),
      alreadySatisfied: Boolean(stage.alreadySatisfied),
      file: stage.file ?? null,
      payloadHash: stage.payloadHash,
      calls: (stage.calls ?? []).map((call) => ({
        file: call.file,
        payloadHash: call.payloadHash,
      })),
      assertions: stage.assertions ?? [],
    })),
    finalAssertions,
  });
}
