import type { GateContext } from './gate-context.js';
import { sourceHtmlText } from './source-html-text.js';
import type {
  TaskEvidenceProfile,
  TaskEvidenceRecord,
  TaskIdentityAssessment,
} from './task-evidence-types.js';
import { assessTextMatch } from './text-match.js';

export function taskIdentityAssessment(
  record: TaskEvidenceRecord,
  profile: TaskEvidenceProfile,
  gate: GateContext
): TaskIdentityAssessment {
  const whatId = record.WhatId ?? record.OpportunityId ?? '';
  const known = new Set(
    [profile.opportunityId, ...(profile.salesforceRecordIds ?? [])].filter(Boolean)
  );
  if (!whatId || known.has(whatId)) return { quality: 'Direct', assumedIdentityMatch: false };
  if (/^006/i.test(whatId))
    return { quality: 'Weak', rejected: true, reason: 'Linked to another Opportunity' };
  const text = sourceHtmlText(
    `${record.Subject ?? record.TaskSubject ?? ''} ${record.Description ?? record.TaskDescription ?? ''}`
  );
  const practice =
    typeof profile.practice === 'object' && profile.practice !== null
      ? (profile.practice['name'] ?? profile.practice)
      : profile.practice;
  const sourceContext = [
    practice,
    ...(profile.practiceAliases ?? []),
    ...(profile.providerNames ?? []),
    ...(profile.csmNames ?? []),
  ]
    .filter(Boolean)
    .map((value: unknown) => String(value))
    .join(' ');
  const match = assessTextMatch({
    text,
    sourceContext,
    identity: {
      authorizationNumbers: [],
      familyPhones: [],
      familyEmails: [],
      clientAliases: [],
      providerRoster: [],
      practiceAliases: [],
      csmNames: [],
      csmEmails: [],
      ...profile,
    },
    stage: profile.stage ?? gate.processPosition ?? gate.unresolvedGate,
    competingClientNames: (profile.providerRoster ?? [])
      .filter((candidate) => candidate.opportunityId !== profile.opportunityId)
      .map((candidate) => candidate.opportunityName ?? ''),
  });
  return { ...match, rejected: !['Direct', 'Likely'].includes(match.quality) };
}
