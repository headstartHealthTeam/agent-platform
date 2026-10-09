import { categoryForGate } from './gate-context.js';
import { addSpecificityIssue } from './specificity-pathways.js';
import type {
  SpecificityAudit,
  SpecificityInput,
  SpecificityIssue,
  SpecificityPacket,
} from './specificity-types.js';

function compact(value: unknown = ''): string {
  return String(value).replace(/\s+/g, ' ').trim();
}

function summaryIssues(
  packet: SpecificityPacket,
  category: string,
  summary: string,
  generated: string
): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];
  if (!packet.newestUpdate || /\bNo substantive .* update was found\b/i.test(summary))
    addSpecificityIssue(
      issues,
      'NO_CURRENT_SUBSTANTIVE_UPDATE',
      'No current substantive update was selected; run the stage-specific deep-search pathway before accepting outreach as the answer.',
      category
    );
  if (
    /requested additional information, but .*does not identify|a required (?:intake or payer )?document remains outstanding/i.test(
      summary
    )
  )
    addSpecificityIssue(
      issues,
      'UNNAMED_REQUIRED_ITEM',
      'A source says information or documentation is required but does not name the exact item.',
      category
    );
  if (/\b(?:because )?explanation\s*:|\bprovider action required\b/i.test(generated))
    addSpecificityIssue(
      issues,
      'RAW_PAYER_BOILERPLATE',
      'The generated update still contains payer boilerplate instead of an operational denial reason.',
      'insurance'
    );
  if (
    /\b(?:IA|TA|authorization) was denied\b/i.test(summary) &&
    /\b(?:denial basis .*not .*documented|because (?:other|the updated information has been reviewed)|does not meet p\w{2,8}y guidelines)\b/i.test(
      summary
    )
  )
    addSpecificityIssue(
      issues,
      'DENIAL_REASON_UNRESOLVED',
      'The update identifies a denial but still lacks a usable operational denial reason.',
      'insurance'
    );
  return issues;
}

function staffingIssues(packet: SpecificityPacket, summary: string): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];
  if (/screening, interview, or offer|staffing activity shows an active candidate/i.test(summary))
    addSpecificityIssue(
      issues,
      'GENERIC_RBT_STEP',
      'The update references a range of candidate stages instead of the exact candidate, status, and status date.',
      'rbt'
    );
  if (/\b(?:The linked candidate|Candidate reached|Candidate is)\b/i.test(summary))
    addSpecificityIssue(
      issues,
      'CANDIDATE_IDENTITY_MISSING',
      'A candidate record was found, but the candidate identity was not resolved.',
      'rbt'
    );
  const facts = packet.approvedFacts ?? [];
  if (
    ['rbt-candidate', 'rbt-lost'].includes(packet.structuredGateDetail?.factType ?? '') &&
    facts.some((fact) => Boolean(fact.candidateName) || Boolean(fact.candidateStep)) &&
    !facts
      .filter((fact) => Boolean(fact.candidateName))
      .some((fact) => summary.toLowerCase().includes(String(fact.candidateName).toLowerCase())) &&
    !/\bassigned\b/i.test(summary)
  )
    addSpecificityIssue(
      issues,
      'RBT_SPECIFIC_FACT_NOT_USED',
      'Candidate-level evidence exists but the short summary does not identify the applicable candidate.',
      'rbt'
    );
  return issues;
}

function currentPlanCompletion(packet: SpecificityPacket, summary: string): boolean {
  const newest = compact(packet.newestUpdate?.fact ?? packet.newestUpdate?.text ?? '');
  return (
    /treatment plan (?:is|reports?.*is) complete|ready to submit/i.test(summary) ||
    (['treatment-plan', 'clinical-review', 'payer-submission'].includes(
      packet.story?.currentGateIssueKey ?? ''
    ) &&
      /treatment plan (?:is|reports?.*is) complete|ready to submit/i.test(newest))
  );
}

export function auditRecommendationSpecificity({
  packet,
  recommendation,
}: SpecificityInput): SpecificityAudit {
  const category = categoryForGate({
    processPosition: packet.processPosition,
    unresolvedGate: packet.unresolvedGate,
  });
  const summary = compact(recommendation?.suggestedSlaSummary);
  const long = compact(recommendation?.operationalSummary);
  const issues = summaryIssues(packet, category, summary, `${summary} ${long}`);
  if (category === 'rbt') issues.push(...staffingIssues(packet, summary));
  if (
    category === 'treatmentPlan' &&
    currentPlanCompletion(packet, summary) &&
    !(packet.approvedFacts ?? []).some((fact) => fact.source === 'Clinical Quality')
  )
    addSpecificityIssue(
      issues,
      'CLINICAL_QUALITY_STATE_MISSING',
      'The provider reports the treatment plan is complete, but no Clinical Quality disposition was found.',
      'treatmentPlan'
    );
  if (packet.structuredGateDetail?.fact && /\bNo substantive .* update was found\b/i.test(summary))
    addSpecificityIssue(
      issues,
      'STRUCTURED_DETAIL_LOST_IN_SUMMARY',
      'A structured gate detail exists but was lost when the short summary fell back to generic language.',
      category,
      'Error'
    );
  const pathways = [
    ...new Map(issues.flatMap((issue) => issue.searchPathway).map((step) => [step, step])).values(),
  ];
  return { passed: issues.length === 0, requiresReview: issues.length > 0, issues, pathways };
}
