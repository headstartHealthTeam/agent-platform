import { currentNarrative, delayHistoryOmissions } from './delay-history.js';
import { narrativeSentenceCount } from './publication-narrative.js';
import {
  compactQualityText,
  futureMilestonePresentedAsCompleted,
  incompleteThought,
  qualityDateOnly,
  qualityRawLeakage,
  repeatedNarrativeFragment,
  startsWithUpdateDate,
  unresolvedSpecificity,
  vagueGeneratedLanguage,
} from './publication-quality-signals.js';
import type {
  DuplicateSummary,
  DuplicateSummaryRow,
  OperationalSummaryRow,
  PublicationQualityInput,
  PublicationQualityResult,
} from './publication-quality-types.js';

export function duplicateOperationalSummaries<TId = string, TName = string>(
  rows: readonly OperationalSummaryRow<TId, TName>[] = []
): DuplicateSummary<TId, TName>[] {
  const groups = new Map<string, DuplicateSummaryRow<TId, TName>[]>();
  for (const row of rows) {
    const summary = compactQualityText(row.operationalSummary);
    if (!summary) continue;
    const key = summary.toLowerCase();
    const prior = groups.get(key) ?? [];
    prior.push({
      opportunityId: row.opportunityId ?? '',
      opportunityName: row.opportunityName ?? '',
      operationalSummary: summary,
    });
    groups.set(key, prior);
  }
  return [...groups.values()]
    .filter(
      (group) =>
        new Set(group.map((row) => [row.opportunityId].find(Boolean) ?? row.opportunityName)).size >
        1
    )
    .map((group) => ({ operationalSummary: group[0]?.operationalSummary ?? '', rows: group }));
}

export function readyToCopyForEvidenceStatus(
  evidenceStatus: unknown
): 'Yes' | 'Blocked' | 'Review' {
  if (evidenceStatus === 'Complete') return 'Yes';
  if (evidenceStatus === 'Missing' || evidenceStatus === 'Blocked') return 'Blocked';
  return 'Review';
}

function narrativeIssues(input: PublicationQualityInput, short: string, long: string): string[] {
  const issues: string[] = [];
  if (!short) issues.push('Suggested SLA Summary is blank.');
  if (short.length > 254)
    issues.push(`Suggested SLA Summary is ${String(short.length)} characters; maximum is 254.`);
  if (!long) issues.push('In-Depth Summary is blank.');
  const count = narrativeSentenceCount(currentNarrative(input.operationalSummary));
  if (long && count < 4)
    issues.push(`In-Depth Summary contains ${String(count)} sentences; expected at least 4.`);
  if (delayHistoryOmissions(input.delayHistory, input.operationalSummary).length)
    issues.push('In-Depth Summary omits admitted delay-history evidence.');
  if (short && incompleteThought(short))
    issues.push('Suggested SLA Summary ends with an incomplete thought.');
  if (long && incompleteThought(long))
    issues.push('In-Depth Summary ends with an incomplete thought.');
  if (!startsWithUpdateDate(short, input.latestUpdateDate))
    issues.push('Suggested SLA Summary does not begin with the latest substantive update date.');
  if (
    repeatedNarrativeFragment(short) ||
    repeatedNarrativeFragment(currentNarrative(input.operationalSummary))
  )
    issues.push('Generated narrative repeats the same substantive clause.');
  if (qualityRawLeakage(short, long, input.rawEvidence))
    issues.push('Generated summary reproduces raw source text.');
  return issues;
}

function specificityIssues(input: PublicationQualityInput, short: string, long: string): string[] {
  const issues: string[] = [];
  if (input.unparsedAdmittedNote)
    issues.push(
      'A substantive human SLA note was admitted but did not produce a normalized evidence event.'
    );
  if (vagueGeneratedLanguage(short))
    issues.push(
      'Suggested SLA Summary uses vague or multi-option language instead of one committed operational update.'
    );
  if (vagueGeneratedLanguage(long))
    issues.push(
      'In-Depth Summary uses vague or multi-option language instead of a cohesive operational narrative.'
    );
  if (unresolvedSpecificity(short))
    issues.push(
      'Suggested SLA Summary contains unresolved source boilerplate or omits an available specific item.'
    );
  if (/\bAs of\s+As of\b/i.test(`${short} ${long}`))
    issues.push('Generated summary repeats the update-date phrase.');
  return issues;
}

function actionReadinessIssues(input: PublicationQualityInput): string[] {
  const issues: string[] = [];
  const action = compactQualityText(input.action);
  const owner = compactQualityText(input.actionOwner);
  if (input.actionType !== 'No Action' && (!action || !owner))
    issues.push('Actionable row requires both a Suggested Action and one Action Owner.');
  if (input.actionType !== 'No Action' && action && incompleteThought(action))
    issues.push('Suggested Action ends with an incomplete thought.');
  const hasFollowUp = Boolean(input.followUpDate);
  if (hasFollowUp && !qualityDateOnly(input.followUpDate))
    issues.push('Suggested Follow-Up Date is invalid.');
  if (input.readyToCopy === 'Yes' && input.evidenceStatus !== 'Complete')
    issues.push('Ready to Copy cannot be Yes unless Evidence Status is Complete.');
  if (input.readyToCopy === 'Yes' && input.conflicts?.length)
    issues.push('Ready to Copy cannot be Yes while material evidence conflicts remain.');
  if (input.readyToCopy === 'Yes' && compactQualityText(input.identityConflict))
    issues.push('Ready to Copy cannot be Yes while an identity match conflict remains.');
  return issues;
}

export function validatePublicationRow(input: PublicationQualityInput): PublicationQualityResult {
  const short = compactQualityText(input.summary);
  const long = compactQualityText(input.operationalSummary);
  const issues = [
    ...narrativeIssues(input, short, long),
    ...specificityIssues(input, short, long),
    ...actionReadinessIssues(input),
  ];
  const asOf = input.asOf === undefined ? new Date() : input.asOf;
  if (
    futureMilestonePresentedAsCompleted({
      summary: short,
      operationalSummary: currentNarrative(input.operationalSummary),
      futureMilestoneDates: input.futureMilestoneDates ?? [],
      asOf,
    })
  )
    issues.push('A future milestone is described as already completed.');
  return { valid: issues.length === 0, issues };
}
