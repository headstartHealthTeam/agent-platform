import type { ConversationProfile } from './conversation-match-types.js';
import {
  normalizeConversationValue as normalize,
  uniqueConversationValues as unique,
} from './conversation-name.js';

function digits(value = ''): string {
  return value.replace(/\D/g, '').slice(-10);
}
export function conversationProviderAnchors(profile: ConversationProfile): string[] {
  const practiceName =
    typeof profile.practice === 'object' ? profile.practice?.['name'] : undefined;
  return unique([
    practiceName,
    profile.practice,
    profile.practiceAliases,
    profile.providerNames,
    profile.providerEmails,
    profile.providerPhones,
    profile.providerRoles?.flatMap((provider) => [
      provider.primaryName,
      provider.primaryEmail,
      provider.names,
      provider.emails,
      provider.phones,
    ]),
    profile.providers?.flatMap((provider) => [
      provider.name,
      provider.email,
      provider.names,
      provider.emails,
      provider.phones,
    ]),
  ])
    .map(normalize)
    .filter((value) => value.length >= 3);
}
export function conversationContextAnchors(profile: ConversationProfile): string[] {
  return unique([
    profile.authorizationNumbers,
    profile.payers,
    profile.payer,
    profile.familyEmails,
    profile.rbtNames,
    profile.candidateNames,
    profile.rbtRequests?.flatMap((record) => [record.name, record.assignedRbt]),
    profile.candidates?.flatMap((record) => record.name),
  ])
    .map(normalize)
    .filter((value) => value.length >= 3);
}
export function conversationStageTerms(stage: string | null | undefined = ''): string[] {
  const value = normalize(stage);
  if (/ia approved|ia scheduled|ic scheduled|ic completed/.test(value))
    return [
      'initial assessment',
      'assessment',
      '97151',
      'schedule',
      'availability',
      'cancel',
      'reschedule',
    ];
  if (/97151|treatment plan/.test(value))
    return [
      'treatment plan',
      'tp',
      'clinical review',
      'signature',
      'edits',
      'submit',
      'provider capacity',
      'provider continue',
      'continue with headstart',
      'moving forward',
    ];
  if (/ia requested|ta requested/.test(value))
    return [
      'authorization',
      'payer',
      'denial',
      'appeal',
      'resubmit',
      'additional information',
      'sipa',
      'srs',
      'service order',
      'referral',
      'signature',
      'upload',
      'resend',
    ];
  if (/ta approved|97153|first day/.test(value))
    return ['rbt', 'staffing', 'candidate', 'interview', 'hire', 'start', '97153'];
  return [
    'intake',
    'provider',
    'family',
    'schedule',
    'next step',
    'initial assessment',
    'assessment',
    '97151',
    'treatment plan',
    'clinical review',
    'signature',
    'authorization',
    'payer',
    'denial',
    'rbt',
    'staffing',
    'candidate',
    'interview',
    'start',
    '97153',
  ];
}
export function conversationInStoryWindow(
  eventDate: string | null,
  storyStartDate: string | null,
  asOf: string | null
): boolean {
  if (!eventDate) return true;
  const value = new Date(eventDate).valueOf();
  const start = storyStartDate ? new Date(storyStartDate).valueOf() : null;
  const end = asOf
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(asOf) ? `${asOf}T23:59:59.999Z` : asOf).valueOf()
    : Date.now();
  if (!Number.isFinite(value)) return false;
  return (start === null || !Number.isFinite(start) || value >= start) && value <= end;
}
export function directConversationAnchor(
  text: string,
  profile: ConversationProfile,
  opportunityId: string | null | undefined,
  linkedOpportunityId: string | null
): string | null {
  const body = normalize(text);
  if (opportunityId && linkedOpportunityId === opportunityId) return 'Opportunity lookup';
  if (opportunityId && body.includes(normalize(opportunityId))) return 'Opportunity ID';
  const authorization = unique(profile.authorizationNumbers).find((value) =>
    body.includes(normalize(value))
  );
  const hasAuthorization = Boolean(authorization);
  if (hasAuthorization) return 'Authorization number';
  const bodyDigits = digits(text);
  const phones = unique(profile.familyPhones)
    .map((value) => digits(String(value)))
    .filter(Boolean);
  if (bodyDigits.length > 0 && phones.includes(bodyDigits)) return 'Family phone';
  return null;
}
