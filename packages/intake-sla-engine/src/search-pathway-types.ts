export interface SearchPathwayProvider {
  readonly name?: string | null | undefined;
  readonly primaryName?: string | null | undefined;
  readonly email?: unknown;
  readonly primaryEmail?: unknown;
  readonly phone?: unknown;
  readonly names?: readonly unknown[] | null | undefined;
  readonly emails?: readonly unknown[] | null | undefined;
  readonly phones?: readonly unknown[] | null | undefined;
  readonly practiceAliases?: readonly unknown[] | null | undefined;
  readonly meetingAliases?: readonly unknown[] | null | undefined;
}
export interface SearchPathwayIdentity {
  readonly opportunityId?: string | null | undefined;
  readonly opportunityName?: string | null | undefined;
  readonly stage?: string | null | undefined;
  readonly knownNameVariants?: readonly unknown[] | null | undefined;
  readonly providerRoles?: readonly SearchPathwayProvider[] | null | undefined;
  readonly providers?: readonly SearchPathwayProvider[] | null | undefined;
  readonly practice?: unknown;
  readonly currentCsm?: unknown;
  readonly priorCsms?: readonly unknown[] | null | undefined;
  readonly authorizationNumbers?: readonly unknown[] | null | undefined;
  readonly payers?: readonly unknown[] | null | undefined;
  readonly familyPhones?: readonly unknown[] | null | undefined;
  readonly searchVernacular?: readonly unknown[] | null | undefined;
  readonly rbtRequests?:
    readonly { readonly name?: unknown; readonly assignedRbt?: unknown }[] | null | undefined;
  readonly candidates?: readonly { readonly name?: unknown }[] | null | undefined;
  readonly searchPathways?: SearchPathways | null | undefined;
}
export interface SearchPathways {
  readonly directIdentifiers: {
    readonly opportunityId: string;
    readonly fullNameVariants: string[];
    readonly authorizationNumbers: string[];
    readonly familyPhones: string[];
  };
  readonly meetingRetrieval: {
    readonly providerNames: string[];
    readonly providerEmails: string[];
    readonly practice: string[];
    readonly currentAndPriorCsms: string[];
  };
  readonly transcriptMatching: {
    readonly nameVariants: string[];
    readonly providerAnchors: string[];
    readonly csmAnchors: string[];
    readonly authorizationAnchors: string[];
    readonly staffingAnchors: string[];
    readonly vernacular: string[];
  };
  readonly queryPlan: { tier: string; label: string; terms: string[] }[];
}
export interface PathwayMatchInput {
  readonly text: string;
  readonly metadata?: string;
  readonly opportunityId?: string | null | undefined;
  readonly linkedOpportunityId?: string | null | undefined;
  readonly identity?: SearchPathwayIdentity;
}
export interface PathwayConversationMatch {
  readonly matched: boolean;
  readonly quality: 'Direct' | 'Likely' | 'Weak';
  readonly score: number;
  readonly reasons: string[];
}
