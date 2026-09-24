import { clientIdentityAliasesFor } from './client-identity.js';
import { reportClean, reportPreferred, reportText } from './report-display-values.js';
import type {
  ReportFamilyContact,
  ReportIdentityBase,
  ReportProvider,
} from './report-identity-types.js';
import { normalizeRosterValue } from './roster-matching.js';
import { buildNameVariants, stageSearchVernacular } from './search-pathway-values.js';
import { resolveStageEntryDate } from './stage-entry.js';
import type { StructuredCollection } from './structured-collection.js';

type Opportunity = StructuredCollection['opportunities'][number];
export function identityStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
function providersFor(opp: Opportunity): ReportProvider[] {
  return (
    [
      { role: 'Rendering', id: opp.Rendering_Provider__c, source: opp.Rendering_Provider__r },
      { role: 'IA', id: opp.IA_Rendering_Provider__c, source: opp.IA_Rendering_Provider__r },
      { role: 'TA', id: opp.TA_Rendering_Provider__c, source: opp.TA_Rendering_Provider__r },
    ] as const
  )
    .map(({ role, id, source }): ReportProvider => ({
      role,
      id,
      name: source?.Name,
      email: reportPreferred(source?.Email__c, source?.Practice_Name__r?.Business_Email__c),
      phone: reportPreferred(source?.Phone__c, source?.Practice_Name__r?.Business_Phone__c),
    }))
    .filter((provider) => Boolean(provider.id) || Boolean(provider.name));
}
function familyFor(opp: Opportunity, data: StructuredCollection): ReportFamilyContact[] {
  // Map matches the original last-write contact lookup; primary and role rows are not deduplicated.
  const primary = new Map(data.contacts.map((contact) => [contact.Id, contact])).get(
    opp.ContactId ?? ''
  );
  const contacts: ReportFamilyContact[] = primary
    ? [
        {
          id: primary.Id,
          name: primary.Name,
          email: primary.Email,
          phone: reportPreferred(primary.MobilePhone, primary.Phone),
          primary: true,
        },
      ]
    : [];
  return [
    ...contacts,
    ...data.contactRoles
      .filter((row) => row.OpportunityId === opp.Id)
      .map((row) => ({
        id: row.ContactId,
        name: row.Contact?.Name,
        email: row.Contact?.Email,
        phone: reportPreferred(row.Contact?.MobilePhone, row.Contact?.Phone),
        primary: Boolean(row.IsPrimary),
        role: row.Role,
      })),
  ];
}
export function reportIdentityBase(
  opp: Opportunity,
  data: StructuredCollection
): ReportIdentityBase {
  const history = data.opportunityHistory.filter((row) => row.OpportunityId === opp.Id);
  const registry = clientIdentityAliasesFor({
    opportunityId: opp.Id,
    opportunityName: opp.Name,
    practiceId: opp.Headstart_Practice__c,
  });
  const priorCsms = [
    ...new Set(
      history
        .filter((row) => row.Field === 'CSM__c')
        .flatMap((row) => [reportClean(row.OldValue), reportClean(row.NewValue)])
        .filter((value) => Boolean(value) && value !== opp.CSM__c)
    ),
  ];
  const familyContacts = familyFor(opp, data);
  const auths = data.authorizations.filter((row) => row.Client_Opportunity_Record__c === opp.Id);
  const vobs = data.vobs.filter((row) => row.Client_Opportunity__c === opp.Id);
  const rbts = data.rbtRequests.filter((row) => row.Client_Opportunity__c === opp.Id);
  const matches = rbts.flatMap((request) =>
    data.ticketMatches.filter((match) => match.RBT_Request__c === request.Id)
  );
  const currentCsm = new Map(
    data.csmUsers.map((user) => [reportClean(user.Name).toLowerCase(), user])
  ).get(reportClean(opp.CSM__c).toLowerCase());
  return {
    opportunityId: opp.Id,
    opportunityName: opp.Name,
    slaId: opp.Current_SLA__c,
    stage: opp.StageName,
    stageEntryDate: resolveStageEntryDate({ opportunity: opp, stageHistory: history }),
    slaCreatedDate: reportPreferred(opp.Current_SLA__r?.CreatedDate, null) ?? null,
    knownNameVariants: [
      ...new Set([
        ...buildNameVariants(opp.Name),
        ...registry.aliases.flatMap((alias) => {
          const normalized = normalizeRosterValue(alias);
          return [normalized, normalized.replace(/\s+/g, '')];
        }),
      ]),
    ],
    clientAliases: registry.aliases,
    clientAliasRegistryVersion: registry.registryVersion,
    clientAliasRegistryMatchCount: registry.registryMatchCount,
    clientAliasEvidence: registry.evidence,
    searchVernacular: stageSearchVernacular(opp.StageName ?? ''),
    practice: {
      id: opp.Headstart_Practice__c,
      name: opp.Headstart_Practice__r.Name,
      email: opp.Headstart_Practice__r.Business_Email__c,
      phone: opp.Headstart_Practice__r.Business_Phone__c,
    },
    providers: providersFor(opp),
    currentCsm: {
      name: opp.CSM__c,
      email: reportText(currentCsm?.Email),
      userId: reportText(currentCsm?.Id),
    },
    priorCsms,
    familyContacts,
    familyPhones: identityStrings([
      opp.Phone__c,
      ...familyContacts.map((contact) => contact.phone),
    ]),
    authorizationNumbers: identityStrings(auths.map((row) => row.Authorization_Number__c)),
    payers: identityStrings([
      ...vobs.map((row) => row.Payor__r?.Name),
      ...auths.flatMap((row) => [row.Payor_Name__r?.Name, row.Client_Insurance__c]),
    ]),
    rbtRequests: rbts.map((row) => ({
      id: row.Id,
      name: row.Name,
      assignedRbt: row.RBT_Assigned__r?.Name,
      startDate: row.RBT_Start_Date__c,
    })),
    candidates: matches.map((row) => ({
      id: row.Candidate__c,
      name: row.Candidate__r?.Name,
      status: reportPreferred(row.Ticket_Match_Status__c, row.Candidate__r?.Applicant_Status__c),
    })),
    stageHistory: history.filter((row) => row.Field === 'StageName'),
  };
}
