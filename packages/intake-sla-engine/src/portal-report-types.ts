import type { PortalChat, PortalMessage } from './portal-evidence-types.js';

export interface PortalReportMessage extends PortalMessage {
  readonly isPatientSender?: unknown;
}
export interface PortalReportChat extends PortalChat {
  readonly id?: string | null | undefined;
  readonly content?: unknown;
  readonly latestMessagePreview?: unknown;
  readonly patientSender?: unknown;
  readonly messages?: readonly PortalReportMessage[] | null | undefined;
}
interface PortalReportEnvelope {
  readonly chats?: readonly PortalReportChat[] | null | undefined;
  readonly data?: { readonly chats?: readonly PortalReportChat[] | null | undefined } | null;
  readonly structuredContent?: {
    readonly data?: { readonly chats?: readonly PortalReportChat[] | null | undefined } | null;
  } | null;
}
export type PortalReportResponses =
  PortalReportEnvelope | readonly PortalReportResponses[] | null | undefined;
export interface PortalReportInput {
  readonly opportunity?: { readonly StageName?: string | null } | null;
  readonly sla?: { readonly Stage__c?: string | null } | null;
  readonly responses?: PortalReportResponses;
}
export interface PortalReportSummary {
  readonly result: string;
  readonly quality: string;
  readonly promotableText: string;
  readonly checked: boolean;
  readonly messageCount: number;
  readonly substantiveCount: number;
  readonly actionableCount: number;
  readonly latestSubstantiveAt?: string;
  readonly latestSubstantiveText?: string;
  readonly latestRelevantAt?: string;
  readonly latestRelevantText?: string;
  readonly channelAttributionReliable: boolean;
  readonly gap: string;
}
export interface ParsedPortalReport extends PortalReportSummary {
  readonly latestSubstantiveAt: string;
  readonly latestSubstantiveText: string;
  readonly latestRelevantAt: string;
  readonly latestRelevantText: string;
}
export interface PortalReportNormalizedMessage {
  readonly id: string;
  readonly channel: string;
  readonly provider: unknown;
  readonly patientSender: boolean;
  readonly date: string;
  readonly content: string;
}
export interface PortalReportDedupedMessage extends PortalReportNormalizedMessage {
  readonly channelConflict: boolean;
}
