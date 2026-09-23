import { z } from 'zod';

import { firefliesReadFailure } from './failure.js';

const timestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));
export const transcriptMetadataSchema = z.object({
  transcriptId: z.string().min(1),
  date: timestampSchema,
  title: z.string(),
  organizerEmail: z.string(),
  participants: z.array(z.string()),
  meetingAttendees: z.array(z.object({ email: z.string(), displayName: z.string() })),
  isLive: z.boolean(),
});
export type TranscriptMetadata = z.infer<typeof transcriptMetadataSchema>;
export const retrievalEndpointSchema = z.enum(['fireflies_fetch', 'fireflies_get_transcript']);
export interface NormalizedFirefliesBody {
  readonly record: TranscriptMetadata & {
    readonly complete: true;
    readonly fullTranscript: string;
    readonly transcriptEmpty: boolean;
    readonly retrievalEndpoint: z.infer<typeof retrievalEndpointSchema>;
    readonly retrievedAt: string;
  };
  readonly provenance: {
    readonly bodyDateString: string;
    readonly listingDateString: string;
    readonly timestampBinding: 'exact' | 'listing-milliseconds/body-whole-seconds';
    readonly sentenceStatus: 'explicit-empty' | 'transcript-text';
  };
}

export class FirefliesBodyError extends Error {
  constructor() {
    super('FIREFLIES_CONNECTOR_BODY_INVALID');
    this.name = 'FirefliesBodyError';
  }
}

function check(condition: boolean): asserts condition {
  if (!condition) throw new FirefliesBodyError();
}

export function transcriptMetadata(value: unknown): TranscriptMetadata {
  const parsed = transcriptMetadataSchema.safeParse(value);
  if (!parsed.success) throw new FirefliesBodyError();
  const metadata = parsed.data;
  return {
    ...metadata,
    date: new Date(metadata.date).toISOString(),
    participants: [...new Set(metadata.participants)].sort(),
    meetingAttendees: metadata.meetingAttendees.sort(
      (a, b) => a.email.localeCompare(b.email) || a.displayName.localeCompare(b.displayName)
    ),
  };
}

const captureSchema = z.object({
  retrievalEndpoint: retrievalEndpointSchema,
  retrievedAt: timestampSchema,
  response: z.object({
    isError: z
      .unknown()
      .optional()
      .refine((value) => value !== true),
    truncated: z
      .unknown()
      .optional()
      .refine((value) => value !== true),
    content: z.tuple([z.object({ type: z.literal('text'), text: z.string() })]),
  }),
});

function fields(raw: string): { field: (key: string) => string; sentences: string } {
  const start = raw.indexOf('\nSentences: ');
  const end = raw.indexOf('\nTitle: ', start + 1);
  check(start >= 0 && end > start);
  const headers = (raw.slice(0, start) + raw.slice(end))
    .split('\n')
    .map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  return {
    field: (key: string): string => {
      const prefix = `${key}: `;
      const matches = headers.filter((line) => line.startsWith(prefix));
      const value = matches[0];
      check(matches.length === 1 && value !== undefined);
      return value.slice(prefix.length);
    },
    sentences: raw.slice(start + '\nSentences: '.length, end),
  };
}

function emails(value: string, attendees = false): string[] {
  if (attendees && value === 'No meeting attendees') return [];
  return value
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function validateHeaders(field: (key: string) => string, metadata: TranscriptMetadata): void {
  check(
    field('Id') === metadata.transcriptId &&
      field('Title') === metadata.title &&
      field('Organizer Email') === metadata.organizerEmail &&
      field('Is Live') === 'false' &&
      !metadata.isLive
  );
  check(
    same(emails(field('Participants')), metadata.participants) &&
      same(
        emails(field('Meeting Attendees'), true),
        metadata.meetingAttendees.map((attendee) => attendee.email)
      )
  );
}

function timestampBinding(
  bodyDate: string,
  listingDate: string
): 'exact' | 'listing-milliseconds/body-whole-seconds' {
  if (bodyDate === listingDate) return 'exact';
  check(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(bodyDate) &&
      Date.parse(bodyDate) === Math.floor(Date.parse(listingDate) / 1000) * 1000
  );
  return 'listing-milliseconds/body-whole-seconds';
}

/** Validate an observed native text body against its listing; no run/cache policy. */
export function normalizeFirefliesConnectorBody(options: {
  readonly expected: unknown;
  readonly capture: unknown;
}): NormalizedFirefliesBody {
  const response = z.object({ response: z.unknown() }).safeParse(options.capture).data?.response;
  const failure = firefliesReadFailure(response);
  if (failure) throw failure;
  const parsed = captureSchema.safeParse(options.capture);
  if (!parsed.success) throw new FirefliesBodyError();
  const capture = parsed.data;
  const metadata = transcriptMetadata(options.expected);
  const { field, sentences } = fields(capture.response.content[0].text);
  validateHeaders(field, metadata);
  const bodyDateString = field('DateString');
  const binding = timestampBinding(bodyDateString, metadata.date);
  const fullTranscript = sentences === 'No sentences' ? '' : sentences;
  return {
    record: {
      ...metadata,
      complete: true,
      fullTranscript,
      transcriptEmpty: !fullTranscript.trim(),
      retrievalEndpoint: capture.retrievalEndpoint,
      retrievedAt: capture.retrievedAt,
    },
    provenance: {
      bodyDateString,
      listingDateString: metadata.date,
      timestampBinding: binding,
      sentenceStatus: sentences === 'No sentences' ? 'explicit-empty' : 'transcript-text',
    },
  };
}
