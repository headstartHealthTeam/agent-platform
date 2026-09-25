import { captureProperty } from './google-capture-property.js';
import { denialContextRequirements } from './slack-denial-requirements.js';
import type {
  DenialContextRequirement,
  DenialRequirementInputs,
} from './slack-denial-requirements.js';

export interface SlackSweepPlan {
  readonly generatedAt: unknown;
  readonly runId: unknown;
  readonly sourceCutoff: string;
  readonly opportunityCount: number;
  readonly queryCount: number;
  readonly scope: string[];
  readonly targets: {
    opportunityId: string;
    opportunityName: unknown;
    opportunityUrl: string;
    stage: unknown;
    searchWindow: DenialRequirementInputs['profiles'][number]['searchWindow'];
    denialContext: DenialContextRequirement;
    queries: { tier: string; label: string; query: string }[];
    retrievalContract: {
      tool: string;
      channelTypes: string;
      sort: string;
      sortDirection: string;
      pageUntilCursorExhausted: boolean;
      retrieveIndividualMessages: boolean;
      expandCurrentStoryThreads: boolean;
      retainWeakMatchesForAuditOnly: boolean;
    };
  }[];
}
function stringValue(value: unknown): string {
  return String(value);
}

function quoted(value: unknown = ''): string {
  return `"${String(value).replaceAll('"', '').trim()}"`;
}
function datedQuery(
  term: string,
  from: string | null | undefined,
  to: string | null | undefined
): string {
  const end = to ? new Date(`${to}T00:00:00Z`) : null;
  if (end !== null) end.setUTCDate(end.getUTCDate() + 1);
  return [
    term,
    from ? `after:${from}` : '',
    end === null ? '' : `before:${end.toISOString().slice(0, 10)}`,
  ]
    .filter(Boolean)
    .join(' ');
}
/** Intake selects identity/denial queries; Slack response mechanics remain in slack-data. */
export function buildSlackSweepPlan(
  inputs: DenialRequirementInputs,
  runId: unknown,
  generatedAt: unknown
): SlackSweepPlan {
  const denialById = new Map(
    denialContextRequirements(inputs).map((row) => [row.opportunityId, row])
  );
  const opportunityById = new Map(inputs.opportunities.map((row) => [row.Id, row]));
  const targets = inputs.profiles.map((profile) => {
    const opportunity = opportunityById.get(profile.opportunityId);
    const from = profile.searchWindow?.fromDate;
    const to = profile.searchWindow?.toDate;
    const numbers = [
      ...(profile.authorizationNumbers ?? []),
      ...(profile.searchPathways?.directIdentifiers?.authorizationNumbers ?? []),
    ]
      .filter(Boolean)
      .map((value) => {
        if (typeof value !== 'string')
          throw new TypeError('Authorization number must support string matching');
        return value;
      })
      .filter(
        (value, index, all) =>
          all.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index
      );
    const stage = opportunity?.StageName ?? captureProperty(profile, 'stage') ?? '';
    const denialContext = denialById.get(profile.opportunityId);
    if (denialContext === undefined) throw new Error('Missing denial-context cohort member');
    const hasName = Boolean(profile.opportunityName);
    const queries = [
      ...(hasName
        ? [
            {
              tier: 'Direct',
              label: 'Exact client name',
              query: datedQuery(quoted(profile.opportunityName), from, to),
            },
          ]
        : []),
      ...denialContext.queries,
      {
        tier: 'Direct',
        label: 'Opportunity ID',
        query: datedQuery(profile.opportunityId, from, to),
      },
      ...(/^(?:IA|TA) Requested$|Treatment Plan In-review/i.test(stringValue(stage))
        ? numbers
        : []
      ).map((number) => ({
        tier: 'Context',
        label: 'Authorization number',
        query: datedQuery(quoted(number), from, to),
      })),
    ];
    return {
      opportunityId: profile.opportunityId,
      opportunityName: profile.opportunityName,
      opportunityUrl: `https://headstart-health.lightning.force.com/lightning/r/Opportunity/${profile.opportunityId}/view`,
      stage,
      searchWindow: profile.searchWindow ?? null,
      denialContext,
      queries,
      retrievalContract: {
        tool: 'slack_search_public_and_private',
        channelTypes: 'public_channel,private_channel,mpim,im',
        sort: 'timestamp',
        sortDirection: 'desc',
        pageUntilCursorExhausted: true,
        retrieveIndividualMessages: true,
        expandCurrentStoryThreads: true,
        retainWeakMatchesForAuditOnly: true,
      },
    };
  });
  return {
    generatedAt,
    runId,
    sourceCutoff: inputs.asOf,
    opportunityCount: targets.length,
    queryCount: targets.reduce((count, target) => count + target.queries.length, 0),
    scope: ['public channels', 'private channels', 'group DMs', 'DMs'],
    targets,
  };
}
