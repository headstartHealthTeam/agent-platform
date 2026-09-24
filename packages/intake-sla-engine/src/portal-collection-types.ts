import type { ConversationProfile, ConversationProvider } from './conversation-match-types.js';
import type { PortalChat } from './portal-evidence-types.js';
import type { IdentityValue } from './provider-identity-types.js';

export interface PortalCollectionProvider extends ConversationProvider {
  readonly portalProviderIds?: readonly IdentityValue[] | null | undefined;
}
export interface PortalCollectionProfile extends ConversationProfile {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly providerRoles?: readonly PortalCollectionProvider[] | null | undefined;
  readonly providerRoster?: readonly ConversationProfile[] | undefined;
  readonly searchWindow?: {
    readonly fromDate?: string | null;
    readonly toDate?: string | null;
  } | null;
}
export interface PortalCollectionRequest {
  requestKey: string;
  requestType?: string;
  opportunityIds?: string[];
  opportunityNames?: string[];
  clientName?: string;
  clientNames?: string[];
  providerName?: string;
  providerUserId?: string;
  roster?: ConversationProfile[];
  createdFrom?: string | null | undefined;
  createdTo?: string | null | undefined;
  limit?: number;
  paginate?: boolean;
}
export interface PortalCollectionPlan {
  readonly version?: string;
  readonly opportunityCount?: number;
  readonly providerRequestCount?: number;
  readonly clientRequestCount?: number;
  readonly sentinelRequestKey?: string | null;
  readonly requests?: readonly PortalCollectionRequest[];
}
export interface BuiltPortalCollectionPlan extends PortalCollectionPlan {
  readonly version: string;
  readonly opportunityCount: number;
  readonly providerRequestCount: number;
  readonly clientRequestCount: number;
  readonly sentinelRequestKey: string | null;
  readonly requests: PortalCollectionRequest[];
}
export interface PortalCollectionChat extends PortalChat {
  readonly id?: string | null | undefined;
  readonly providerId?: string | null | undefined;
  readonly clientOpportunityId?: string | null | undefined;
  readonly requestKey?: string | null | undefined;
}
export interface PortalInventoryExecution {
  readonly [field: string]: unknown;
  readonly requestKey: string;
  readonly status?: string;
  readonly paginationComplete?: boolean | null;
  readonly pages?: unknown;
  readonly chats?: readonly PortalCollectionChat[] | null;
}
export interface BoundPortalExecution extends PortalInventoryExecution {
  readonly chats: (PortalCollectionChat & { requestKey: string })[];
}
export interface PortalInventoryInput {
  readonly plan?: PortalCollectionPlan | null | undefined;
  readonly inventory?: readonly PortalInventoryExecution[];
}
export interface PortalCollectionBaseRow {
  readonly opportunityId?: string | null;
  readonly opportunityName?: string | null;
  readonly chats?: readonly PortalCollectionChat[] | null;
  readonly responses?: { readonly chats?: readonly PortalCollectionChat[] | null } | null;
}
export interface PortalMaterializationInput extends PortalInventoryInput {
  readonly profiles?: readonly PortalCollectionProfile[];
  readonly baseRows?: readonly PortalCollectionBaseRow[];
  readonly searchedAt?: string;
  readonly sourceCutoff?: string | null;
}
export interface EnrichedPortalChat extends PortalCollectionChat {
  readonly matchQuality: string;
  readonly matchScore: number;
  readonly matchReasons: undefined;
  readonly proposedOpportunityId: string | null;
}
export interface MaterializedPortalRow {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly searchedAt: string | undefined;
  readonly searched: boolean;
  readonly blocked: boolean;
  readonly error: string;
  readonly chats: EnrichedPortalChat[];
  readonly weakMatches: EnrichedPortalChat[];
  readonly recordsRetrieved: number;
  readonly recordsScanned: number;
  readonly searchCoverage: {
    readonly status: string;
    readonly plannedRequests: number;
    readonly completedRequests: number;
    readonly pages: number;
    readonly paginationComplete: boolean;
    readonly sentinelRequestKey: string | null;
  };
}
