import {
  firefliesBindingDifferences,
  firefliesUnrecoveredFailures,
} from './fireflies-evidence-binding.js';
import {
  firefliesConversationResult,
  firefliesFallback,
  firefliesFindingEvent,
} from './fireflies-evidence-common.js';
import type {
  FirefliesEvidenceResult,
  FirefliesEvidenceSegment,
  FirefliesPrecomputed,
  FirefliesPrecomputedInput,
  FirefliesSuppliedInterpretation,
} from './fireflies-evidence-types.js';
import { validateTranscriptFindings } from './interpretation-findings.js';
import type { MeetingMatchAssessment } from './meeting-segment-types.js';
import { discoverFirefliesMeeting } from './meeting-segmentation.js';

export type AcceptedFirefliesInterpretation<T> = T & {
  readonly sourceRecordId: string;
  readonly acceptedFindings: number;
};
function admitSegment<T extends FirefliesSuppliedInterpretation>(
  context: FirefliesEvidenceSegment,
  precomputed: FirefliesPrecomputed<T>,
  supplied: T | undefined,
  result: FirefliesEvidenceResult<AcceptedFirefliesInterpretation<T>>
): void {
  const differences = firefliesBindingDifferences(context, precomputed, supplied);
  const bound = supplied !== undefined && differences.length === 0;
  const findings = bound
    ? validateTranscriptFindings({
        ...(supplied.findings === undefined ? {} : { findings: supplied.findings }),
        segment: context.segment.text,
        inputMatchQuality: context.segment.quality,
        eventDate: context.meeting.date,
        expectedOpportunityId: context.input.profile.opportunityId,
      })
    : [];
  const { sourceRecordId } = context;
  if (!supplied) result.failures.push(`${sourceRecordId}: no precomputed interpretation supplied`);
  else if (!bound)
    result.failures.push(
      `${sourceRecordId}: precomputed interpretation binding mismatch (${differences.join(', ')})`
    );
  else {
    result.interpretations.push({ ...supplied, sourceRecordId, acceptedFindings: findings.length });
    if ((supplied.findings ?? []).some((finding) => finding.substantive) && !findings.length)
      result.failures.push(`${sourceRecordId}: supplied findings lacked transcript support`);
  }
  result.events.push(...findings.map((finding) => firefliesFindingEvent(context, finding)));
  if (context.input.fallbackToDeterministic && (!bound || !findings.length))
    result.events.push(...firefliesFallback(context));
}
export function adaptFirefliesWithPrecomputedAI<
  T extends FirefliesSuppliedInterpretation = FirefliesSuppliedInterpretation,
>(
  input: FirefliesPrecomputedInput<T>
): FirefliesEvidenceResult<AcceptedFirefliesInterpretation<T>> {
  const { row, profile, competingProfiles, precomputed = {} } = input;
  const result: FirefliesEvidenceResult<AcceptedFirefliesInterpretation<T>> = {
    events: [],
    interpretations: [],
    failures: [],
    usage: precomputed.usage ?? { inputTokens: 0, outputTokens: 0 },
  };
  if (!row || row.blocked) return { ...result, failures: row?.error ? [row.error] : [] };
  const supplied = new Map(
    (precomputed.interpretations ?? []).map((interpretation) => [
      interpretation.sourceRecordId,
      interpretation,
    ])
  );
  const matches: MeetingMatchAssessment[] = [];
  let scanned = 0;
  for (const meeting of row.meetings ?? []) {
    const discovery = discoverFirefliesMeeting({ meeting, profile, competingProfiles });
    scanned += discovery.sentencesScanned;
    matches.push(...discovery.matches);
    for (const [index, segment] of discovery.segments.entries()) {
      const sourceRecordId = `${String(meeting.id)}:${String(index + 1)}`;
      admitSegment(
        { input, meeting, segment, sourceRecordId },
        precomputed,
        supplied.get(sourceRecordId),
        result
      );
    }
  }
  const unrecoveredFailures = firefliesUnrecoveredFailures(result.failures, result.events);
  return {
    ...result,
    unrecoveredFailures,
    conversationSearchResult: firefliesConversationResult(
      input,
      row,
      result.events,
      matches,
      scanned,
      unrecoveredFailures
    ),
  };
}
