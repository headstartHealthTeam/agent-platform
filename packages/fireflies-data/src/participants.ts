import { z } from 'zod';

const optionalText = z.string().nullish();
const participant = z.union([
  z.string(),
  z.object({
    email: optionalText,
    emailAddress: optionalText,
    name: optionalText,
    displayName: optionalText,
  }),
]);
const meetingSchema = z.object({
  participants: z.array(participant).nullish(),
  participantEmails: z.array(z.string()).nullish(),
});
export interface FirefliesParticipantIdentity {
  readonly email: string;
  readonly name: string;
}
export class FirefliesParticipantError extends Error {
  readonly code = 'INVALID_PARTICIPANT_METADATA';
  constructor() {
    super('Unsupported Fireflies participant metadata');
    this.name = 'FirefliesParticipantError';
  }
}
/** Vendor aliases only; no provider/client matching, domain exclusion or identity approval. */
export function firefliesParticipantIdentities(input: unknown): FirefliesParticipantIdentity[] {
  try {
    const meeting = meetingSchema.parse(input);
    return [
      ...(meeting.participants ?? []).map((value) =>
        typeof value === 'string'
          ? { email: value, name: '' }
          : {
              email: value.email ?? value.emailAddress ?? '',
              name: value.name ?? value.displayName ?? '',
            }
      ),
      ...(meeting.participantEmails ?? []).map((email) => ({ email, name: '' })),
    ];
  } catch {
    throw new FirefliesParticipantError();
  }
}
