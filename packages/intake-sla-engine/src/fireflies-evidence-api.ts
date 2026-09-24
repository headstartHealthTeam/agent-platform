import { interpretTranscriptSegmentWithAI } from './ai-interpretation.js';
import { EVIDENCE_ENGINE_VERSION } from './engine-version.js';
import {
  firefliesConversationResult,
  firefliesFallback,
  firefliesFindingEvent,
  firefliesPacketInput,
} from './fireflies-evidence-common.js';
import type {
  FirefliesApiInput,
  FirefliesApiInterpretation,
  FirefliesEvidenceResult,
  FirefliesEvidenceSegment,
} from './fireflies-evidence-types.js';
import { APPROVED_INTERPRETER_PROVIDER } from './interpretation-binding.js';
import type { MeetingMatchAssessment } from './meeting-segment-types.js';
import { discoverFirefliesMeeting } from './meeting-segmentation.js';

function tokenCounts(value: unknown): { inputTokens: number; outputTokens: number } {
  const snakeInput =
    value !== null && typeof value === 'object' && 'input_tokens' in value
      ? value.input_tokens
      : undefined;
  const input =
    value !== null && typeof value === 'object' && 'inputTokens' in value
      ? value.inputTokens
      : undefined;
  const snakeOutput =
    value !== null && typeof value === 'object' && 'output_tokens' in value
      ? value.output_tokens
      : undefined;
  const output =
    value !== null && typeof value === 'object' && 'outputTokens' in value
      ? value.outputTokens
      : undefined;
  return {
    inputTokens: Number(snakeInput ?? input ?? 0),
    outputTokens: Number(snakeOutput ?? output ?? 0),
  };
}
function failureMessage(error: unknown): unknown {
  if (error === null) throw new TypeError("Cannot read properties of null (reading 'message')");
  if (error === undefined)
    throw new TypeError("Cannot read properties of undefined (reading 'message')");
  return (typeof error === 'object' || typeof error === 'function') && 'message' in error
    ? error.message
    : undefined;
}
async function interpretSegment(
  input: FirefliesApiInput,
  context: FirefliesEvidenceSegment,
  result: FirefliesEvidenceResult<
    FirefliesApiInterpretation,
    { inputTokens: number; outputTokens: number }
  >
): Promise<void> {
  try {
    const interpretation = await interpretTranscriptSegmentWithAI({
      ...firefliesPacketInput(context),
      ...(input.client === undefined ? {} : { client: input.client }),
      model: input.model,
      provider: input.provider ?? APPROVED_INTERPRETER_PROVIDER,
      engineVersion: input.engineVersion ?? EVIDENCE_ENGINE_VERSION,
    });
    result.interpretations.push({
      meetingId: context.meeting.id,
      sourceRecordId: context.sourceRecordId,
      ...interpretation,
    });
    const usage = tokenCounts(interpretation.usage);
    result.usage.inputTokens += usage.inputTokens;
    result.usage.outputTokens += usage.outputTokens;
    result.events.push(
      ...interpretation.findings.map((finding) => firefliesFindingEvent(context, finding))
    );
  } catch (error) {
    result.failures.push(`${context.sourceRecordId}: ${String(failureMessage(error))}`);
    if (input.fallbackToDeterministic) result.events.push(...firefliesFallback(context));
  }
}
export async function adaptFirefliesWithAI(
  input: FirefliesApiInput
): Promise<
  FirefliesEvidenceResult<FirefliesApiInterpretation, { inputTokens: number; outputTokens: number }>
> {
  const { row, profile, competingProfiles } = input;
  const result: FirefliesEvidenceResult<
    FirefliesApiInterpretation,
    { inputTokens: number; outputTokens: number }
  > = {
    events: [],
    interpretations: [],
    failures: [],
    usage: { inputTokens: 0, outputTokens: 0 },
  };
  if (!row || row.blocked) return { ...result, failures: row?.error ? [row.error] : [] };
  const matches: MeetingMatchAssessment[] = [];
  let scanned = 0;
  for (const meeting of row.meetings ?? []) {
    const discovery = discoverFirefliesMeeting({ meeting, profile, competingProfiles });
    scanned += discovery.sentencesScanned;
    matches.push(...discovery.matches);
    for (const [index, segment] of discovery.segments.entries())
      await interpretSegment(
        input,
        { input, meeting, segment, sourceRecordId: `${String(meeting.id)}:${String(index + 1)}` },
        result
      );
  }
  return {
    ...result,
    conversationSearchResult: firefliesConversationResult(
      input,
      row,
      result.events,
      matches,
      scanned,
      result.failures
    ),
  };
}
