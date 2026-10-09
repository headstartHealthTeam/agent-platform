import { firefliesParticipantIdentities } from '@headstart-health/fireflies-data';
import type { FirefliesParticipantIdentity } from '@headstart-health/fireflies-data';

import type { DateValue } from './dates.js';
import type { ProviderIdentityCluster } from './provider-identity-types.js';
import { normalizeIdentityEmail, normalizeIdentityValue } from './provider-identity-values.js';

export interface ProviderMeetingIdentityEvidence {
  readonly [field: string]: unknown;
  readonly id?: string | null;
  readonly title?: string | null;
  readonly date?: DateValue;
  readonly organizers?: readonly string[] | null;
  readonly organizerEmails?: readonly string[] | null;
}
export interface ParticipantIdentityProposal {
  email: string;
  name: string | null;
  matchQuality: 'Direct' | 'Likely';
  meetingId: string | null;
  meetingTitle: string | null;
  meetingDate: DateValue;
  reason: string;
}
function emailDomain(value: string): string {
  return normalizeIdentityEmail(value).split('@')[1] ?? '';
}
function providerContext(
  cluster: ProviderIdentityCluster,
  meeting: ProviderMeetingIdentityEvidence
): boolean {
  const context = normalizeIdentityValue(
    [meeting.title, ...(meeting.organizers ?? []), ...(meeting.organizerEmails ?? [])]
      .filter(Boolean)
      .join(' ')
  );
  return [...cluster.names, ...cluster.practiceAliases, ...cluster.meetingAliases].some((anchor) =>
    context.includes(normalizeIdentityValue(anchor))
  );
}
function proposalEvidence(
  cluster: ProviderIdentityCluster,
  meeting: ProviderMeetingIdentityEvidence,
  participant: FirefliesParticipantIdentity,
  knownDomains: ReadonlySet<string>
): ParticipantIdentityProposal | null {
  const email = normalizeIdentityEmail(participant.email);
  if (email.length === 0 || email.endsWith('@headstart.health')) return null;
  const participantName = normalizeIdentityValue(participant.name);
  const exactName =
    participantName.length > 0 &&
    cluster.names.some((name) => normalizeIdentityValue(name) === participantName);
  if (!exactName && !knownDomains.has(emailDomain(email))) return null;
  return {
    email,
    name: participant.name || null,
    matchQuality: exactName ? 'Direct' : 'Likely',
    meetingId: meeting.id ?? null,
    meetingTitle: meeting.title ?? null,
    meetingDate: meeting.date ?? null,
    reason: exactName
      ? 'External participant name exactly matches the provider identity cluster.'
      : 'External participant domain matches a known provider or practice email and the meeting context matches the provider.',
  };
}
export function proposeFirefliesParticipantIdentities({
  cluster,
  meetings = [],
}: {
  readonly cluster: ProviderIdentityCluster;
  readonly meetings?: readonly ProviderMeetingIdentityEvidence[];
}): ParticipantIdentityProposal[] {
  const knownDomains = new Set(
    [...cluster.providerProfileEmails, ...cluster.contactEmails, ...cluster.businessEmails]
      .map(emailDomain)
      .filter(Boolean)
  );
  const proposals = new Map<string, ParticipantIdentityProposal>();
  for (const meeting of meetings) {
    if (!providerContext(cluster, meeting)) continue;
    for (const participant of firefliesParticipantIdentities(meeting)) {
      const evidence = proposalEvidence(cluster, meeting, participant, knownDomains);
      if (evidence === null) continue;
      const existing = proposals.get(evidence.email);
      if (existing === undefined || evidence.matchQuality === 'Direct')
        proposals.set(evidence.email, evidence);
    }
  }
  return [...proposals.values()];
}
