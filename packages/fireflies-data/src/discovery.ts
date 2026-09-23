import { z } from 'zod';

import { transcriptMetadata } from './transcript.js';
import type { TranscriptMetadata } from './transcript.js';

export type FirefliesDiscoveryFailure =
  'INVALID_DISCOVERY_IDENTITY' | 'INCOMPLETE_DISCOVERY' | 'INVALID_DISCOVERY_METADATA';
export class FirefliesDiscoveryError extends Error {
  readonly code: FirefliesDiscoveryFailure;
  constructor(code: FirefliesDiscoveryFailure) {
    super(code);
    this.name = 'FirefliesDiscoveryError';
    this.code = code;
  }
}
const email = z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
const rawMeeting = z.looseObject({
  organizerEmail: z.union([z.literal(''), email]),
  participants: z.array(email.nullable()),
  meetingAttendees: z.array(z.looseObject({ email, displayName: z.string().nullish() })),
});
const discoveryEnvelope = z.looseObject({
  pages: z.array(z.looseObject({ meetings: z.array(rawMeeting) })),
});
export interface DiscoveryIdentityCounts {
  readonly meetings: number;
  readonly nullParticipantsRemoved: number;
  readonly optionalDisplayNamesDefaulted: number;
}
export interface FirefliesDiscoveryIdentityMeeting {
  readonly organizerEmail: string;
  readonly participants: readonly string[];
  readonly meetingAttendees: readonly {
    readonly email: string;
    readonly displayName: string;
    readonly [key: string]: unknown;
  }[];
  readonly [key: string]: unknown;
}
export interface FirefliesDiscoveryIdentityEnvelope {
  readonly pages: readonly {
    readonly meetings: readonly FirefliesDiscoveryIdentityMeeting[];
    readonly [key: string]: unknown;
  }[];
  readonly [key: string]: unknown;
}
type MutableCounts = { -readonly [K in keyof DiscoveryIdentityCounts]: DiscoveryIdentityCounts[K] };

function normalizeMeeting(
  meeting: z.infer<typeof rawMeeting>,
  counts: MutableCounts
): FirefliesDiscoveryIdentityMeeting {
  const participants = meeting.participants.filter((participant): participant is string => {
    if (participant === null) {
      counts.nullParticipantsRemoved++;
      return false;
    }
    return true;
  });
  const meetingAttendees = meeting.meetingAttendees.map((attendee) => {
    if (attendee.displayName === undefined || attendee.displayName === null)
      counts.optionalDisplayNamesDefaulted++;
    return { ...attendee, displayName: attendee.displayName ?? '' };
  });
  counts.meetings++;
  return { ...meeting, participants, meetingAttendees };
}

/** Normalize only documented optional identity omissions; retain all other caller evidence. */
export function normalizeFirefliesDiscoveryIdentities(input: unknown): {
  readonly discovery: FirefliesDiscoveryIdentityEnvelope;
  readonly counts: DiscoveryIdentityCounts;
} {
  try {
    const parsed = discoveryEnvelope.parse(structuredClone(input));
    const counts = { meetings: 0, nullParticipantsRemoved: 0, optionalDisplayNamesDefaulted: 0 };
    const discovery = {
      ...parsed,
      pages: parsed.pages.map((page) => ({
        ...page,
        meetings: page.meetings.map((meeting) => normalizeMeeting(meeting, counts)),
      })),
    };
    return { discovery, counts };
  } catch {
    // Clone/getter/schema errors can contain source contents. Never forward their message/cause.
    throw new FirefliesDiscoveryError('INVALID_DISCOVERY_IDENTITY');
  }
}

const pageSchema = z.object({
  status: z.literal('Complete'),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  meetings: z.array(z.unknown()),
});
const windowSchema = z
  .object({
    fromDate: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    toDate: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    limit: z.number().int().positive(),
  })
  .refine((value) => Date.parse(value.fromDate) <= Date.parse(value.toDate));
export type FirefliesDiscoveryWindow = z.infer<typeof windowSchema>;

function validatePage(
  page: z.infer<typeof pageSchema>,
  index: number,
  lastIndex: number,
  limit: number
): void {
  if (page.offset !== index * limit || page.meetings.length > limit)
    throw new FirefliesDiscoveryError('INCOMPLETE_DISCOVERY');
  const terminal = index === lastIndex;
  if (
    terminal
      ? page.nextOffset !== null || page.meetings.length >= limit
      : page.nextOffset !== (index + 1) * limit || page.meetings.length !== limit
  )
    throw new FirefliesDiscoveryError('INCOMPLETE_DISCOVERY');
}

function meetingInWindow(record: unknown, fromDate: string, toDate: string): TranscriptMetadata {
  let meeting: TranscriptMetadata;
  try {
    meeting = transcriptMetadata(record);
  } catch {
    throw new FirefliesDiscoveryError('INVALID_DISCOVERY_METADATA');
  }
  if (
    Date.parse(meeting.date) < Date.parse(fromDate) ||
    Date.parse(meeting.date) > Date.parse(toDate)
  )
    throw new FirefliesDiscoveryError('INVALID_DISCOVERY_METADATA');
  return meeting;
}

function discoveryPages(input: unknown, window: FirefliesDiscoveryWindow): TranscriptMetadata[] {
  const pages = z.array(pageSchema).min(1).safeParse(input);
  const bounds = windowSchema.safeParse(window);
  if (!pages.success || !bounds.success) throw new FirefliesDiscoveryError('INCOMPLETE_DISCOVERY');
  const { limit, fromDate, toDate } = bounds.data;
  const meetings = new Map<string, TranscriptMetadata>();
  for (const [index, page] of pages.data.entries()) {
    validatePage(page, index, pages.data.length - 1, limit);
    for (const record of page.meetings) {
      const meeting = meetingInWindow(record, fromDate, toDate);
      const prior = meetings.get(meeting.transcriptId);
      if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(meeting))
        throw new FirefliesDiscoveryError('INVALID_DISCOVERY_METADATA');
      meetings.set(meeting.transcriptId, meeting);
    }
  }
  return [...meetings.values()];
}

/** Verify an offset page chain, not a workflow run/cutoff, cache decision or collection scope. */
export function completeFirefliesDiscoveryPages(
  input: unknown,
  window: FirefliesDiscoveryWindow
): TranscriptMetadata[] {
  try {
    return discoveryPages(input, window);
  } catch (error) {
    if (error instanceof FirefliesDiscoveryError) throw error;
    throw new FirefliesDiscoveryError('INCOMPLETE_DISCOVERY');
  }
}
