import {
  interpretationBindingForPacket,
  interpretationValidationBindingForPacket,
} from './ai-interpretation.js';
import { firefliesPacketInput } from './fireflies-evidence-common.js';
import type {
  FirefliesEvidenceSegment,
  FirefliesPrecomputed,
  FirefliesSuppliedInterpretation,
} from './fireflies-evidence-types.js';
import { interpretationBindingDiff } from './interpretation-binding.js';
import { buildTranscriptInterpretationPacket } from './interpretation-packet.js';

export function firefliesBindingDifferences<T extends FirefliesSuppliedInterpretation>(
  context: FirefliesEvidenceSegment,
  precomputed: FirefliesPrecomputed<T>,
  supplied: T | undefined
): string[] {
  const packet = buildTranscriptInterpretationPacket(firefliesPacketInput(context));
  if (!supplied) return ['binding'];
  if (precomputed.currentRunPrecomputed === true) {
    if (
      precomputed.apiEnabled !== false ||
      precomputed.executionProvenance?.kind !== 'codex-current-run' ||
      precomputed.executionProvenance.api !== false ||
      !precomputed.engineVersion
    )
      return ['precomputed-provenance'];
    const expected = interpretationValidationBindingForPacket({
      packet,
      engineVersion: precomputed.engineVersion,
    });
    return interpretationBindingDiff(expected, supplied.validationBinding);
  }
  if (
    precomputed.apiEnabled !== true ||
    !precomputed.model ||
    !precomputed.provider ||
    !precomputed.engineVersion ||
    precomputed.store !== false
  )
    return ['api-execution-contract'];
  const expected = interpretationBindingForPacket({
    packet,
    model: precomputed.model,
    provider: precomputed.provider,
    engineVersion: precomputed.engineVersion,
  });
  return interpretationBindingDiff(expected, supplied.binding);
}
export function firefliesUnrecoveredFailures(
  failures: readonly string[],
  events: readonly { readonly substantive: boolean; readonly sourceRecordId: string }[]
): string[] {
  const recovered = new Set(
    events
      .filter((event) => event.substantive)
      .map((event) => event.sourceRecordId)
      .filter(Boolean)
  );
  return failures.filter(
    (failure) =>
      !/: supplied findings lacked transcript support$/i.test(failure) ||
      !recovered.has(
        failure.replace(
          /: (?:no precomputed interpretation supplied|precomputed interpretation binding mismatch.*|supplied findings lacked transcript support).*$/i,
          ''
        )
      )
  );
}
