import type { ConversationEvidenceEvent } from './conversation-interpretation.js';
import type { EvidenceDate } from './evidence.js';
import type { GateContext } from './gate-context.js';
import type { RosterCandidate } from './roster-matching.js';
import type { TextMatchIdentity } from './text-match.js';

export interface PortalMessage {
  readonly id?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
  readonly senderId?: string | null | undefined;
  readonly userId?: string | null | undefined;
  readonly authorId?: string | null | undefined;
  readonly content?: unknown;
}
export interface PortalChat {
  readonly [field: string]: unknown;
  readonly messageId?: string | null | undefined;
  readonly createdAt?: string | null | undefined;
  readonly channel?: string | null | undefined;
  readonly messages?: readonly PortalMessage[] | null | undefined;
  readonly opportunityId?: string | null | undefined;
  readonly salesforceOpportunityId?: string | null | undefined;
  readonly clientId?: string | null | undefined;
  readonly salesforceRecordId?: string | null | undefined;
  readonly clientName?: string | null | undefined;
  readonly providerName?: string | null | undefined;
  readonly provider?: unknown;
  readonly practiceName?: string | null | undefined;
  readonly matchQuality?: string | null | undefined;
  readonly proposedOpportunityId?: string | null | undefined;
}
interface PortalQuery {
  readonly mode?: string | null | undefined;
  readonly channel?: string | null | undefined;
  readonly providerName?: string | null | undefined;
}
interface PortalChatsEnvelope {
  readonly chats?: readonly PortalChat[] | null | undefined;
}
export interface PortalSearchRow extends PortalChatsEnvelope, PortalQuery {
  readonly blocked?: boolean | null | undefined;
  readonly searchedAt?: string | null | undefined;
  readonly requestedChannel?: string | null | undefined;
  readonly query?: PortalQuery | null | undefined;
  readonly responses?:
    | (PortalChatsEnvelope & {
        readonly query?: PortalQuery | null | undefined;
        readonly data?: PortalChatsEnvelope | null | undefined;
      })
    | null
    | undefined;
  readonly data?: PortalChatsEnvelope | null | undefined;
  readonly structuredContent?:
    { readonly data?: PortalChatsEnvelope | null | undefined } | null | undefined;
}
export type PortalRows = PortalSearchRow | readonly PortalRows[] | null | undefined;
export interface MergedPortalChat extends PortalChat {
  readonly channel: null;
  readonly returnedChannelLabels: readonly string[];
}
export interface MergedPortalRow {
  readonly searchedAt: string | null;
  readonly responses: { readonly chats: readonly MergedPortalChat[] };
  readonly portalChannelAttributionIgnored: true;
}
export type PortalRosterCandidate = RosterCandidate & {
  readonly nameVariants?: readonly string[] | null | undefined;
};
export type PortalProfile = TextMatchIdentity & {
  readonly nameVariants?: readonly string[] | null | undefined;
  readonly providerRoster?: readonly PortalRosterCandidate[];
};
export interface PortalEvidenceInput {
  readonly row: PortalRows;
  readonly profile: PortalProfile;
  readonly gate?: GateContext | null | undefined;
  readonly asOf: EvidenceDate;
}
export interface PortalEvidenceIdentity {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly provider: string | null | undefined;
  readonly practice: string | null | undefined;
  readonly matchQuality: string;
  readonly portalConversationId: string;
}
export type PortalEvidenceEvent = ConversationEvidenceEvent<PortalEvidenceIdentity>;
export interface PortalEvidenceUnit {
  readonly messages: readonly PortalMessage[];
  readonly anchor: PortalMessage | undefined;
  readonly quality: string;
  readonly targetSegments?: readonly string[];
}
