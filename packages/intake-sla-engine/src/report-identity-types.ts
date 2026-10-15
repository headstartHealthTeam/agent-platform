import type { CollectionSearchWindow } from './collection-search-window.js';
import type {
  IdentityProvider,
  ProviderIdentityCluster,
  ProviderRoleCluster,
} from './provider-identity-types.js';
import type {
  assessFirefliesIdentityCoverage,
  RoleFirefliesSearchPlan,
} from './provider-search.js';
import type { SearchPathways } from './search-pathway-types.js';
import type { StructuredCollection } from './structured-collection.js';

type Text = string | null | undefined;
export interface ReportFamilyContact {
  readonly id: Text;
  readonly name: Text;
  readonly email: Text;
  readonly phone: Text;
  readonly primary: boolean;
  readonly role?: Text;
}
export interface ReportProvider extends IdentityProvider {
  readonly role: 'Rendering' | 'IA' | 'TA';
  readonly id: Text;
  readonly name: Text;
  readonly email: Text;
  readonly phone: Text;
}
export interface ReportIdentityBase {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly slaId: Text;
  readonly stage: Text;
  readonly stageEntryDate: Text;
  readonly slaCreatedDate: string | null;
  readonly knownNameVariants: readonly string[];
  readonly clientAliases: readonly string[];
  readonly clientAliasRegistryVersion: string;
  readonly clientAliasRegistryMatchCount: number;
  readonly clientAliasEvidence: readonly unknown[];
  readonly searchVernacular: readonly string[];
  readonly practice: {
    readonly id: Text;
    readonly name: Text;
    readonly email: Text;
    readonly phone: Text;
  };
  readonly providers: readonly ReportProvider[];
  readonly currentCsm: { readonly name: Text; readonly email: string; readonly userId: string };
  readonly priorCsms: readonly string[];
  readonly familyContacts: readonly ReportFamilyContact[];
  readonly familyPhones: readonly string[];
  readonly authorizationNumbers: readonly string[];
  readonly payers: readonly string[];
  readonly rbtRequests: readonly {
    readonly id: string;
    readonly name: Text;
    readonly assignedRbt: Text;
    readonly startDate: Text;
  }[];
  readonly candidates: readonly { readonly id: Text; readonly name: Text; readonly status: Text }[];
  readonly stageHistory: StructuredCollection['opportunityHistory'];
}
export interface ReportProviderIdentity extends ReportIdentityBase {
  readonly providerRoles: readonly ProviderRoleCluster[];
  readonly providerIdentity: ProviderIdentityCluster;
}
export interface ReportRosterPeer {
  readonly opportunityId: string;
  readonly opportunityName: string;
  readonly knownNameVariants: readonly string[];
  readonly clientAliases: readonly string[];
  readonly stage: Text;
  readonly practiceName: Text;
}
export interface ReportIdentityProfile extends ReportProviderIdentity {
  readonly providerRosterScope: 'Provider' | 'Practice';
  readonly providerRoster: readonly ReportRosterPeer[];
  readonly firefliesSearchPlans: readonly RoleFirefliesSearchPlan[];
  readonly firefliesIdentityCoverage: ReturnType<typeof assessFirefliesIdentityCoverage>;
  readonly searchWindow: CollectionSearchWindow;
  readonly searchPathways: SearchPathways;
}
