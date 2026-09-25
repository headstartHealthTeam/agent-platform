import { assessTextMatch } from './text-match.js';
import type { TextMatch, TextMatchInput } from './text-match.js';

export interface MatchSentence {
  readonly id?: string | number | null;
  readonly text: string;
}
export interface TranscriptSegment<T extends MatchSentence> {
  start: number;
  end: number;
  anchorIndex: number;
  quality: TextMatch['quality'];
  sentences: T[];
}
export interface SegmentTranscriptInput<T extends MatchSentence> extends Omit<
  TextMatchInput,
  'text'
> {
  readonly sentences: readonly T[];
  readonly radius?: number;
}
function dedupeSegments<T extends MatchSentence>(
  segments: readonly TranscriptSegment<T>[]
): TranscriptSegment<T>[] {
  const output: TranscriptSegment<T>[] = [];
  for (const segment of segments) {
    const previous = output.at(-1);
    if (previous !== undefined && segment.start <= previous.end) {
      previous.end = Math.max(previous.end, segment.end);
      previous.sentences = [...previous.sentences, ...segment.sentences].filter(
        (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index
      );
      if (segment.quality === 'Direct') previous.quality = 'Direct';
    } else output.push({ ...segment });
  }
  return output;
}
export function segmentTranscript<T extends MatchSentence>(
  input: SegmentTranscriptInput<T>
): TranscriptSegment<T>[] {
  const { sentences, radius = 6, ...matchInput } = input;
  const segments: TranscriptSegment<T>[] = [];
  for (const [index, sentence] of sentences.entries()) {
    const match = assessTextMatch({ ...matchInput, text: sentence.text });
    if (!['Direct', 'Likely'].includes(match.quality)) continue;
    const start = Math.max(0, index - radius);
    const end = Math.min(sentences.length, index + radius + 1);
    const context = sentences.slice(start, end);
    const contextMatch = assessTextMatch({
      ...matchInput,
      text: context.map((item) => item.text).join(' '),
    });
    segments.push({
      start,
      end,
      anchorIndex: index,
      quality: contextMatch.quality,
      sentences: context,
    });
  }
  return dedupeSegments(segments);
}
