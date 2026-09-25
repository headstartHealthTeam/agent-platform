import type { ConversationEvidenceEvent } from './conversation-interpretation.js';
import type { EvidenceDate } from './evidence.js';
import type { GateContext } from './gate-context.js';
import type { IdentityProfile } from './identity-profile.js';

export type SlackEvidenceProfile = Pick<IdentityProfile, 'opportunityId' | 'opportunityName'> &
  Partial<
    Pick<IdentityProfile, 'providerNames' | 'providerEmails' | 'practiceAliases' | 'providerRoster'>
  > & {
    readonly cohortClientNames?: readonly string[] | null | undefined;
  };
export interface SlackEvidenceRecord {
  readonly text?: string | null | undefined;
  readonly time?: string | null | undefined;
  readonly threadText?: string | null | undefined;
  readonly messageTs?: string | null | undefined;
  readonly channelId?: string | null | undefined;
  readonly channelName?: unknown;
  readonly channel?: string | { readonly name?: unknown } | null | undefined;
  readonly from?: unknown;
  readonly author?: unknown;
  readonly bot_profile?: { readonly name?: unknown } | null | undefined;
  readonly username?: unknown;
  readonly user_profile?:
    { readonly real_name?: unknown; readonly display_name?: unknown } | null | undefined;
}
export interface SlackEvidenceRow {
  readonly blocked?: boolean | null | undefined;
  readonly records?: readonly (SlackEvidenceRecord | null | undefined)[] | null | undefined;
  readonly messages?: readonly { readonly text?: unknown }[] | null | undefined;
  readonly searches?:
    | readonly {
        readonly pages?:
          readonly { readonly resultPreview?: string | null | undefined }[] | null | undefined;
      }[]
    | null
    | undefined;
}
export interface SlackEvidenceInput {
  readonly row: SlackEvidenceRow | null | undefined;
  readonly profile: SlackEvidenceProfile;
  readonly gate?: GateContext | null | undefined;
  readonly asOf: EvidenceDate;
}
export interface SlackSegmentMatch {
  readonly index?: number;
  readonly quality: 'Direct' | 'Likely' | 'Weak';
  readonly assumedIdentityMatch?: boolean;
  readonly assumedIdentityNote?: string;
  readonly matchedAs?: string;
  readonly score?: number;
}
export interface SlackTargetSegment extends SlackSegmentMatch {
  readonly text: string;
}
export interface SlackEvidenceIdentity {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly channel: string;
  readonly author: string;
  readonly assumedIdentityMatch: boolean;
  readonly assumedIdentityNote: string;
  readonly matchedAs: string;
  readonly matchScore: number | null;
}
export type SlackEvidenceEvent = ConversationEvidenceEvent<SlackEvidenceIdentity>;
export interface SlackSegmentInput extends Omit<SlackEvidenceInput, 'row'> {
  readonly rawValue: string;
  readonly sourceRecordId: string;
  readonly eventDate: string | null;
  readonly channel: string;
  readonly author: string;
  readonly threadScoped?: boolean;
}
